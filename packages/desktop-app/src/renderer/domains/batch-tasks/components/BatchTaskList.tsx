import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import type { BatchProject, BatchTask } from "@shared/store/atoms";
import { batchQueuedTaskIdsAtom, confirmDialogAtom, openSessionFnRef } from "@shared/store/atoms";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { useBatchTasks } from "../hooks/useBatchTasks";

/**
 * How many task cards a project shows before the user clicks "展开更多".
 * 3 列 × 3 行 = 9，对应用户要求；超过则折叠。
 */
const TASK_COLLAPSE_THRESHOLD = 9;

/**
 * 子任务排序：运行中 > 已暂停 > 其他，组内按 createdAt latest（新创建在前）。
 * 项目级排序使用「任意 task 在 running/paused」作为近似 — 最近活动的项目靠前。
 */
function taskSortRank(status: BatchTask["status"]): number {
	if (status === "running") return 2;
	if (status === "paused") return 1;
	return 0;
}

function sortTasks(tasks: BatchTask[]): BatchTask[] {
	return [...tasks].sort((a, b) => {
		const rankDiff = taskSortRank(b.status) - taskSortRank(a.status);
		if (rankDiff !== 0) return rankDiff;
		return b.createdAt - a.createdAt;
	});
}

function sortProjects(projects: BatchProject[]): BatchProject[] {
	return [...projects].sort((a, b) => {
		const aRun = a.tasks.some((t) => t.status === "running" || t.status === "paused") ? 1 : 0;
		const bRun = b.tasks.some((t) => t.status === "running" || t.status === "paused") ? 1 : 0;
		if (aRun !== bRun) return bRun - aRun;
		return b.createdAt - a.createdAt;
	});
}

interface BatchTaskListProps {
	projects: BatchProject[];
	onEditProject: (project: BatchProject) => void;
}

function relativeTime(timestamp: number, t: TFunction<"batch-tasks">): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return t("time.justNow");
	if (minutes < 60) return t("time.minutes", { n: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t("time.hours", { n: hours });
	const days = Math.floor(hours / 24);
	if (days < 7) return t("time.days", { n: days });
	return t("time.weeks", { n: Math.floor(days / 7) });
}

function statusLabel(status: BatchTask["status"], hasSession: boolean, t: TFunction<"batch-tasks">): string {
	if (status === "pending") {
		return hasSession ? t("status.waiting") : t("status.notRun");
	}
	const labels: Record<Exclude<BatchTask["status"], "pending">, string> = {
		running: t("status.running"),
		completed: t("status.completed"),
		failed: t("status.failed"),
		paused: t("status.paused"),
	};
	return labels[status];
}

const STATUS_TONE: Record<
	BatchTask["status"],
	{ dot: string; ring: string; text: string; bg: string }
> = {
	completed: {
		dot: "bg-emerald-500",
		ring: "ring-emerald-500/25",
		text: "text-emerald-400",
		bg: "bg-emerald-500/10",
	},
	running: {
		dot: "bg-emerald-500",
		ring: "ring-emerald-500/30",
		text: "text-emerald-400",
		bg: "bg-emerald-500/10",
	},
	failed: {
		dot: "bg-red-500",
		ring: "ring-red-500/30",
		text: "text-red-400",
		bg: "bg-red-500/10",
	},
	paused: {
		dot: "bg-sky-500",
		ring: "ring-sky-500/30",
		text: "text-sky-400",
		bg: "bg-sky-500/10",
	},
	pending: {
		dot: "bg-muted-foreground/40",
		ring: "ring-border/50",
		text: "text-muted-foreground/70",
		bg: "bg-muted/40",
	},
};

// 「等待中」（queued）的色调：使用琥珀色用以与「未执行」的灰色区分。
const QUEUED_TONE = {
	dot: "bg-amber-500",
	ring: "ring-amber-500/30",
	text: "text-amber-400",
	bg: "bg-amber-500/10",
};

// ─── Counts ────────────────────────────────────────────────────────────────
//
// Counting statuses for a 240-task project five separate times per render
// added up to 1200 comparisons; collapsing them into one pass and memoizing
// keeps the project header cheap while still re-running when tasks change.

interface ProjectCounts {
	failed: number;
	running: number;
	completed: number;
	paused: number;
	neverExecuted: number;
	total: number;
}

function computeCounts(tasks: BatchTask[]): ProjectCounts {
	let failed = 0;
	let running = 0;
	let completed = 0;
	let paused = 0;
	let neverExecuted = 0;
	for (const t of tasks) {
		switch (t.status) {
			case "failed":
				failed++;
				break;
			case "running":
				running++;
				break;
			case "completed":
				completed++;
				break;
			case "paused":
				paused++;
				break;
			case "pending":
				if (!t.sessionId) neverExecuted++;
				break;
		}
	}
	return { failed, running, completed, paused, neverExecuted, total: tasks.length };
}

// ─── Task action callback contract ─────────────────────────────────────────
//
// Hoisting the per-task action handlers up to the project block so the leaf
// component can be `React.memo`'d on a stable identity. The card itself only
// receives task + project id + a single fn bag; that fn bag is the same
// reference across renders so memoization actually pays off when 239 sibling
// tasks change state under a parallel worker.

interface TaskCallbacks {
	goToSession: (task: BatchTask) => void;
	run: (taskId: string) => void;
	retry: (task: BatchTask) => void;
	stop: (taskId: string) => void;
	resume: (taskId: string) => void;
	delete: (task: BatchTask) => void;
}

// ─── BatchTaskList ─────────────────────────────────────────────────────────

export function BatchTaskList({ projects, onEditProject }: BatchTaskListProps): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const setConfirm = useSetAtom(confirmDialogAtom);
	const queuedTaskIds = useAtomValue(batchQueuedTaskIdsAtom);
	const {
		runTask,
		retryTask,
		stopTask,
		resumeTask,
		deleteTask,
		batchStart,
		batchStop,
		batchReset,
		batchResetFailed,
		deleteProject,
	} = useBatchTasks();

	const handleDeleteProject = (project: BatchProject) => {
		const runningCount = project.tasks.filter((t) => t.status === "running").length;
		if (runningCount > 0) {
			setConfirm({
				title: t("confirm.cannotDeleteTitle"),
				message: t("confirm.cannotDeleteMsg"),
				confirmLabel: t("confirm.ok"),
				onConfirm: () => {},
			});
			return;
		}
		setConfirm({
			title: t("confirm.deleteProjectTitle", { name: project.name }),
			message: t("confirm.deleteProjectMsg"),
			confirmLabel: t("confirm.delete"),
			cancelLabel: t("confirm.cancel"),
			variant: "danger",
			onConfirm: async () => {
				await deleteProject(project.id);
			},
		});
	};

	const handleBatchStart = (project: BatchProject, counts: ProjectCounts) => {
		if (counts.neverExecuted === 0 && counts.paused === 0) return;
		const parts: string[] = [];
		if (counts.neverExecuted > 0) parts.push(t("confirm.partNeverExecuted", { n: counts.neverExecuted }));
		if (counts.paused > 0) parts.push(t("confirm.partPaused", { n: counts.paused }));
		setConfirm({
			title: t("confirm.startTitle"),
			message: t("confirm.startMsg", { parts: parts.join(t("confirm.partJoin")) }),
			confirmLabel: t("confirm.start"),
			onConfirm: async () => {
				await batchStart(project.id);
			},
		});
	};

	const handleBatchStop = (project: BatchProject, counts: ProjectCounts) => {
		const targetCount = counts.total - counts.completed;
		if (targetCount === 0) return;
		setConfirm({
			title: t("confirm.stopTitle"),
			message: t("confirm.stopMsg", { running: counts.running, target: targetCount }),
			confirmLabel: t("confirm.stop"),
			cancelLabel: t("confirm.cancel"),
			variant: "danger",
			onConfirm: async () => {
				await batchStop(project.id);
			},
		});
	};

	const handleResetFailed = (project: BatchProject, counts: ProjectCounts) => {
		if (counts.failed === 0) return;
		// 快照：以点击瞬间前端可见的 failed 任务 ID 为准，避免与之后新失败的任务竞争。
		const failedIds = project.tasks.filter((t) => t.status === "failed").map((t) => t.id);
		if (failedIds.length === 0) return;
		const queueActive = project.tasks.some(
			(t) => t.status === "running" || queuedTaskIds.has(t.id),
		);
		const message = queueActive
			? t("confirm.resetFailedQueueActive", { n: failedIds.length })
			: t("confirm.resetFailedIdle", { n: failedIds.length });
		setConfirm({
			title: t("confirm.resetFailedTitle"),
			message,
			confirmLabel: t("confirm.reset"),
			cancelLabel: t("confirm.cancel"),
			variant: "danger",
			onConfirm: async () => {
				await batchResetFailed(project.id, failedIds);
			},
		});
	};

	const handleBatchReset = (project: BatchProject) => {
		setConfirm({
			title: t("confirm.resetTitle"),
			message: t("confirm.resetMsg", { n: project.tasks.length }),
			confirmLabel: t("confirm.reset"),
			cancelLabel: t("confirm.cancel"),
			variant: "danger",
			onConfirm: async () => {
				await batchReset(project.id);
			},
		});
	};

	const sortedProjects = useMemo(() => sortProjects(projects), [projects]);

	return (
		<div className="flex flex-col gap-6">
			{sortedProjects.map((project) => (
				<ProjectBlock
					key={project.id}
					project={project}
					onEditProject={onEditProject}
					onDeleteProject={handleDeleteProject}
					onBatchStart={handleBatchStart}
					onBatchStop={handleBatchStop}
					onBatchReset={handleBatchReset}
					onResetFailed={handleResetFailed}
					runTask={runTask}
					retryTask={retryTask}
					stopTask={stopTask}
					resumeTask={resumeTask}
					deleteTask={deleteTask}
					setConfirm={setConfirm}
				/>
			))}
		</div>
	);
}

// ─── Project block ─────────────────────────────────────────────────────────
//
// Each project owns its task grid. Pulling it into a named component lets us
// useMemo the 240-element callback bag once per project, so the leaf
// `TaskCard` (which is React.memo'd) doesn't get re-rendered for the other
// 239 siblings just because one of them transitioned state.

interface ProjectBlockProps {
	project: BatchProject;
	onEditProject: (project: BatchProject) => void;
	onDeleteProject: (project: BatchProject) => void;
	onBatchStart: (project: BatchProject, counts: ProjectCounts) => void;
	onBatchStop: (project: BatchProject, counts: ProjectCounts) => void;
	onBatchReset: (project: BatchProject) => void;
	onResetFailed: (project: BatchProject, counts: ProjectCounts) => void;
	runTask: (projectId: string, taskId: string) => Promise<void>;
	retryTask: (projectId: string, taskId: string) => Promise<void>;
	stopTask: (projectId: string, taskId: string) => Promise<void>;
	resumeTask: (projectId: string, taskId: string) => Promise<void>;
	deleteTask: (projectId: string, taskId: string) => Promise<void>;
	setConfirm: ReturnType<typeof useSetAtom<typeof confirmDialogAtom>>;
}

function ProjectBlock({
	project,
	onEditProject,
	onDeleteProject,
	onBatchStart,
	onBatchStop,
	onBatchReset,
	onResetFailed,
	runTask,
	retryTask,
	stopTask,
	resumeTask,
	deleteTask,
	setConfirm,
}: ProjectBlockProps): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const counts = useMemo(() => computeCounts(project.tasks), [project.tasks]);
	const narrow = useNarrowScreen();
	const progress = counts.total > 0 ? (counts.completed / counts.total) * 100 : 0;
	const [expanded, setExpanded] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const queuedTaskIds = useAtomValue(batchQueuedTaskIdsAtom);
	const normalizedQuery = searchQuery.trim().toLowerCase();
	const sortedTasks = useMemo(() => sortTasks(project.tasks), [project.tasks]);
	const filteredTasks = useMemo(
		() => (normalizedQuery ? sortedTasks.filter((t) => t.name.toLowerCase().includes(normalizedQuery)) : sortedTasks),
		[sortedTasks, normalizedQuery],
	);
	const filteredTotal = filteredTasks.length;
	// 搜索激活时强制展开，方便用户直接看到所有匹配项
	const collapsed = !normalizedQuery && !expanded && filteredTotal > TASK_COLLAPSE_THRESHOLD;
	const visibleTasks = collapsed ? filteredTasks.slice(0, TASK_COLLAPSE_THRESHOLD) : filteredTasks;
	const hiddenCount = filteredTotal - visibleTasks.length;

	const callbacks = useMemo<TaskCallbacks>(
		() => ({
			goToSession: (task) => {
				if (task.sessionPath && openSessionFnRef.current) {
					void openSessionFnRef.current(task.cwd, task.sessionPath, task.executionMode);
				}
			},
			run: (taskId) => {
				void runTask(project.id, taskId);
			},
			retry: (task) => {
				const isCompleted = task.status === "completed";
				setConfirm({
					title: isCompleted
						? t("confirm.rerunTitle", { name: task.name })
						: t("confirm.retryTitle", { name: task.name }),
					message: isCompleted ? t("confirm.rerunMsg") : t("confirm.retryMsg"),
					confirmLabel: isCompleted ? t("confirm.rerun") : t("confirm.retry"),
					cancelLabel: t("confirm.cancel"),
					variant: isCompleted ? undefined : "danger",
					onConfirm: async () => {
						await retryTask(project.id, task.id);
					},
				});
			},
			stop: (taskId) => {
				void stopTask(project.id, taskId);
			},
			resume: (taskId) => {
				void resumeTask(project.id, taskId);
			},
			delete: (task) => {
				if (task.status === "running") return;
				setConfirm({
					title: t("confirm.deleteTaskTitle"),
					message: t("confirm.deleteTaskMsg"),
					confirmLabel: t("confirm.delete"),
					cancelLabel: t("confirm.cancel"),
					variant: "danger",
					onConfirm: async () => {
						await deleteTask(project.id, task.id);
					},
				});
			},
		}),
		[project.id, runTask, retryTask, stopTask, resumeTask, deleteTask, setConfirm, t],
	);

	return (
		<div className="relative">
			{/* Project header */}
			<div className="flex items-center gap-3 pb-3">
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--folder-multiple-outline] h-[18px] w-[18px] text-primary" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
							{project.name}
						</h3>
						{/* 窄屏隐藏数量 badge，避免与标题/操作按钮互相挤压导致换行 */}
						{!narrow && (
							<span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-accent/50 px-2 text-[10px] text-muted-foreground/70">
								{normalizedQuery
									? t("list.matchCount", { filtered: filteredTotal, total: counts.total })
									: t("list.taskCount", { n: counts.total })}
							</span>
						)}
					</div>
					<p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground/60">
						<span>
							{t("list.completedOf", { completed: counts.completed, total: counts.total })}
							{counts.running > 0 && t("list.runningSuffix", { n: counts.running })}
							{counts.paused > 0 && t("list.pausedSuffix", { n: counts.paused })}
						</span>
						{counts.failed > 0 && (
							<>
								<span>·</span>
								<button
									type="button"
									onClick={() => onResetFailed(project, counts)}
									title={t("list.resetFailedHint", { n: counts.failed })}
									className="inline-flex h-4 items-center rounded-full bg-red-500/10 px-1.5 text-[10px] font-medium leading-none text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
								>
									{t("list.failedReset", { n: counts.failed })}
								</button>
							</>
						)}
					</p>
				</div>
				<div className="flex items-center gap-0.5">
					{(() => {
						// 「开始 / 停止」二合一 toggle：
						// 队列处于活动态（有 running 或 queued）→ 显示「停止」；
						// 否则 → 显示「开始」（同时覆盖未执行 + 已暂停，两类都可启动）。
						const hasQueued = project.tasks.some((t) => queuedTaskIds.has(t.id));
						const isActive = counts.running > 0 || hasQueued;
						return isActive ? (
							<ActionButton
								icon="icon-[mdi--stop]"
								title={t("actions.stop")}
								variant="danger"
								onClick={() => onBatchStop(project, counts)}
							/>
						) : (
							<ActionButton
								icon="icon-[mdi--play]"
								title={
									counts.neverExecuted === 0 && counts.paused === 0
										? counts.failed > 0
											? t("actions.allDoneOrFailed", { n: counts.failed })
											: t("actions.allDone")
										: t("actions.start")
								}
								onClick={() => onBatchStart(project, counts)}
								disabled={counts.neverExecuted === 0 && counts.paused === 0}
							/>
						);
					})()}
					<ActionButton
						icon="icon-[mdi--refresh]"
						title={t("actions.reset")}
						variant="danger"
						onClick={() => onBatchReset(project)}
						disabled={counts.total === 0}
					/>
					<div className="mx-1 h-4 w-px bg-border/60" />
					<ActionButton
						icon="icon-[mdi--pencil-outline]"
						title={t("actions.editProject")}
						onClick={() => onEditProject(project)}
					/>
					<ActionButton
						icon="icon-[mdi--delete-outline]"
						title={t("actions.deleteProject")}
						variant="danger"
						onClick={() => onDeleteProject(project)}
						disabled={counts.running > 0}
					/>
				</div>
			</div>

			{/* Progress bar — pure CSS width transition, no motion runtime cost */}
			<div className="pb-3">
				<div className="relative h-1 overflow-hidden rounded-full bg-accent/30">
					<div
						className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/80 transition-[width] duration-700 ease-out"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			{/* Task grid — plain divs, leaf is React.memo'd */}
			<div>
				{counts.total > 0 && (
					<div className="relative mb-3">
						<span className="icon-[mdi--magnify] pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={t("list.searchPlaceholder")}
							className="h-8 w-full rounded-lg border border-border/40 bg-card/30 pl-8 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-primary/40 focus:bg-card/50"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => setSearchQuery("")}
								title={t("list.clear")}
								className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
							>
								<span className="icon-[mdi--close] h-3 w-3" />
							</button>
						)}
					</div>
				)}
				{filteredTotal === 0 ? (
					<div className="flex flex-col items-center gap-1.5 py-6 text-center">
						<span className="icon-[mdi--magnify-close] h-5 w-5 text-muted-foreground/50" />
						<p className="text-[12px] text-muted-foreground/60">
							{normalizedQuery ? t("list.noMatch", { query: searchQuery }) : t("list.noTasks")}
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{visibleTasks.map((task) => (
							<TaskCard
								key={task.id}
								task={task}
								callbacks={callbacks}
								isQueued={queuedTaskIds.has(task.id)}
							/>
						))}
					</div>
				)}
				{!normalizedQuery && counts.total > TASK_COLLAPSE_THRESHOLD && (
					<div className="mt-3 flex justify-center">
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							className="flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-3 py-1 text-[11px] text-muted-foreground/80 transition-colors hover:border-primary/30 hover:text-foreground"
						>
							<span
								className={
									collapsed ? "icon-[mdi--chevron-down] h-3.5 w-3.5" : "icon-[mdi--chevron-up] h-3.5 w-3.5"
								}
							/>
							{collapsed ? t("list.expandMore", { n: hiddenCount }) : t("list.collapse")}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Task card (memoized leaf) ─────────────────────────────────────────────

const TaskCard = memo(function TaskCard({
	task,
	callbacks,
	isQueued,
}: {
	task: BatchTask;
	callbacks: TaskCallbacks;
	isQueued: boolean;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const tone = isQueued ? QUEUED_TONE : STATUS_TONE[task.status];
	const label = isQueued ? t("status.waiting") : statusLabel(task.status, !!task.sessionId, t);
	const [hovered, setHovered] = useState(false);
	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			className="relative flex flex-col gap-1 overflow-hidden rounded-lg bg-muted px-2.5 py-2 transition-colors duration-300 ease-out hover:bg-accent"
		>
			{/* 顶部：状态点 + 名称 + 状态 pill */}
			<div className="flex items-center gap-1.5">
				<div className="relative flex h-1.5 w-1.5 shrink-0">
					{task.status === "running" && !isQueued && (
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
					)}
					<span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
				</div>
				<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{task.name}</span>
				<span
					className={`inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[9px] font-medium leading-none ${tone.bg} ${tone.text}`}
				>
					{label}
				</span>
			</div>

			{/* 底部：仅时间（去掉路径） */}
			<div className="flex items-center text-[10px] text-muted-foreground/50">
				{task.sessionId ? (
					<span className="flex items-center gap-0.5">
						<span className="icon-[mdi--clock-outline] h-2.5 w-2.5" />
						{relativeTime(task.updatedAt, t)}
					</span>
				) : (
					<span className="text-muted-foreground/40">{t("status.notRun")}</span>
				)}
				{task.status === "failed" && task.error && (
					<span
						className="ml-auto flex max-w-[60%] items-center gap-0.5 truncate text-red-400/80"
						title={task.error}
					>
						<span className="icon-[mdi--alert-circle] h-2.5 w-2.5 shrink-0" />
						<span className="truncate">{task.error}</span>
					</span>
				)}
			</div>

			{/* hover 蒙层：motion 驱动的渐入渐出，操作按钮居中排列 */}
			<AnimatePresence>
				{hovered && (
					<motion.div
						key="overlay"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
						className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/75 backdrop-blur-[3px]"
					>
						{task.sessionPath && (
							<OverlayActionButton
								icon="icon-[mdi--open-in-new]"
								title={t("actions.goToSession")}
								delay={0}
								onClick={(e) => {
									e.stopPropagation();
									callbacks.goToSession(task);
								}}
							/>
						)}
						{isQueued ? (
							<OverlayActionButton
								icon="icon-[mdi--close]"
								title={t("actions.cancelWait")}
								variant="danger"
								delay={0.05}
								onClick={(e) => {
									e.stopPropagation();
									callbacks.stop(task.id);
								}}
							/>
						) : task.status === "pending" ? (
							<OverlayActionButton
								icon="icon-[mdi--play]"
								title={t("actions.run")}
								delay={0.05}
								onClick={(e) => {
									e.stopPropagation();
									callbacks.run(task.id);
								}}
							/>
						) : task.status === "paused" ? (
							<OverlayActionButton
								icon="icon-[mdi--play]"
								title={t("actions.resume")}
								delay={0.05}
								onClick={(e) => {
									e.stopPropagation();
									callbacks.resume(task.id);
								}}
							/>
						) : task.status === "failed" ? (
							<OverlayActionButton
								icon="icon-[mdi--restart]"
								title={t("actions.retry")}
								variant="danger"
								delay={0.05}
								onClick={(e) => {
									e.stopPropagation();
									callbacks.retry(task);
								}}
							/>
						) : task.status === "completed" ? (
							<OverlayActionButton
								icon="icon-[mdi--restart]"
								title={t("actions.rerun")}
								delay={0.05}
								onClick={(e) => {
									e.stopPropagation();
									callbacks.retry(task);
								}}
							/>
						) : null}
						{task.status !== "running" && (
							<OverlayActionButton
								icon="icon-[mdi--delete-outline]"
								title={t("actions.delete")}
								variant="danger"
								delay={0.1}
								onClick={(e) => {
									e.stopPropagation();
									callbacks.delete(task);
								}}
							/>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
});

// ─── Buttons ───────────────────────────────────────────────────────────────

function ActionButton({
	icon,
	title,
	variant,
	onClick,
	disabled,
}: {
	icon: string;
	title: string;
	variant?: "danger";
	onClick: () => void;
	disabled?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			title={title}
			className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
				disabled
					? "cursor-not-allowed text-muted-foreground/20"
					: variant === "danger"
						? "text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-400"
						: "text-muted-foreground/60 hover:bg-primary/10 hover:text-primary"
			}`}
		>
			<span className={`${icon} text-[14px]`} />
		</button>
	);
}

function OverlayActionButton({
	icon,
	title,
	variant,
	onClick,
	delay = 0,
}: {
	icon: string;
	title: string;
	variant?: "danger";
	onClick: (e: React.MouseEvent) => void;
	delay?: number;
}): JSX.Element {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			title={title}
			initial={{ opacity: 0, y: 6, scale: 0.85 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: 4, scale: 0.9 }}
			transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay }}
			whileHover={{ scale: 1.12 }}
			whileTap={{ scale: 0.92 }}
			className={`flex h-7 w-7 items-center justify-center rounded-full bg-card/90 ring-1 ring-inset ring-border/50 backdrop-blur-sm ${
				variant === "danger"
					? "text-muted-foreground hover:bg-red-500/15 hover:text-red-400 hover:ring-red-500/40"
					: "text-muted-foreground hover:bg-primary/15 hover:text-primary hover:ring-primary/40"
			}`}
		>
			<span className={`${icon} text-[13px]`} />
		</motion.button>
	);
}


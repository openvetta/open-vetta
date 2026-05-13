import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { BatchProject, BatchTask } from "@shared/store/atoms";
import { batchQueuedTaskIdsAtom, confirmDialogAtom, openSessionFnRef } from "@shared/store/atoms";
import { useBatchTasks } from "../hooks/useBatchTasks";

/**
 * How many task cards a project shows before the user clicks "展开更多".
 * Tuned to keep first-paint cheap when a project holds hundreds of subtasks;
 * collapsed state is per-project local UI state (no persistence — fresh
 * navigation always starts collapsed).
 */
const TASK_COLLAPSE_THRESHOLD = 6;

interface BatchTaskListProps {
	projects: BatchProject[];
	onEditProject: (project: BatchProject) => void;
}

function relativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days} 天`;
	return `${Math.floor(days / 7)} 周`;
}

function statusLabel(status: BatchTask["status"], hasSession: boolean): string {
	if (status === "pending") {
		return hasSession ? "等待中" : "未执行";
	}
	const labels: Record<Exclude<BatchTask["status"], "pending">, string> = {
		running: "运行中",
		paused: "已暂停",
		completed: "已完成",
		failed: "失败",
	};
	return labels[status];
}

const STATUS_TONE: Record<
	BatchTask["status"],
	{ dot: string; ring: string; text: string; bg: string }
> = {
	completed: {
		dot: "bg-emerald-500 shadow-[0_0_8px_var(--color-emerald-500,#10b981)]",
		ring: "ring-emerald-500/25",
		text: "text-emerald-400",
		bg: "bg-emerald-500/10",
	},
	running: {
		dot: "bg-emerald-500 shadow-[0_0_8px_var(--color-emerald-500,#10b981)]",
		ring: "ring-emerald-500/30",
		text: "text-emerald-400",
		bg: "bg-emerald-500/10",
	},
	failed: {
		dot: "bg-red-500 shadow-[0_0_8px_var(--color-red-500,#ef4444)]",
		ring: "ring-red-500/30",
		text: "text-red-400",
		bg: "bg-red-500/10",
	},
	paused: {
		dot: "bg-amber-500 shadow-[0_0_6px_var(--color-amber-500,#f59e0b)]",
		ring: "ring-amber-500/30",
		text: "text-amber-400",
		bg: "bg-amber-500/10",
	},
	pending: {
		dot: "bg-muted-foreground/40",
		ring: "ring-border/50",
		text: "text-muted-foreground/70",
		bg: "bg-muted/40",
	},
};

// ─── Counts ────────────────────────────────────────────────────────────────
//
// Counting statuses for a 240-task project five separate times per render
// added up to 1200 comparisons; collapsing them into one pass and memoizing
// keeps the project header cheap while still re-running when tasks change.

interface ProjectCounts {
	failed: number;
	running: number;
	paused: number;
	completed: number;
	neverExecuted: number;
	total: number;
}

type RetryFailedMode = "retry" | "clear-and-retry" | "clear-only";

function computeCounts(tasks: BatchTask[]): ProjectCounts {
	let failed = 0;
	let running = 0;
	let paused = 0;
	let completed = 0;
	let neverExecuted = 0;
	for (const t of tasks) {
		switch (t.status) {
			case "failed":
				failed++;
				break;
			case "running":
				running++;
				break;
			case "paused":
				paused++;
				break;
			case "completed":
				completed++;
				break;
			case "pending":
				if (!t.sessionId) neverExecuted++;
				break;
		}
	}
	return { failed, running, paused, completed, neverExecuted, total: tasks.length };
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
	pause: (task: BatchTask) => void;
	resume: (taskId: string) => void;
	delete: (task: BatchTask) => void;
}

// ─── BatchTaskList ─────────────────────────────────────────────────────────

export function BatchTaskList({ projects, onEditProject }: BatchTaskListProps): JSX.Element {
	const setConfirm = useSetAtom(confirmDialogAtom);
	const {
		runTask,
		retryTask,
		pauseTask,
		resumeTask,
		deleteTask,
		batchRetryFailed,
		batchClearFailedAndRetry,
		batchClearFailed,
		batchPause,
		batchResume,
		batchRunNeverExecuted,
		batchRestartAll,
		deleteProject,
	} = useBatchTasks();

	const handleDeleteProject = (project: BatchProject) => {
		const runningCount = project.tasks.filter((t) => t.status === "running").length;
		if (runningCount > 0) {
			setConfirm({
				title: "无法删除项目",
				message: "请先暂停所有任务后再删除。",
				confirmLabel: "确定",
				onConfirm: () => {},
			});
			return;
		}
		setConfirm({
			title: `确认删除项目「${project.name}」`,
			message: "删除后无法撤回，请确认是否继续。",
			confirmLabel: "删除",
			cancelLabel: "取消",
			variant: "danger",
			onConfirm: async () => {
				await deleteProject(project.id);
			},
		});
	};

	const handleBatchRetry = (project: BatchProject, counts: ProjectCounts, mode: RetryFailedMode) => {
		if (counts.failed === 0) return;
		if (mode === "retry") {
			setConfirm({
				title: "确认重试失败的任务",
				message: `将删除 ${counts.failed} 个失败任务的会话和文件，然后按并发数重新执行。排队中的任务在轮到前仍显示"失败"。此操作不可撤回，是否继续？`,
				confirmLabel: "重试",
				cancelLabel: "取消",
				variant: "danger",
				onConfirm: async () => {
					await batchRetryFailed(project.id);
				},
			});
			return;
		}
		if (mode === "clear-and-retry") {
			setConfirm({
				title: "确认清除失败状态并重试",
				message: `将先把 ${counts.failed} 个失败任务的会话和文件全部清空（状态立刻变为未执行），再按并发数重新执行。此操作不可撤回，是否继续？`,
				confirmLabel: "清除并重试",
				cancelLabel: "取消",
				variant: "danger",
				onConfirm: async () => {
					await batchClearFailedAndRetry(project.id);
				},
			});
			return;
		}
		setConfirm({
			title: "确认仅清除失败状态",
			message: `将把 ${counts.failed} 个失败任务的会话和文件全部清空，状态重置为未执行，但不会自动重新运行。此操作不可撤回，是否继续？`,
			confirmLabel: "清除",
			cancelLabel: "取消",
			variant: "danger",
			onConfirm: async () => {
				await batchClearFailed(project.id);
			},
		});
	};

	const handleBatchPause = (project: BatchProject, counts: ProjectCounts) => {
		if (counts.running === 0) return;
		setConfirm({
			title: "确认暂停所有任务",
			message: "正在运行的任务将暂停执行，是否继续？",
			confirmLabel: "暂停",
			onConfirm: async () => {
				await batchPause(project.id);
			},
		});
	};

	const handleBatchResume = async (project: BatchProject, counts: ProjectCounts) => {
		if (counts.paused === 0) return;
		await batchResume(project.id);
	};

	const handleBatchRunNeverExecuted = (project: BatchProject, counts: ProjectCounts) => {
		if (counts.neverExecuted === 0) return;
		setConfirm({
			title: "确认执行所有未执行的任务",
			message: `将执行 ${counts.neverExecuted} 个未执行的任务，是否继续？`,
			confirmLabel: "执行",
			onConfirm: async () => {
				await batchRunNeverExecuted(project.id);
			},
		});
	};

	const handleBatchRestartAll = (project: BatchProject) => {
		setConfirm({
			title: "确认全部重新开始",
			message: `将删除所有任务的会话和文件，然后重新执行全部 ${project.tasks.length} 个任务。此操作不可撤回，是否继续？`,
			confirmLabel: "全部重新开始",
			cancelLabel: "取消",
			variant: "danger",
			onConfirm: async () => {
				await batchRestartAll(project.id);
			},
		});
	};

	return (
		<div className="flex flex-col gap-5">
			{projects.map((project) => (
				<ProjectBlock
					key={project.id}
					project={project}
					onEditProject={onEditProject}
					onDeleteProject={handleDeleteProject}
					onBatchRetry={handleBatchRetry}
					onBatchPause={handleBatchPause}
					onBatchResume={handleBatchResume}
					onBatchRunNeverExecuted={handleBatchRunNeverExecuted}
					onBatchRestartAll={handleBatchRestartAll}
					runTask={runTask}
					retryTask={retryTask}
					pauseTask={pauseTask}
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
	onBatchRetry: (project: BatchProject, counts: ProjectCounts, mode: RetryFailedMode) => void;
	onBatchPause: (project: BatchProject, counts: ProjectCounts) => void;
	onBatchResume: (project: BatchProject, counts: ProjectCounts) => Promise<void>;
	onBatchRunNeverExecuted: (project: BatchProject, counts: ProjectCounts) => void;
	onBatchRestartAll: (project: BatchProject) => void;
	runTask: (projectId: string, taskId: string) => Promise<void>;
	retryTask: (projectId: string, taskId: string) => Promise<void>;
	pauseTask: (projectId: string, taskId: string) => Promise<void>;
	resumeTask: (projectId: string, taskId: string) => Promise<void>;
	deleteTask: (projectId: string, taskId: string) => Promise<void>;
	setConfirm: ReturnType<typeof useSetAtom<typeof confirmDialogAtom>>;
}

function ProjectBlock({
	project,
	onEditProject,
	onDeleteProject,
	onBatchRetry,
	onBatchPause,
	onBatchResume,
	onBatchRunNeverExecuted,
	onBatchRestartAll,
	runTask,
	retryTask,
	pauseTask,
	resumeTask,
	deleteTask,
	setConfirm,
}: ProjectBlockProps): JSX.Element {
	const counts = useMemo(() => computeCounts(project.tasks), [project.tasks]);
	const progress = counts.total > 0 ? (counts.completed / counts.total) * 100 : 0;
	const [expanded, setExpanded] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const queuedTaskIds = useAtomValue(batchQueuedTaskIdsAtom);
	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredTasks = useMemo(
		() =>
			normalizedQuery
				? project.tasks.filter((t) => t.name.toLowerCase().includes(normalizedQuery))
				: project.tasks,
		[project.tasks, normalizedQuery],
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
				setConfirm({
					title: `确认重试任务「${task.name}」`,
					message: "将删除该任务的会话和文件，然后重新执行。此操作不可撤回，是否继续？",
					confirmLabel: "重试",
					cancelLabel: "取消",
					variant: "danger",
					onConfirm: async () => {
						await retryTask(project.id, task.id);
					},
				});
			},
			pause: (task) => {
				setConfirm({
					title: "确认暂停任务",
					message: "任务将暂停执行，是否继续？",
					confirmLabel: "暂停",
					onConfirm: async () => {
						await pauseTask(project.id, task.id);
					},
				});
			},
			resume: (taskId) => {
				void resumeTask(project.id, taskId);
			},
			delete: (task) => {
				if (task.status === "running") return;
				setConfirm({
					title: "确认删除任务",
					message: "删除后无法撤回，请确认是否继续。",
					confirmLabel: "删除",
					cancelLabel: "取消",
					variant: "danger",
					onConfirm: async () => {
						await deleteTask(project.id, task.id);
					},
				});
			},
		}),
		[project.id, runTask, retryTask, pauseTask, resumeTask, deleteTask, setConfirm],
	);

	return (
		<div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/20 backdrop-blur-sm">
			{/* Top accent bar */}
			<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

			{/* Project header */}
			<div className="flex items-center gap-3 px-5 pt-5 pb-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--folder-multiple-outline] h-5 w-5 text-primary" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
							{project.name}
						</h3>
						<span className="inline-flex h-5 items-center rounded-full bg-accent/50 px-2 text-[10px] text-muted-foreground/70">
							{normalizedQuery
								? `${filteredTotal}/${counts.total} 匹配`
								: `${counts.total} 个任务`}
						</span>
					</div>
					<p className="mt-1 truncate text-[11px] text-muted-foreground/60">
						{counts.completed}/{counts.total} 已完成
						{counts.running > 0 && ` · ${counts.running} 运行中`}
						{counts.failed > 0 && ` · ${counts.failed} 失败`}
						{counts.paused > 0 && ` · ${counts.paused} 已暂停`}
					</p>
				</div>
				<div className="flex items-center gap-0.5">
					<ActionButton
						icon="icon-[mdi--rocket-launch-outline]"
						title="批量执行"
						onClick={() => onBatchRunNeverExecuted(project, counts)}
						disabled={counts.neverExecuted === 0}
					/>
					<ActionButton
						icon="icon-[mdi--play]"
						title="批量继续"
						onClick={() => void onBatchResume(project, counts)}
						disabled={counts.paused === 0}
					/>
					<RetryFailedDropdown
						disabled={counts.failed === 0}
						failedCount={counts.failed}
						onSelect={(mode) => onBatchRetry(project, counts, mode)}
					/>
					<ActionButton
						icon="icon-[mdi--pause]"
						title="批量暂停"
						onClick={() => onBatchPause(project, counts)}
						disabled={counts.running === 0}
					/>
					<ActionButton
						icon="icon-[mdi--refresh]"
						title="全部重新开始"
						variant="danger"
						onClick={() => onBatchRestartAll(project)}
						disabled={counts.total === 0}
					/>
					<div className="mx-1 h-4 w-px bg-border/60" />
					<ActionButton
						icon="icon-[mdi--pencil-outline]"
						title="编辑项目"
						onClick={() => onEditProject(project)}
					/>
					<ActionButton
						icon="icon-[mdi--delete-outline]"
						title="删除项目"
						variant="danger"
						onClick={() => onDeleteProject(project)}
						disabled={counts.running > 0}
					/>
				</div>
			</div>

			{/* Progress bar — pure CSS width transition, no motion runtime cost */}
			<div className="px-5 pb-4">
				<div className="relative h-1 overflow-hidden rounded-full bg-accent/30">
					<div
						className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/80 transition-[width] duration-700 ease-out"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			{/* Task grid — plain divs, leaf is React.memo'd */}
			<div className="border-t border-border/30 bg-background/30 px-5 py-4">
				{counts.total > 0 && (
					<div className="relative mb-3">
						<span className="icon-[mdi--magnify] pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="搜索任务标题…"
							className="h-8 w-full rounded-lg border border-border/40 bg-card/30 pl-8 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-primary/40 focus:bg-card/50"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => setSearchQuery("")}
								title="清除"
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
							{normalizedQuery ? `没有匹配「${searchQuery}」的任务` : "暂无任务"}
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
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
							{collapsed ? `展开更多（${hiddenCount}）` : "折叠任务"}
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
	const tone = isQueued ? STATUS_TONE.paused : STATUS_TONE[task.status];
	const label = isQueued ? "等待中" : statusLabel(task.status, !!task.sessionId);
	return (
		<div
			className={`group relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border/40 bg-card/40 p-3 ring-1 ring-inset ${tone.ring} transition-colors duration-200 hover:border-primary/30`}
		>
			{/* Top: status dot + name + status pill */}
			<div className="flex items-center gap-2">
				<div className="relative flex h-2 w-2 shrink-0">
					{task.status === "running" && !isQueued && (
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
					)}
					<span className={`relative inline-flex h-2 w-2 rounded-full ${tone.dot}`} />
				</div>
				<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
					{task.name}
				</span>
				<span
					className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-medium ${tone.bg} ${tone.text}`}
				>
					{label}
				</span>
			</div>

			{/* Source path */}
			<div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
				<span className="icon-[mdi--folder-outline] h-3 w-3 shrink-0" />
				<span className="truncate" title={task.sourcePath}>
					{task.sourcePath}
				</span>
			</div>

			{/* Failure error — native tooltip via title, no Radix mount cost */}
			{task.status === "failed" && task.error && (
				<div
					className="flex items-start gap-1.5 rounded-md bg-red-500/8 px-2 py-1.5 text-[11px] text-red-400"
					title={task.error}
				>
					<span className="icon-[mdi--alert-circle] mt-px h-3 w-3 shrink-0" />
					<span className="line-clamp-2 leading-snug">{task.error}</span>
				</div>
			)}

			{/* Footer */}
			<div className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/50">
				{task.sessionId ? (
					<span className="flex items-center gap-1">
						<span className="icon-[mdi--clock-outline] h-3 w-3" />
						{relativeTime(task.updatedAt)}
					</span>
				) : (
					<span className="text-muted-foreground/40">未执行</span>
				)}
				<div className="ml-auto flex items-center gap-1">
					{task.sessionPath && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								callbacks.goToSession(task);
							}}
							className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary"
							title="跳转到会话"
						>
							<span className="icon-[mdi--open-in-new] h-3 w-3" />
							会话
						</button>
					)}
					<div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
						{isQueued ? (
							<TaskActionButton
								icon="icon-[mdi--close]"
								title="取消等待"
								onClick={(e) => {
									e.stopPropagation();
									callbacks.pause(task);
								}}
							/>
						) : task.status === "pending" ? (
							<TaskActionButton
								icon="icon-[mdi--play]"
								title="执行"
								onClick={(e) => {
									e.stopPropagation();
									callbacks.run(task.id);
								}}
							/>
						) : task.status === "running" ? (
							<TaskActionButton
								icon="icon-[mdi--pause]"
								title="暂停"
								onClick={(e) => {
									e.stopPropagation();
									callbacks.pause(task);
								}}
							/>
						) : task.status === "paused" ? (
							<>
								<TaskActionButton
									icon="icon-[mdi--play]"
									title="继续"
									onClick={(e) => {
										e.stopPropagation();
										callbacks.resume(task.id);
									}}
								/>
								<TaskActionButton
									icon="icon-[mdi--restart]"
									title="重试"
									variant="danger"
									onClick={(e) => {
										e.stopPropagation();
										callbacks.retry(task);
									}}
								/>
							</>
						) : (
							<TaskActionButton
								icon="icon-[mdi--restart]"
								title="重试"
								variant="danger"
								onClick={(e) => {
									e.stopPropagation();
									callbacks.retry(task);
								}}
							/>
						)}
						{task.status !== "running" && (
							<TaskActionButton
								icon="icon-[mdi--delete-outline]"
								title="删除"
								variant="danger"
								onClick={(e) => {
									e.stopPropagation();
									callbacks.delete(task);
								}}
							/>
						)}
					</div>
				</div>
			</div>
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

function TaskActionButton({
	icon,
	title,
	variant,
	onClick,
}: {
	icon: string;
	title: string;
	variant?: "danger";
	onClick: (e: React.MouseEvent) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-150 ${
				variant === "danger"
					? "text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-400"
					: "text-muted-foreground/60 hover:bg-primary/10 hover:text-primary"
			}`}
		>
			<span className={`${icon} text-[12px]`} />
		</button>
	);
}

function RetryFailedDropdown({
	disabled,
	failedCount,
	onSelect,
}: {
	disabled: boolean;
	failedCount: number;
	onSelect: (mode: RetryFailedMode) => void;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	return (
		<div className="relative" ref={ref}>
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen((v) => !v)}
				title={failedCount > 0 ? `批量重试失败（${failedCount}）` : "批量重试失败"}
				className={`flex h-7 items-center gap-0.5 rounded-lg px-1.5 transition-colors duration-150 ${
					disabled
						? "cursor-not-allowed text-muted-foreground/20"
						: "text-muted-foreground/60 hover:bg-primary/10 hover:text-primary"
				}`}
			>
				<span className="icon-[mdi--restart] text-[14px]" />
				<span className="icon-[mdi--chevron-down] text-[10px]" />
			</button>
			{open && !disabled && (
				<div className="absolute right-0 top-full z-50 mt-1 w-[200px] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl">
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							onSelect("retry");
						}}
						className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-accent/50"
					>
						<span className="text-foreground">重试失败</span>
						<span className="text-[10px] text-muted-foreground/60">逐个清理后按并发数执行</span>
					</button>
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							onSelect("clear-and-retry");
						}}
						className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-accent/50"
					>
						<span className="text-foreground">清除失败状态并重试</span>
						<span className="text-[10px] text-muted-foreground/60">先全部重置为未执行，再按并发数执行</span>
					</button>
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							onSelect("clear-only");
						}}
						className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-accent/50"
					>
						<span className="text-foreground">仅清除失败状态</span>
						<span className="text-[10px] text-muted-foreground/60">重置为未执行并清除产物，不重新执行</span>
					</button>
				</div>
			)}
		</div>
	);
}

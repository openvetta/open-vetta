import { useEffect, useMemo, useState } from "react";
import { useAtomValue, useAtom } from "jotai";
import { motion } from "motion/react";
import { scheduledTasksAtom, selectedTaskIdAtom, formOpenAtom, projectsAtom } from "@shared/store/atoms";
import type { ScheduledTask } from "@shared/store/atoms";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { TaskList } from "./TaskList";
import { ExecutionHistory } from "./ExecutionHistory";
import { TaskFormDialog } from "./TaskForm";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function AutomationPage(): JSX.Element {
	const tasks = useAtomValue(scheduledTasksAtom);
	const projects = useAtomValue(projectsAtom);
	const [selectedTaskId, setSelectedTaskId] = useAtom(selectedTaskIdAtom);
	const [formEditingTask, setFormEditingTask] = useAtom(formOpenAtom);
	const { refreshTasks } = useScheduledTasks();
	const selectedTask = tasks.find((t) => t.id === selectedTaskId);

	const [dialogOpen, setDialogOpen] = useState(false);

	useEffect(() => {
		refreshTasks();
	}, [refreshTasks]);

	useEffect(() => {
		if (formEditingTask !== undefined) {
			setDialogOpen(true);
		}
	}, [formEditingTask]);

	const handleCloseDialog = () => {
		setDialogOpen(false);
		setFormEditingTask(undefined);
	};

	const handleNewTask = () => {
		setFormEditingTask(null);
		setDialogOpen(true);
	};

	const handleEditTask = (task: ScheduledTask) => {
		setFormEditingTask(task);
		setDialogOpen(true);
	};

	const noProjects = projects.length === 0;

	const stats = useMemo(() => {
		const total = tasks.length;
		const enabled = tasks.filter((t) => t.enabled).length;
		const succeeded = tasks.filter((t) => t.lastRunStatus === "success").length;
		const failed = tasks.filter((t) => t.lastRunStatus === "failed").length;
		return { total, enabled, succeeded, failed };
	}, [tasks]);

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Drag region */}
			<div className="drag-region h-12 shrink-0" />

			{/* ─── Header ─── */}
			<div className="relative shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<div className="mb-1 flex items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
								<span className="relative flex h-1.5 w-1.5">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
									<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
								</span>
								Automation
							</span>
						</div>
						<h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold leading-tight tracking-tight text-transparent">
							自动化
						</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">
							让 AI 按计划自动执行任务，解放双手
						</p>
					</motion.div>

					<motion.button
						type="button"
						onClick={handleNewTask}
						disabled={noProjects}
						title={noProjects ? "请先在侧边栏添加项目" : "新建定时任务"}
						initial={{ opacity: 0, y: -6, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ type: "spring", stiffness: 380, damping: 26, delay: 0.1 }}
						whileHover={{ scale: 1.04, y: -1 }}
						whileTap={{ scale: 0.96 }}
						className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary/85 px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)] transition-shadow hover:shadow-[0_12px_30px_-8px_var(--primary)] disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none"
					>
						<span className="icon-[mdi--plus] text-[15px]" />
						新建任务
					</motion.button>
				</div>

				{/* Stat strip */}
				{tasks.length > 0 && (
					<motion.div
						className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
						initial="hidden"
						animate="show"
						variants={{
							hidden: {},
							show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
						}}
					>
						<StatCard
							icon="icon-[mdi--clock-outline]"
							label="任务总数"
							value={stats.total}
							tint="primary"
						/>
						<StatCard
							icon="icon-[mdi--play-circle-outline]"
							label="运行中"
							value={stats.enabled}
							tint="emerald"
						/>
						<StatCard
							icon="icon-[mdi--check-circle-outline]"
							label="最近成功"
							value={stats.succeeded}
							tint="emerald"
						/>
						<StatCard
							icon="icon-[mdi--alert-circle-outline]"
							label="最近失败"
							value={stats.failed}
							tint="red"
						/>
					</motion.div>
				)}
			</div>

			{/* Divider */}
			<div className="mx-8 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

			{/* ─── Content ─── */}
			<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 pt-5 pb-6">
				{tasks.length === 0 ? (
					<EmptyState onNew={noProjects ? undefined : handleNewTask} noProjects={noProjects} />
				) : (
					<>
						<TaskList
							selectedTaskId={selectedTaskId}
							onSelectTask={(id) => setSelectedTaskId(selectedTaskId === id ? null : id)}
							onEditTask={handleEditTask}
						/>
						{selectedTask && (
							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.4, ease: easeOut }}
							>
								<ExecutionHistory taskId={selectedTask.id} />
							</motion.div>
						)}
					</>
				)}
			</div>

			<TaskFormDialog
				open={dialogOpen}
				task={formEditingTask ?? undefined}
				onClose={handleCloseDialog}
			/>
		</div>
	);
}

function StatCard({
	icon,
	label,
	value,
	tint,
}: {
	icon: string;
	label: string;
	value: number;
	tint: "primary" | "emerald" | "red";
}): JSX.Element {
	const tintClasses = {
		primary: {
			iconBg: "bg-primary/10 ring-primary/20",
			iconColor: "text-primary",
			value: "text-foreground",
		},
		emerald: {
			iconBg: "bg-emerald-500/10 ring-emerald-500/20",
			iconColor: "text-emerald-400",
			value: "text-foreground",
		},
		red: {
			iconBg: "bg-red-500/10 ring-red-500/20",
			iconColor: "text-red-400",
			value: "text-foreground",
		},
	}[tint];

	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 10, scale: 0.95 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 320, damping: 26 }}
			whileHover={{ y: -2 }}
			className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/40 bg-card/30 px-3.5 py-3 backdrop-blur-sm transition-colors duration-200 hover:border-primary/30"
		>
			<div
				className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${tintClasses.iconBg}`}
			>
				<span className={`${icon} h-4 w-4 ${tintClasses.iconColor}`} />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
					{label}
				</p>
				<p className={`mt-0.5 text-[20px] font-semibold leading-none tracking-tight ${tintClasses.value}`}>
					{value}
				</p>
			</div>
		</motion.div>
	);
}

function EmptyState({ onNew, noProjects }: { onNew?: () => void; noProjects: boolean }): JSX.Element {
	return (
		<motion.div
			className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: easeOut }}
		>
			<motion.div
				className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-inset ring-primary/20"
				animate={{ y: [0, -6, 0] }}
				transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
			>
				<span className="absolute inset-0 rounded-3xl bg-primary/10 blur-2xl" />
				<span className="icon-[mdi--clock-check-outline] relative text-4xl text-primary/80" />
			</motion.div>
			<div className="space-y-1.5">
				<p className="text-[15px] font-semibold text-foreground">
					{noProjects ? "请先添加项目" : "暂无定时任务"}
				</p>
				<p className="max-w-xs text-[12px] text-muted-foreground/60">
					{noProjects
						? "在侧边栏中添加项目后即可创建自动化任务"
						: "创建定时任务，让 AI 按计划自动执行"}
				</p>
			</div>
			{onNew && (
				<motion.button
					type="button"
					onClick={onNew}
					whileHover={{ scale: 1.04, y: -1 }}
					whileTap={{ scale: 0.96 }}
					className="mt-2 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary/85 px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-[0_10px_30px_-12px_var(--primary)]"
				>
					<span className="icon-[mdi--plus] text-[15px]" />
					创建第一个任务
				</motion.button>
			)}
		</motion.div>
	);
}

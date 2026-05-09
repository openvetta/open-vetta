import { useSetAtom } from "jotai";
import { motion } from "motion/react";
import type { BatchProject, BatchTask } from "@shared/store/atoms";
import { confirmDialogAtom, openSessionFnRef } from "@shared/store/atoms";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shared/components/ui/tooltip";
import { useBatchTasks } from "../hooks/useBatchTasks";

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

const easeOut = [0.22, 1, 0.36, 1] as const;

export function BatchTaskList({
	projects,
	onEditProject,
}: BatchTaskListProps): JSX.Element {
	const setConfirm = useSetAtom(confirmDialogAtom);
	const {
		runTask,
		retryTask,
		pauseTask,
		resumeTask,
		deleteTask,
		batchRetryFailed,
		batchPause,
		batchResume,
		batchDelete,
		batchRunNeverExecuted,
		batchRestartAll,
		deleteProject,
	} = useBatchTasks();

	const handleGoToSession = (task: BatchTask) => {
		if (task.sessionPath && openSessionFnRef.current) {
			void openSessionFnRef.current(task.cwd, task.sessionPath, task.executionMode);
		}
	};

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

	const handleRunTask = async (projectId: string, taskId: string) => {
		await runTask(projectId, taskId);
	};

	const handleRetryTask = (project: BatchProject, task: BatchTask) => {
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
	};

	const handlePauseTask = (project: BatchProject, task: BatchTask) => {
		setConfirm({
			title: "确认暂停任务",
			message: "任务将暂停执行，是否继续？",
			confirmLabel: "暂停",
			onConfirm: async () => {
				await pauseTask(project.id, task.id);
			},
		});
	};

	const handleResumeTask = async (projectId: string, taskId: string) => {
		await resumeTask(projectId, taskId);
	};

	const handleDeleteTask = (project: BatchProject, task: BatchTask) => {
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
	};

	const handleBatchRetry = (project: BatchProject) => {
		const failedCount = project.tasks.filter((t) => t.status === "failed").length;
		if (failedCount === 0) return;
		setConfirm({
			title: "确认重试失败的任务",
			message: `将删除 ${failedCount} 个失败任务的会话和文件，然后重新执行。此操作不可撤回，是否继续？`,
			confirmLabel: "重试",
			cancelLabel: "取消",
			variant: "danger",
			onConfirm: async () => {
				await batchRetryFailed(project.id);
			},
		});
	};

	const handleBatchPause = (project: BatchProject) => {
		const runningCount = project.tasks.filter((t) => t.status === "running").length;
		if (runningCount === 0) return;
		setConfirm({
			title: "确认暂停所有任务",
			message: "正在运行的任务将暂停执行，是否继续？",
			confirmLabel: "暂停",
			onConfirm: async () => {
				await batchPause(project.id);
			},
		});
	};

	const handleBatchResume = async (project: BatchProject) => {
		const pausedCount = project.tasks.filter((t) => t.status === "paused").length;
		if (pausedCount === 0) return;
		await batchResume(project.id);
	};

	const handleBatchRunNeverExecuted = (project: BatchProject) => {
		const neverExecutedCount = project.tasks.filter(
			(t) => t.status === "pending" && !t.sessionId,
		).length;
		if (neverExecutedCount === 0) return;
		setConfirm({
			title: "确认执行所有未执行的任务",
			message: `将执行 ${neverExecutedCount} 个未执行的任务，是否继续？`,
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

	const handleBatchDelete = (project: BatchProject) => {
		const runningCount = project.tasks.filter((t) => t.status === "running").length;
		if (runningCount > 0) {
			setConfirm({
				title: "无法删除任务",
				message: "请先暂停所有任务后再删除。",
				confirmLabel: "确定",
				onConfirm: () => {},
			});
			return;
		}
		setConfirm({
			title: "确认删除所有任务",
			message: "删除后无法撤回，请确认是否继续。",
			confirmLabel: "删除",
			cancelLabel: "取消",
			variant: "danger",
			onConfirm: async () => {
				await batchDelete(project.id);
			},
		});
	};

	return (
		<motion.div
			className="flex flex-col gap-5"
			initial="hidden"
			animate="show"
			variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
		>
			{projects.map((project) => {
				const failedCount = project.tasks.filter((t) => t.status === "failed").length;
				const runningCount = project.tasks.filter((t) => t.status === "running").length;
				const pausedCount = project.tasks.filter((t) => t.status === "paused").length;
				const completedCount = project.tasks.filter((t) => t.status === "completed").length;
				const neverExecutedCount = project.tasks.filter(
					(t) => t.status === "pending" && !t.sessionId,
				).length;
				const total = project.tasks.length;
				const progress = total > 0 ? (completedCount / total) * 100 : 0;

				return (
					<motion.div
						key={project.id}
						layout
						variants={{
							hidden: { opacity: 0, y: 14 },
							show: { opacity: 1, y: 0 },
						}}
						transition={{ type: "spring", stiffness: 280, damping: 26 }}
						className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/20 backdrop-blur-sm"
					>
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
										{total} 个任务
									</span>
								</div>
								<p className="mt-1 truncate text-[11px] text-muted-foreground/60">
									{completedCount}/{total} 已完成
									{runningCount > 0 && ` · ${runningCount} 运行中`}
									{failedCount > 0 && ` · ${failedCount} 失败`}
									{pausedCount > 0 && ` · ${pausedCount} 已暂停`}
								</p>
							</div>
							<div className="flex items-center gap-0.5">
								<ActionButton
									icon="icon-[mdi--rocket-launch-outline]"
									title="批量执行"
									onClick={() => handleBatchRunNeverExecuted(project)}
									disabled={neverExecutedCount === 0}
								/>
								<ActionButton
									icon="icon-[mdi--play]"
									title="批量继续"
									onClick={() => void handleBatchResume(project)}
									disabled={pausedCount === 0}
								/>
								<ActionButton
									icon="icon-[mdi--restart]"
									title="批量重试失败"
									onClick={() => handleBatchRetry(project)}
									disabled={failedCount === 0}
								/>
								<ActionButton
									icon="icon-[mdi--pause]"
									title="批量暂停"
									onClick={() => handleBatchPause(project)}
									disabled={runningCount === 0}
								/>
								<ActionButton
									icon="icon-[mdi--refresh]"
									title="全部重新开始"
									variant="danger"
									onClick={() => handleBatchRestartAll(project)}
									disabled={total === 0}
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
									onClick={() => handleDeleteProject(project)}
									disabled={runningCount > 0}
								/>
							</div>
						</div>

						{/* Progress bar */}
						<div className="px-5 pb-4">
							<div className="relative h-1 overflow-hidden rounded-full bg-accent/30">
								<motion.div
									className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/80"
									initial={{ width: 0 }}
									animate={{ width: `${progress}%` }}
									transition={{ duration: 0.7, ease: easeOut }}
								/>
								{runningCount > 0 && (
									<motion.div
										className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-primary/50 to-transparent"
										animate={{ x: ["-100%", "calc(100vw)"] }}
										transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
									/>
								)}
							</div>
						</div>

						{/* Task grid */}
						<div className="border-t border-border/30 bg-background/30 px-5 py-4">
							<motion.div
								className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3"
								initial="hidden"
								animate="show"
								variants={{
									hidden: {},
									show: { transition: { staggerChildren: 0.03 } },
								}}
							>
								{project.tasks.map((task) => {
									const tone = STATUS_TONE[task.status];
									return (
										<motion.div
											key={task.id}
											layout
											variants={{
												hidden: { opacity: 0, y: 8, scale: 0.97 },
												show: { opacity: 1, y: 0, scale: 1 },
											}}
											transition={{ type: "spring", stiffness: 340, damping: 26 }}
											whileHover={{ y: -2 }}
											className={`group relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border/40 bg-card/40 p-3 ring-1 ring-inset ${tone.ring} transition-colors duration-200 hover:border-primary/30`}
										>
											{/* Top: status dot + name + status pill */}
											<div className="flex items-center gap-2">
												<div className="relative flex h-2 w-2 shrink-0">
													{task.status === "running" && (
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
													{statusLabel(task.status, !!task.sessionId)}
												</span>
											</div>

											{/* Source path */}
											<div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
												<span className="icon-[mdi--folder-outline] h-3 w-3 shrink-0" />
												<span className="truncate" title={task.sourcePath}>
													{task.sourcePath}
												</span>
											</div>

											{/* Failure error */}
											{task.status === "failed" && task.error && (
												<Tooltip>
													<TooltipTrigger asChild>
														<div className="flex items-start gap-1.5 rounded-md bg-red-500/8 px-2 py-1.5 text-[11px] text-red-400">
															<span className="icon-[mdi--alert-circle] mt-px h-3 w-3 shrink-0" />
															<span className="line-clamp-2 leading-snug">{task.error}</span>
														</div>
													</TooltipTrigger>
													<TooltipContent>{task.error}</TooltipContent>
												</Tooltip>
											)}

											{/* Footer: time + actions */}
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
																handleGoToSession(task);
															}}
															className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary"
														>
															<span className="icon-[mdi--open-in-new] h-3 w-3" />
															会话
														</button>
													)}
													<div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
														{task.status === "pending" ? (
															<TaskActionButton
																icon="icon-[mdi--play]"
																title="执行"
																onClick={(e) => {
																	e.stopPropagation();
																	void handleRunTask(project.id, task.id);
																}}
															/>
														) : task.status === "running" ? (
															<TaskActionButton
																icon="icon-[mdi--pause]"
																title="暂停"
																onClick={(e) => {
																	e.stopPropagation();
																	handlePauseTask(project, task);
																}}
															/>
														) : task.status === "paused" ? (
															<>
																<TaskActionButton
																	icon="icon-[mdi--play]"
																	title="继续"
																	onClick={(e) => {
																		e.stopPropagation();
																		void handleResumeTask(project.id, task.id);
																	}}
																/>
																<TaskActionButton
																	icon="icon-[mdi--restart]"
																	title="重试"
																	variant="danger"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleRetryTask(project, task);
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
																	handleRetryTask(project, task);
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
																	handleDeleteTask(project, task);
																}}
															/>
														)}
													</div>
												</div>
											</div>
										</motion.div>
									);
								})}
							</motion.div>
						</div>
					</motion.div>
				);
			})}
		</motion.div>
	);
}

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
		<Tooltip>
			<TooltipTrigger asChild>
				<motion.button
					type="button"
					disabled={disabled}
					onClick={onClick}
					whileHover={!disabled ? { scale: 1.1 } : undefined}
					whileTap={!disabled ? { scale: 0.9 } : undefined}
					transition={{ type: "spring", stiffness: 400, damping: 22 }}
					className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
						disabled
							? "cursor-not-allowed text-muted-foreground/20"
							: variant === "danger"
								? "text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-400"
								: "text-muted-foreground/60 hover:bg-primary/10 hover:text-primary"
					}`}
				>
					<span className={`${icon} text-[14px]`} />
				</motion.button>
			</TooltipTrigger>
			<TooltipContent>{title}</TooltipContent>
		</Tooltip>
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
		<Tooltip>
			<TooltipTrigger asChild>
				<motion.button
					type="button"
					onClick={onClick}
					whileHover={{ scale: 1.12 }}
					whileTap={{ scale: 0.88 }}
					transition={{ type: "spring", stiffness: 400, damping: 22 }}
					className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-150 ${
						variant === "danger"
							? "text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-400"
							: "text-muted-foreground/60 hover:bg-primary/10 hover:text-primary"
					}`}
				>
					<span className={`${icon} text-[12px]`} />
				</motion.button>
			</TooltipTrigger>
			<TooltipContent>{title}</TooltipContent>
		</Tooltip>
	);
}

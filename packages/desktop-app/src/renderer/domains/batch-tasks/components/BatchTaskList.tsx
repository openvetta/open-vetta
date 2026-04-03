import { useSetAtom } from "jotai";
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

function truncateError(error: string, maxLength: number = 50): string {
	if (error.length <= maxLength) return error;
	return error.slice(0, maxLength) + "...";
}

export function BatchTaskList({
	projects,
	onEditProject,
}: BatchTaskListProps): JSX.Element {
	const setConfirm = useSetAtom(confirmDialogAtom);
	const { runTask, pauseTask, resumeTask, deleteTask, batchRetryFailed, batchPause, batchResume, batchDelete, batchRunNeverExecuted, deleteProject } =
		useBatchTasks();

	const handleGoToSession = (task: BatchTask) => {
		if (task.sessionPath && openSessionFnRef.current) {
			void openSessionFnRef.current(task.cwd, task.sessionPath);
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
			message: `将重新执行 ${failedCount} 个失败的任务，是否继续？`,
			confirmLabel: "重试",
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
		const neverExecutedCount = project.tasks.filter((t) => t.status === "pending" && !t.sessionId).length;
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
		<div className="flex flex-col gap-4">
			{projects.map((project) => {
				const failedCount = project.tasks.filter((t) => t.status === "failed").length;
				const runningCount = project.tasks.filter((t) => t.status === "running").length;
				const pausedCount = project.tasks.filter((t) => t.status === "paused").length;
				const neverExecutedCount = project.tasks.filter((t) => t.status === "pending" && !t.sessionId).length;
				return (
					<div key={project.id} className="rounded-xl border border-border p-4">
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="icon-[mdi--folder-outline] text-lg text-foreground" />
								<span className="font-medium text-foreground">{project.name}</span>
								<span className="text-xs text-muted-foreground/50">
									{project.tasks.length} 个任务
								</span>
							</div>
							<div className="flex items-center gap-1">
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
								<div className="mx-1 h-4 w-px bg-border" />
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

						<div className="space-y-2">
							{project.tasks.map((task) => {
								return (
									<div
										key={task.id}
										className="group cursor-pointer rounded-lg border border-border bg-transparent p-3 transition-all duration-200 hover:border-input hover:bg-accent/50"
									>
										<div className="flex items-center gap-3">
											<div className="relative flex h-2 w-2 shrink-0">
												<span
													className={`absolute inline-flex h-full w-full rounded-full ${
														task.status === "running" ? "animate-ping bg-green-400 opacity-50" : ""
													}`}
												/>
												<span
													className={`relative inline-flex h-2 w-2 rounded-full ${
														task.status === "completed"
															? "bg-green-500"
															: task.status === "running"
																? "bg-green-500"
																: task.status === "failed"
																	? "bg-red-500"
																	: task.status === "paused"
																		? "bg-yellow-500"
																		: "bg-muted-foreground/50"
													}`}
												/>
											</div>

											<span className="flex-1 truncate text-sm text-foreground">{task.name}</span>

											{task.sessionPath && (
												<button
													type="button"
													onClick={() => handleGoToSession(task)}
													className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
												>
													<span className="icon-[mdi--open-in-new] text-[12px]" />
													跳转到会话
												</button>
											)}

											{task.status === "failed" && task.error && (
												<Tooltip>
													<TooltipTrigger asChild>
														<div className="flex items-center gap-1 text-red-400">
															<span className="icon-[mdi--alert-circle] text-[12px]" />
															<span className="text-xs">{truncateError(task.error)}</span>
														</div>
													</TooltipTrigger>
													<TooltipContent>{task.error}</TooltipContent>
												</Tooltip>
											)}

											<span className="text-xs text-muted-foreground/50">
												{statusLabel(task.status, !!task.sessionId)}
											</span>

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
												) : task.status === "paused" || task.status === "completed" || task.status === "failed" ? (
													<TaskActionButton
														icon="icon-[mdi--restart]"
														title="重试"
														onClick={(e) => {
															e.stopPropagation();
															void handleRunTask(project.id, task.id);
														}}
													/>
												) : null}
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

										<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/50">
											<span className="flex items-center gap-1">
												<span className="icon-[mdi--folder-outline] text-[13px]" />
												<span className="max-w-[150px] truncate">{task.sourcePath}</span>
											</span>
											{task.sessionId ? (
												<span className="flex items-center gap-1">
													<span className="icon-[mdi--clock-outline] text-[13px]" />
													<span>上次执行 {relativeTime(task.updatedAt)}</span>
												</span>
											) : null}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
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
				<button
					type="button"
					disabled={disabled}
					onClick={onClick}
					className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 active:scale-90 ${
						disabled
							? "cursor-not-allowed text-muted-foreground/20"
							: variant === "danger"
								? "text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-400"
								: "text-muted-foreground/50 hover:bg-accent hover:text-foreground"
					}`}
				>
					<span className={`${icon} text-[14px]`} />
				</button>
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
				<button
					type="button"
					onClick={onClick}
					className={`flex h-6 w-6 items-center justify-center rounded-md transition-all duration-150 active:scale-90 ${
						variant === "danger"
							? "text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-400"
							: "text-muted-foreground/50 hover:bg-accent hover:text-foreground"
					}`}
				>
					<span className={`${icon} text-[12px]`} />
				</button>
			</TooltipTrigger>
			<TooltipContent>{title}</TooltipContent>
		</Tooltip>
	);
}

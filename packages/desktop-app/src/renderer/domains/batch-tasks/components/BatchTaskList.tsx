import { useAtom, useSetAtom } from "jotai";
import type { BatchProject, BatchTask } from "@shared/store/atoms";
import { confirmDialogAtom } from "@shared/store/atoms";

interface BatchTaskListProps {
	projects: BatchProject[];
	selectedTaskId: string | null;
	onSelectTask: (id: string | null) => void;
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

function statusLabel(status: BatchTask["status"]): string {
	const labels: Record<BatchTask["status"], string> = {
		pending: "等待中",
		running: "运行中",
		paused: "已暂停",
		completed: "已完成",
		failed: "失败",
	};
	return labels[status];
}

export function BatchTaskList({
	projects,
	selectedTaskId,
	onSelectTask,
	onEditProject,
}: BatchTaskListProps): JSX.Element {
	const setConfirm = useSetAtom(confirmDialogAtom);

	const handleDeleteProject = (project: BatchProject) => {
		setConfirm({
			title: `确认删除项目「${project.name}」`,
			message: "删除后无法撤回，请确认是否继续。",
			confirmLabel: "删除",
			cancelLabel: "取消",
			variant: "danger",
			onConfirm: () => {
				// TODO: implement delete
			},
		});
	};

	return (
		<div className="flex flex-col gap-4">
			{projects.map((project) => (
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
								icon="icon-[mdi--pencil-outline]"
								title="编辑项目"
								onClick={() => onEditProject(project)}
							/>
							<ActionButton
								icon="icon-[mdi--delete-outline]"
								title="删除项目"
								variant="danger"
								onClick={() => handleDeleteProject(project)}
							/>
						</div>
					</div>

					<div className="space-y-2">
						{project.tasks.map((task) => {
							const isSelected = selectedTaskId === task.id;
							return (
								<div
									key={task.id}
									onClick={() => onSelectTask(task.id)}
									className={`group cursor-pointer rounded-lg border p-3 transition-all duration-200 ${
										isSelected
											? "border-input bg-accent ring-1 ring-input"
											: "border-border bg-transparent hover:border-input hover:bg-accent/50"
									}`}
								>
									<div className="flex items-center gap-3">
										<div className="relative flex h-2 w-2 shrink-0">
											<span
												className={`absolute inline-flex h-full w-full rounded-full ${
													task.status === "running"
														? "animate-ping bg-green-400 opacity-50"
														: ""
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

										<span className="flex-1 truncate text-sm text-foreground">
											{task.name}
										</span>

										<span className="text-xs text-muted-foreground/50">
											{statusLabel(task.status)}
										</span>

										<div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
											<TaskActionButton
												icon="icon-[mdi--play]"
												title="执行"
												onClick={(e) => {
													e.stopPropagation();
													// TODO: implement run
												}}
											/>
											<TaskActionButton
												icon={
													task.status === "paused"
														? "icon-[mdi--play-outline]"
														: "icon-[mdi--pause]"
												}
												title={task.status === "paused" ? "继续" : "暂停"}
												onClick={(e) => {
													e.stopPropagation();
													// TODO: implement pause/resume
												}}
											/>
											<TaskActionButton
												icon="icon-[mdi--delete-outline]"
												title="删除"
												variant="danger"
												onClick={(e) => {
													e.stopPropagation();
													// TODO: implement delete task
												}}
											/>
										</div>
									</div>

									<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/50">
										<span className="flex items-center gap-1">
											<span className="icon-[mdi--folder-outline] text-[13px]" />
											<span className="max-w-[150px] truncate">{task.cwd}</span>
										</span>
										<span className="flex items-center gap-1">
											<span className="icon-[mdi--clock-outline] text-[13px]" />
											{relativeTime(task.updatedAt)}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

function ActionButton({
	icon,
	title,
	variant,
	onClick,
}: {
	icon: string;
	title: string;
	variant?: "danger";
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 active:scale-90 ${
				variant === "danger"
					? "text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-400"
					: "text-muted-foreground/50 hover:bg-accent hover:text-foreground"
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
			title={title}
			onClick={onClick}
			className={`flex h-6 w-6 items-center justify-center rounded-md transition-all duration-150 active:scale-90 ${
				variant === "danger"
					? "text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-400"
					: "text-muted-foreground/50 hover:bg-accent hover:text-foreground"
			}`}
		>
			<span className={`${icon} text-[12px]`} />
		</button>
	);
}

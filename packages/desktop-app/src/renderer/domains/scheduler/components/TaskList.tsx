import { useAtomValue, useSetAtom } from "jotai";
import { confirmDialogAtom, scheduledTasksAtom } from "@shared/store/atoms";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import type { ScheduledTask } from "@shared/store/atoms";
import { pathBasename } from "@shared/lib/utils";
import { describeSchedule, parseCronExpression } from "./schedule-picker/cron-utils";

interface TaskListProps {
	selectedTaskId: string | null;
	onSelectTask: (id: string | null) => void;
	onEditTask: (task: ScheduledTask) => void;
}

function projectName(cwd: string): string {
	return pathBasename(cwd);
}

function formatLastRun(timestamp: number | null): string {
	if (!timestamp) return "从未执行";
	const diff = Date.now() - timestamp;
	if (diff < 60000) return "刚刚";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
	return `${Math.floor(diff / 86400000)}天前`;
}

function scheduleLabel(task: ScheduledTask): string {
	const parsed = parseCronExpression(task.cron, task.isOnce);
	if (parsed) return describeSchedule(parsed);
	return task.cron;
}

export function TaskList({ selectedTaskId, onSelectTask, onEditTask }: TaskListProps): JSX.Element {
	const tasks = useAtomValue(scheduledTasksAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const { deleteTask, toggleTask, runNow } = useScheduledTasks();

	return (
		<div className="flex flex-col gap-2">
			{tasks.map((task) => {
				const isSelected = selectedTaskId === task.id;
				return (
					<div
						key={task.id}
						onClick={() => onSelectTask(task.id)}
						className={`group cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
							isSelected
								? "border-input bg-accent ring-1 ring-input"
								: "border-border bg-transparent hover:border-input hover:bg-accent/50"
						}`}
					>
						{/* ─── Top row: name + status + actions ─── */}
						<div className="flex items-center gap-3">
							{/* Status indicator */}
							<div className="relative flex h-2 w-2 shrink-0">
								<span
									className={`absolute inline-flex h-full w-full rounded-full ${
										task.enabled ? "animate-ping bg-green-400 opacity-50" : ""
									}`}
								/>
								<span
									className={`relative inline-flex h-2 w-2 rounded-full ${
										task.enabled ? "bg-green-500" : "bg-muted-foreground/50"
									}`}
								/>
							</div>

							{/* Task name */}
							<span className="flex-1 truncate text-sm font-medium text-foreground">
								{task.name}
							</span>

							{/* Actions — visible on hover or when selected */}
							<div
								className={`flex items-center gap-0.5 transition-opacity duration-150 ${
									isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
								}`}
							>
								<ActionButton
									icon="icon-[mdi--play]"
									title="立即执行"
									onClick={(e) => { e.stopPropagation(); runNow(task.id); }}
								/>
								<ActionButton
									icon={task.enabled ? "icon-[mdi--pause]" : "icon-[mdi--play-outline]"}
									title={task.enabled ? "暂停" : "启用"}
									onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
								/>
								<ActionButton
									icon="icon-[mdi--pencil-outline]"
									title="编辑"
									onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
								/>
								<ActionButton
									icon="icon-[mdi--delete-outline]"
									title="删除"
									variant="danger"
									onClick={(e) => {
										e.stopPropagation();
										setConfirmDialog({
											title: `确认删除任务「${task.name}」`,
											message: "删除后无法撤回，请确认是否继续。",
											confirmLabel: "删除",
											cancelLabel: "取消",
											variant: "danger",
											onConfirm: () => deleteTask(task.id),
										});
									}}
								/>
							</div>
						</div>

						{/* ─── Meta row ─── */}
						<div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/50">
							{task.cwd && (
								<span className="flex items-center gap-1">
									<span className="icon-[mdi--folder-outline] text-[13px]" />
									<span className="max-w-[120px] truncate">{projectName(task.cwd)}</span>
								</span>
							)}
							<span className="flex items-center gap-1">
								<span className="icon-[mdi--clock-outline] text-[13px]" />
								{scheduleLabel(task)}
							</span>
							<span className="flex items-center gap-1">
								<span className="icon-[mdi--history] text-[13px]" />
								{formatLastRun(task.lastRunAt)}
							</span>
							{task.lastRunStatus && (
								<span
									className={`flex items-center gap-1 ${
										task.lastRunStatus === "success" ? "text-green-500" : "text-red-400"
									}`}
								>
									<span
										className={`text-[13px] ${
											task.lastRunStatus === "success"
												? "icon-[mdi--check-circle-outline]"
												: "icon-[mdi--alert-circle-outline]"
										}`}
									/>
									{task.lastRunStatus === "success" ? "成功" : "失败"}
								</span>
							)}
						</div>

						{/* ─── Prompt preview ─── */}
						<p className="mt-2 truncate text-xs leading-relaxed text-muted-foreground/50">
							{task.prompt}
						</p>
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

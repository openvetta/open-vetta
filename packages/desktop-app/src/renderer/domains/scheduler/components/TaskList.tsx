import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { confirmDialogAtom, scheduledTasksAtom, defaultConversationCwdAtom, getProjectDisplayName } from "@shared/store/atoms";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import type { ScheduledTask } from "@shared/store/atoms";
import { describeSchedule, parseCronExpression } from "./schedule-picker/cron-utils";

interface TaskListProps {
	selectedTaskId: string | null;
	onSelectTask: (id: string | null) => void;
	onEditTask: (task: ScheduledTask) => void;
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

function executionModeLabel(task: ScheduledTask): string {
	if (task.executionMode === "sandbox") return "使用沙盒";
	if (task.executionMode === "full-access") return "完全访问";
	return "跟随默认";
}

const easeOut = [0.22, 1, 0.36, 1] as const;

export function TaskList({ selectedTaskId, onSelectTask, onEditTask }: TaskListProps): JSX.Element {
	const tasks = useAtomValue(scheduledTasksAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const { deleteTask, toggleTask, runNow } = useScheduledTasks();

	return (
		<motion.div
			className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
			initial="hidden"
			animate="show"
			variants={{
				hidden: {},
				show: { transition: { staggerChildren: 0.05 } },
			}}
		>
			{tasks.map((task) => {
				const isSelected = selectedTaskId === task.id;
				return (
					<motion.div
						key={task.id}
						layout
						variants={{
							hidden: { opacity: 0, y: 14, scale: 0.96 },
							show: { opacity: 1, y: 0, scale: 1 },
						}}
						transition={{ type: "spring", stiffness: 320, damping: 26 }}
						whileHover={{ y: -3 }}
						onClick={() => onSelectTask(task.id)}
						className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card/30 p-5 backdrop-blur-sm transition-colors duration-300 ${
							isSelected
								? "border-primary/50 bg-primary/[0.04]"
								: "border-border/50 hover:border-primary/30 hover:bg-card/60"
						}`}
					>
						{/* Top accent bar — primary if enabled, muted otherwise */}
						<div
							className={`pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity duration-300 ${
								task.enabled
									? "bg-gradient-to-r from-transparent via-primary/25 to-transparent opacity-100"
									: "bg-gradient-to-r from-transparent via-muted-foreground/15 to-transparent opacity-40"
							}`}
						/>

						{/* Hover sheen */}
						<div className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500 group-hover:opacity-100">
							<div className="absolute -top-20 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-primary/[0.04] blur-2xl" />
						</div>

						{/* ─── Top row: status + name + actions ─── */}
						<div className="relative flex items-start gap-2.5">
							<div className="mt-1 flex h-2 w-2 shrink-0">
								<span className="relative inline-flex h-2 w-2">
									{task.enabled && (
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
									)}
									<span
										className={`relative inline-flex h-2 w-2 rounded-full ${
											task.enabled
												? "bg-emerald-500 shadow-[0_0_8px_var(--color-emerald-500,#10b981)]"
												: "bg-muted-foreground/40"
										}`}
									/>
								</span>
							</div>
							<div className="min-w-0 flex-1">
								<h3 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
									{task.name}
								</h3>
								<p className="mt-0.5 truncate text-[11px] text-muted-foreground/50">
									{task.enabled ? "运行中" : "已停用"}
									{task.isOnce && " · 一次性"}
								</p>
							</div>

							<div
								className={`flex items-center gap-0.5 transition-opacity duration-200 ${
									isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
								}`}
							>
								<ActionButton
									icon="icon-[mdi--play]"
									title="立即执行"
									onClick={(e) => {
										e.stopPropagation();
										runNow(task.id);
									}}
								/>
								<ActionButton
									icon={task.enabled ? "icon-[mdi--pause]" : "icon-[mdi--play-outline]"}
									title={task.enabled ? "暂停" : "启用"}
									onClick={(e) => {
										e.stopPropagation();
										toggleTask(task.id);
									}}
								/>
								<ActionButton
									icon="icon-[mdi--pencil-outline]"
									title="编辑"
									onClick={(e) => {
										e.stopPropagation();
										onEditTask(task);
									}}
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

						{/* ─── Schedule highlight ─── */}
						<div className="relative mt-4 flex items-center gap-2 rounded-xl border border-border/30 bg-background/40 px-3 py-2.5">
							<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/15">
								<span className="icon-[mdi--clock-time-eight-outline] h-3.5 w-3.5 text-primary" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[12px] font-medium text-foreground">
									{scheduleLabel(task)}
								</p>
								<p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/50">
									{task.cron}
								</p>
							</div>
						</div>

						{/* ─── Prompt preview ─── */}
						<div className="relative mt-3 flex-1">
							<p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground/70">
								{task.prompt}
							</p>
						</div>

						{/* ─── Footer: meta pills ─── */}
						<div className="relative mt-4 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-3 text-[11px]">
							{task.cwd && (
								<MetaPill
									icon="icon-[mdi--folder-outline]"
									text={getProjectDisplayName(task.cwd, defaultCwd)}
									tone="default"
								/>
							)}
							<MetaPill
								icon="icon-[mdi--shield-outline]"
								text={executionModeLabel(task)}
								tone="default"
							/>
							<div className="ml-auto flex items-center gap-1.5">
								{task.lastRunStatus && (
									<span
										className={`flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-medium ${
											task.lastRunStatus === "success"
												? "bg-emerald-500/10 text-emerald-400"
												: "bg-red-500/10 text-red-400"
										}`}
									>
										<span
											className={`h-3 w-3 ${
												task.lastRunStatus === "success"
													? "icon-[mdi--check-circle]"
													: "icon-[mdi--alert-circle]"
											}`}
										/>
										{task.lastRunStatus === "success" ? "成功" : "失败"}
									</span>
								)}
								<span className="flex items-center gap-1 text-muted-foreground/50">
									<span className="icon-[mdi--history] h-3 w-3" />
									{formatLastRun(task.lastRunAt)}
								</span>
							</div>
						</div>
					</motion.div>
				);
			})}
		</motion.div>
	);
}

function MetaPill({
	icon,
	text,
	tone,
}: {
	icon: string;
	text: string;
	tone: "default";
}): JSX.Element {
	void tone;
	return (
		<span className="flex h-5 items-center gap-1 rounded-full bg-accent/40 px-2 text-[10px] text-muted-foreground/70">
			<span className={`${icon} h-3 w-3 opacity-70`} />
			<span className="max-w-[110px] truncate">{text}</span>
		</span>
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
		<motion.button
			type="button"
			title={title}
			onClick={onClick}
			whileHover={{ scale: 1.1 }}
			whileTap={{ scale: 0.9 }}
			transition={{ type: "spring", stiffness: 400, damping: 22 }}
			className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
				variant === "danger"
					? "text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-400"
					: "text-muted-foreground/60 hover:bg-primary/10 hover:text-primary"
			}`}
		>
			<span className={`${icon} text-[14px]`} />
		</motion.button>
	);
}

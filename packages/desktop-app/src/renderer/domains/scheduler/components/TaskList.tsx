import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { confirmDialogAtom, scheduledTasksAtom, runningTaskIdsAtom, defaultConversationCwdAtom, getProjectDisplayName } from "@shared/store/atoms";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import type { ScheduledTask } from "@shared/store/atoms";
import { describeSchedule, parseCronExpression } from "./schedule-picker/cron-utils";

interface TaskListProps {
	selectedTaskId: string | null;
	onSelectTask: (id: string | null) => void;
	onEditTask: (task: ScheduledTask) => void;
}

function formatLastRun(timestamp: number | null, t: TFunction<"automation">): string {
	if (!timestamp) return t("list.neverRun");
	const diff = Date.now() - timestamp;
	if (diff < 60000) return t("list.justNow");
	if (diff < 3600000) return t("list.minutesAgo", { n: Math.floor(diff / 60000) });
	if (diff < 86400000) return t("list.hoursAgo", { n: Math.floor(diff / 3600000) });
	return t("list.daysAgo", { n: Math.floor(diff / 86400000) });
}

function scheduleLabel(task: ScheduledTask, t: TFunction<"automation">): string {
	const parsed = parseCronExpression(task.cron, task.isOnce);
	if (parsed) return describeSchedule(parsed, t);
	return task.cron;
}

function executionModeLabel(task: ScheduledTask, t: TFunction<"automation">): string {
	if (task.executionMode === "sandbox") return t("list.useSandbox");
	if (task.executionMode === "full-access") return t("list.fullAccess");
	return t("list.inheritDefault");
}

const easeOut = [0.22, 1, 0.36, 1] as const;

export function TaskList({ selectedTaskId, onSelectTask, onEditTask }: TaskListProps): JSX.Element {
	const { t } = useTranslation("automation");
	const tasks = useAtomValue(scheduledTasksAtom);
	const runningTaskIds = useAtomValue(runningTaskIdsAtom);
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
				const isRunning = runningTaskIds.has(task.id);
				const statusLabel = isRunning ? t("list.running") : task.enabled ? t("list.pending") : t("list.disabled");
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
						className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl p-5 transition-colors duration-300 ${
							isSelected
								? "bg-primary/10 ring-1 ring-inset ring-primary/30"
								: "bg-muted hover:bg-accent"
						}`}
					>
						{/* ─── Top row: status + name + actions ─── */}
						<div className="relative flex items-start gap-2.5">
							<div className="mt-1 flex h-2 w-2 shrink-0">
								<span className="relative inline-flex h-2 w-2">
									{isRunning && (
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
									)}
									<span
										className={`relative inline-flex h-2 w-2 rounded-full ${
											isRunning
												? "bg-emerald-500"
												: task.enabled
													? "bg-primary"
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
									{statusLabel}
									{task.isOnce && ` · ${t("list.once")}`}
								</p>
							</div>

							<div
								className={`flex items-center gap-0.5 transition-opacity duration-200 ${
									isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
								}`}
							>
								<ActionButton
									icon="icon-[mdi--play]"
									title={t("list.runNow")}
									onClick={(e) => {
										e.stopPropagation();
										runNow(task.id);
									}}
								/>
								<ActionButton
									icon={task.enabled ? "icon-[mdi--pause]" : "icon-[mdi--play-outline]"}
									title={task.enabled ? t("list.pause") : t("list.enable")}
									onClick={(e) => {
										e.stopPropagation();
										toggleTask(task.id);
									}}
								/>
								<ActionButton
									icon="icon-[mdi--pencil-outline]"
									title={t("list.edit")}
									onClick={(e) => {
										e.stopPropagation();
										onEditTask(task);
									}}
								/>
								<ActionButton
									icon="icon-[mdi--delete-outline]"
									title={t("list.delete")}
									variant="danger"
									onClick={(e) => {
										e.stopPropagation();
										setConfirmDialog({
											title: t("confirm.deleteTitle", { name: task.name }),
											message: t("confirm.deleteMsg"),
											confirmLabel: t("confirm.delete"),
											cancelLabel: t("confirm.cancel"),
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
									{scheduleLabel(task, t)}
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
							{/* {task.cwd && (
								<MetaPill
									icon="icon-[mdi--folder-outline]"
									text={getProjectDisplayName(task.cwd, defaultCwd)}
									tone="default"
								/>
							)} */}
							<MetaPill
								icon="icon-[mdi--shield-outline]"
								text={executionModeLabel(task, t)}
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
										{task.lastRunStatus === "success" ? t("list.success") : t("list.failed")}
									</span>
								)}
								<span className="flex items-center gap-1 text-muted-foreground/50">
									<span className="icon-[mdi--history] h-3 w-3" />
									{formatLastRun(task.lastRunAt, t)}
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

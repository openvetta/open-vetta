import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAtomValue } from "jotai";
import { defaultConversationCwdAtom, getProjectDisplayName } from "@shared/store/atoms";
import type { ScheduledTask } from "@shared/store/atoms";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { ExecutionHistory } from "./ExecutionHistory";
import { describeSchedule, parseCronExpression } from "./schedule-picker/cron-utils";

interface HistoryDrawerProps {
	/** null = 抽屉关闭 */
	task: ScheduledTask | null;
	onClose: () => void;
	onEdit: (task: ScheduledTask) => void;
}

const easeOut = [0.22, 1, 0.36, 1] as const;

function scheduleLabel(task: ScheduledTask): string {
	const parsed = parseCronExpression(task.cron, task.isOnce);
	if (parsed) return describeSchedule(parsed);
	return task.cron;
}

export function HistoryDrawer({ task, onClose, onEdit }: HistoryDrawerProps): JSX.Element {
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const { runNow, toggleTask } = useScheduledTasks();

	// ESC 关闭
	useEffect(() => {
		if (!task) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [task, onClose]);

	return (
		<AnimatePresence>
			{task && (
				<>
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						onClick={onClose}
						className="absolute inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
					/>

					{/* Panel */}
					<motion.div
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ duration: 0.32, ease: easeOut }}
						className="absolute inset-y-0 right-0 z-50 flex w-[420px] max-w-[88%] flex-col border-l border-border bg-background shadow-[-16px_0_40px_-20px_rgba(0,0,0,0.5)]"
					>
						{/* ─── Header ─── */}
						<div className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
							<div className="flex items-start gap-2.5">
								<span className="mt-1 flex h-2 w-2 shrink-0">
									<span className="relative inline-flex h-2 w-2">
										{task.enabled && (
											<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
										)}
										<span
											className={`relative inline-flex h-2 w-2 rounded-full ${
												task.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
											}`}
										/>
									</span>
								</span>
								<div className="min-w-0 flex-1">
									<h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
										{task.name}
									</h2>
									<p className="mt-0.5 truncate text-[11px] text-muted-foreground/50">
										{scheduleLabel(task)}
										{task.cwd && ` · ${getProjectDisplayName(task.cwd, defaultCwd)}`}
									</p>
								</div>
								<button
									type="button"
									onClick={onClose}
									title="关闭"
									className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors duration-150 hover:bg-accent hover:text-foreground"
								>
									<span className="icon-[mdi--close] text-[16px]" />
								</button>
							</div>

							{/* Quick actions */}
							<div className="mt-3.5 flex items-center gap-2">
								<DrawerAction
									icon="icon-[mdi--play]"
									label="立即执行"
									primary
									onClick={() => runNow(task.id)}
								/>
								<DrawerAction
									icon={task.enabled ? "icon-[mdi--pause]" : "icon-[mdi--play-outline]"}
									label={task.enabled ? "暂停" : "启用"}
									onClick={() => toggleTask(task.id)}
								/>
								<DrawerAction
									icon="icon-[mdi--pencil-outline]"
									label="编辑"
									onClick={() => onEdit(task)}
								/>
							</div>
						</div>

						{/* ─── History body ─── */}
						<ExecutionHistory taskId={task.id} embedded />
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}

function DrawerAction({
	icon,
	label,
	primary,
	onClick,
}: {
	icon: string;
	label: string;
	primary?: boolean;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors duration-150 ${
				primary
					? "bg-primary/90 text-primary-foreground hover:bg-primary"
					: "border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
			}`}
		>
			<span className={`${icon} text-[14px]`} />
			{label}
		</button>
	);
}

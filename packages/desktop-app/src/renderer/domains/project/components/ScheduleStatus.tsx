import { useEffect } from "react";
import { useScheduledTasks } from "@domains/scheduler/hooks/useScheduledTasks";
import { describeSchedule, parseCronExpression } from "@domains/scheduler/components/schedule-picker/cron-utils";
import { Button } from "@shared/components/ui/button";
import type { ScheduledTask } from "@shared/store/atoms";

function formatLastRun(timestamp: number | null): string {
	if (!timestamp) return "从未执行";
	const diff = Date.now() - timestamp;
	if (diff < 60_000) return "刚刚";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
	return `${Math.floor(diff / 86_400_000)} 天前`;
}

function scheduleLabel(task: ScheduledTask): string {
	const parsed = parseCronExpression(task.cron, task.isOnce);
	if (parsed) return describeSchedule(parsed);
	return task.cron;
}

function TaskCard({
	task,
	onRun,
	onToggle,
}: {
	task: ScheduledTask;
	onRun: () => void;
	onToggle: () => void;
}): JSX.Element {
	return (
		<div className="flex items-center justify-between rounded-xl border border-border/30 bg-muted/15 px-4 py-3 transition-colors duration-200 hover:bg-muted/25">
			<div className="flex min-w-0 items-center gap-3">
				{/* Status indicator */}
				<div className="relative flex h-2 w-2 shrink-0">
					<span
						className={`absolute inline-flex h-full w-full rounded-full ${
							task.enabled ? "animate-ping bg-emerald-400 opacity-50" : ""
						}`}
					/>
					<span
						className={`relative inline-flex h-2 w-2 rounded-full ${
							task.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
						}`}
					/>
				</div>
				<div className="min-w-0">
					<div className="truncate text-[13px] font-medium text-foreground">{task.name}</div>
					<div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/50">
						<span className="flex items-center gap-1">
							<span className="icon-[mdi--clock-outline] text-[12px]" />
							{scheduleLabel(task)}
						</span>
						<span className="flex items-center gap-1">
							<span className="icon-[mdi--history] text-[12px]" />
							{formatLastRun(task.lastRunAt)}
							{task.lastRunStatus === "success" && (
								<span className="text-emerald-500">成功</span>
							)}
							{task.lastRunStatus === "failed" && <span className="text-red-400">失败</span>}
						</span>
					</div>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1.5">
				<Button
					variant="outline"
					size="sm"
					className="h-7 w-7 rounded-lg border-border/50 p-0 text-muted-foreground/70 transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
					onClick={onToggle}
					title={task.enabled ? "暂停" : "启用"}
				>
					<span
						className={`${task.enabled ? "icon-[mdi--pause]" : "icon-[mdi--play]"} h-3.5 w-3.5`}
					/>
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5 rounded-lg border-border/50 text-muted-foreground/70 transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
					onClick={onRun}
					title="立即执行"
				>
					<span className="icon-[mdi--play-circle-outline] h-3.5 w-3.5" />
					<span className="text-[12px]">执行</span>
				</Button>
			</div>
		</div>
	);
}

export function ScheduleStatus({ cwd }: { cwd: string }): JSX.Element | null {
	const { tasks, runNow, toggleTask, refreshTasks } = useScheduledTasks();

	useEffect(() => {
		void refreshTasks();
	}, [refreshTasks]);

	// Listen for task events to keep status up-to-date
	useEffect(() => {
		const unsubscribe = window.vetta.scheduler.onTaskEvent(() => {
			void refreshTasks();
		});
		return unsubscribe;
	}, [refreshTasks]);

	const projectTasks = tasks.filter((t) => t.cwd === cwd);

	if (projectTasks.length === 0) return null;

	return (
		<div className="px-8 py-5">
			<div className="mb-3 flex items-center gap-2.5">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/60">
					<span className="icon-[mdi--clock-outline] h-3.5 w-3.5 text-muted-foreground" />
				</div>
				<h2 className="text-[13px] font-semibold text-foreground">自动化任务</h2>
			</div>
			<div className="space-y-2">
				{projectTasks.map((task) => (
					<TaskCard
						key={task.id}
						task={task}
						onRun={() => void runNow(task.id)}
						onToggle={() => void toggleTask(task.id)}
					/>
				))}
			</div>
		</div>
	);
}

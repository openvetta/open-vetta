import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useScheduledTasks } from "@domains/scheduler/hooks/useScheduledTasks";
import { Button } from "@shared/components/ui/button";
import { openSessionFnRef, type TaskExecutionRecord } from "@shared/store/atoms";
import type { ScheduledTask } from "@shared/store/atoms";

interface ScheduleExecutionTabPanelProps {
	cwd: string;
}

function isSameDay(timestamp: number, base: Date): boolean {
	const date = new Date(timestamp);
	return (
		date.getFullYear() === base.getFullYear() &&
		date.getMonth() === base.getMonth() &&
		date.getDate() === base.getDate()
	);
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatDuration(durationMs?: number): string | null {
	if (!durationMs || durationMs <= 0) return null;
	if (durationMs < 1000) return `${durationMs}ms`;
	if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
	const minutes = Math.floor(durationMs / 60_000);
	const seconds = Math.round((durationMs % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
}

function statusLabel(status: TaskExecutionRecord["status"], t: TFunction<"chat">): string {
	switch (status) {
		case "running":
			return t("activityPanel.schedule.statusRunning");
		case "success":
			return t("activityPanel.schedule.statusSuccess");
		case "failed":
			return t("activityPanel.schedule.statusFailed");
		case "aborted":
			return t("activityPanel.schedule.statusAborted");
	}
}

function statusClass(status: TaskExecutionRecord["status"]): string {
	switch (status) {
		case "running":
			return "bg-sky-500/10 text-sky-500";
		case "success":
			return "bg-emerald-500/10 text-emerald-500";
		case "failed":
			return "bg-red-500/10 text-red-500";
		case "aborted":
			return "bg-amber-500/10 text-amber-500";
	}
}

export function ScheduleExecutionTabPanel({ cwd }: ScheduleExecutionTabPanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	const { tasks, runNow, toggleTask, refreshTasks } = useScheduledTasks();
	const [recordsByTaskId, setRecordsByTaskId] = useState<Record<string, TaskExecutionRecord[]>>({});

	const projectTasks = useMemo(() => tasks.filter((task) => task.cwd === cwd), [tasks, cwd]);

	const loadRecords = useCallback(async (targetTasks: ScheduledTask[]) => {
		const entries = await Promise.all(
			targetTasks.map(async (task) => {
				const records = await window.vetta.scheduler.getRecords(task.id);
				return [task.id, records] as const;
			}),
		);
		setRecordsByTaskId(Object.fromEntries(entries));
	}, []);

	const refreshAll = useCallback(async () => {
		await refreshTasks();
	}, [refreshTasks]);

	useEffect(() => {
		void refreshAll();
	}, [refreshAll]);

	useEffect(() => {
		void loadRecords(projectTasks);
	}, [projectTasks, loadRecords]);

	useEffect(() => {
		const unsubscribe = window.vetta.scheduler.onTaskEvent(async () => {
			await refreshTasks();
		});
		return unsubscribe;
	}, [refreshTasks]);

	const records = useMemo(() => {
		const taskNameById = new Map(projectTasks.map((task) => [task.id, task.name] as const));
		return Object.entries(recordsByTaskId)
			.flatMap(([taskId, taskRecords]) =>
				taskRecords.map((record) => ({
					...record,
					taskName: taskNameById.get(taskId) ?? t("activityPanel.schedule.unnamedTask"),
				})),
			)
			.sort((a, b) => b.startedAt - a.startedAt)
			.slice(0, 80);
	}, [projectTasks, recordsByTaskId, t]);

	const today = new Date();
	const enabledCount = projectTasks.filter((task) => task.enabled).length;
	const todayCount = records.filter((record) => isSameDay(record.startedAt, today)).length;

	const handleOpenSession = (record: TaskExecutionRecord) => {
		if (!record.sessionPath || !record.cwd || !openSessionFnRef.current) return;
		void openSessionFnRef.current(record.cwd, record.sessionPath, record.executionMode);
	};

	if (projectTasks.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
				<span className="icon-[mdi--history] text-[26px]" />
				<span className="text-[12px]">{t("activityPanel.schedule.noTasks")}</span>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="shrink-0 border-b border-border/50 px-3 py-3">
				<div className="mb-2 flex items-center justify-between">
					<span className="text-[12px] font-medium text-foreground">{t("activityPanel.schedule.overview")}</span>
					<Button
						size="sm"
						variant="outline"
						className="h-7 rounded-lg border-border/50 px-2 text-[11px]"
						onClick={() => void refreshAll()}
					>
						<span className="icon-[mdi--refresh] mr-1 h-3.5 w-3.5" />
						{t("activityPanel.schedule.refresh")}
					</Button>
				</div>
				<div className="grid grid-cols-3 gap-2">
					<SummaryCard label={t("activityPanel.schedule.totalTasks")} value={projectTasks.length} icon="icon-[mdi--clock-outline]" />
					<SummaryCard label={t("activityPanel.schedule.enabled")} value={enabledCount} icon="icon-[mdi--play-circle-outline]" />
					<SummaryCard label={t("activityPanel.schedule.todayExecutions")} value={todayCount} icon="icon-[mdi--calendar-clock]" />
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				<div className="mb-3">
					<div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/45">{t("activityPanel.schedule.taskControl")}</div>
					<div className="space-y-2">
						{projectTasks.map((task) => (
							<div key={task.id} className="rounded-xl border border-border/40 bg-accent/20 p-2.5">
								<div className="mb-1.5 flex items-center justify-between gap-2">
									<span className="truncate text-[12px] font-medium text-foreground">{task.name}</span>
									<span
										className={`rounded-md px-1.5 py-0.5 text-[10px] ${
											task.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-accent text-muted-foreground"
										}`}
									>
										{task.enabled ? t("activityPanel.schedule.enabledBadge") : t("activityPanel.schedule.pausedBadge")}
									</span>
								</div>
								<div className="flex items-center gap-1.5">
									<Button
										size="sm"
										variant="outline"
										className="h-7 rounded-md border-border/40 px-2 text-[11px]"
										onClick={() => void runNow(task.id)}
									>
										<span className="icon-[mdi--play-circle-outline] mr-1 h-3.5 w-3.5" />
										{t("activityPanel.schedule.run")}
									</Button>
									<Button
										size="sm"
										variant="outline"
										className="h-7 rounded-md border-border/40 px-2 text-[11px]"
										onClick={() => void toggleTask(task.id)}
									>
										<span
											className={`${task.enabled ? "icon-[mdi--pause-circle-outline]" : "icon-[mdi--play-circle-outline]"} mr-1 h-3.5 w-3.5`}
										/>
										{task.enabled ? t("activityPanel.schedule.pause") : t("activityPanel.schedule.enable")}
									</Button>
								</div>
							</div>
						))}
					</div>
				</div>

				<div>
					<div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/45">{t("activityPanel.schedule.executionRecords")}</div>
					{records.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/50 py-8 text-muted-foreground/50">
							<span className="icon-[mdi--timeline-text-outline] text-[20px]" />
							<span className="text-[12px]">{t("activityPanel.schedule.noRecords")}</span>
						</div>
					) : (
						<div className="space-y-2">
							{records.map((record) => {
								const duration = formatDuration(record.durationMs);
								const clickable = Boolean(record.sessionPath && record.cwd && openSessionFnRef.current);
								return (
									<button
										key={record.id}
										type="button"
										onClick={() => handleOpenSession(record)}
										disabled={!clickable}
										className={`w-full rounded-xl border border-border/40 p-2.5 text-left transition-colors ${
											clickable ? "bg-background hover:bg-accent/30" : "cursor-default bg-muted/20"
										}`}
									>
										<div className="mb-1.5 flex items-center justify-between gap-2">
											<div className="min-w-0">
												<div className="truncate text-[12px] font-medium text-foreground">{record.taskName}</div>
												<div className="text-[11px] text-muted-foreground/60">{formatTime(record.startedAt)}</div>
											</div>
											<span className={`rounded-md px-1.5 py-0.5 text-[10px] ${statusClass(record.status)}`}>
												{statusLabel(record.status, t)}
											</span>
										</div>
										<div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
											{duration && <span>{duration}</span>}
											{record.error && <span className="truncate text-red-500">{record.error}</span>}
											{!record.error && record.responsePreview && (
												<span className="truncate">{record.responsePreview}</span>
											)}
											{clickable && <span className="icon-[mdi--open-in-new] ml-auto h-3.5 w-3.5 shrink-0" />}
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: string }): JSX.Element {
	return (
		<div className="rounded-lg border border-border/40 bg-background/50 px-2 py-2">
			<div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground/70">
				<span className={`${icon} h-3 w-3`} />
				<span>{label}</span>
			</div>
			<div className="text-[15px] font-semibold tabular-nums text-foreground">{value}</div>
		</div>
	);
}

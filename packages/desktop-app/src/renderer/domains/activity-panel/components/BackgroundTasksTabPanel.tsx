import {
	activeSessionAtom,
	type BackgroundTask,
	backgroundTasksBySessionAtom,
	getBackgroundTasksForSession,
} from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

function statusMeta(
	status: BackgroundTask["status"],
	t: TFunction<"chat">,
): { icon: string; label: string; className: string } {
	switch (status) {
		case "running":
			return {
				icon: "icon-[mdi--loading] animate-spin",
				label: t("activityPanel.backgroundTasks.statusRunning"),
				className: "text-blue-500",
			};
		case "completed":
			return {
				icon: "icon-[mdi--check-circle-outline]",
				label: t("activityPanel.backgroundTasks.statusCompleted"),
				className: "text-emerald-600",
			};
		case "failed":
			return {
				icon: "icon-[mdi--close-circle-outline]",
				label: t("activityPanel.backgroundTasks.statusFailed"),
				className: "text-destructive",
			};
		case "killed":
			return {
				icon: "icon-[mdi--stop-circle-outline]",
				label: t("activityPanel.backgroundTasks.statusKilled"),
				className: "text-muted-foreground",
			};
	}
}

function formatDuration(startedAt: number, endedAt: number | undefined, now: number, t: TFunction<"chat">): string {
	const ms = Math.max(0, (endedAt ?? now) - startedAt);
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return t("activityPanel.backgroundTasks.durationSec", { sec });
	const min = Math.floor(sec / 60);
	if (min < 60) return t("activityPanel.backgroundTasks.durationMin", { min, sec: sec % 60 });
	const hr = Math.floor(min / 60);
	return t("activityPanel.backgroundTasks.durationHour", { hr, min: min % 60 });
}

function TaskCard({ task, now }: { task: BackgroundTask; now: number }): JSX.Element {
	const { t } = useTranslation("chat");
	const meta = statusMeta(task.status, t);
	const tailRef = useRef<HTMLPreElement>(null);

	// 输出尾部自动滚动到底部，跟随最新输出
	useEffect(() => {
		const el = tailRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [task.tail]);

	return (
		<div className="rounded-lg border border-border bg-background p-2.5">
			<div className="flex items-center gap-1.5">
				<span className={`${meta.icon} h-3.5 w-3.5 shrink-0 ${meta.className}`} />
				<span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">{task.id}</span>
				<span className={`text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
				{task.exitCode !== undefined && (
					<span className="text-[10px] text-muted-foreground/70">exit {task.exitCode}</span>
				)}
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
					{formatDuration(task.startedAt, task.endedAt, now, t)}
				</span>
			</div>
			<div className="mt-1.5 truncate font-mono text-[11px] text-foreground" title={task.command}>
				{task.command}
			</div>
			{task.tail && (
				<pre
					ref={tailRef}
					className="mt-1.5 max-h-[120px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground"
				>
					{task.tail}
				</pre>
			)}
		</div>
	);
}

export function BackgroundTasksTabPanel(): JSX.Element {
	const { t } = useTranslation("chat");
	const tasksMap = useAtomValue(backgroundTasksBySessionAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const tasks = useMemo(
		() => getBackgroundTasksForSession(tasksMap, activeSession?.runtimeId ?? null),
		[tasksMap, activeSession?.runtimeId],
	);

	// 运行中任务的时长每秒刷新
	const hasRunning = tasks.some((t) => t.status === "running");
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!hasRunning) return;
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, [hasRunning]);

	const sessionId = activeSession?.runtimeId;
	const finishedCount = tasks.length - tasks.filter((t) => t.status === "running").length;
	const handleClearFinished = useCallback(() => {
		if (!sessionId) return;
		// 清理落在主进程注册表（数据源），随后的 background_tasks_update 全量
		// 快照事件会驱动本地 atom 更新，无需乐观更新。
		void window.vetta.session.clearFinishedBackgroundTasks(sessionId);
	}, [sessionId]);

	if (tasks.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
				{t("activityPanel.backgroundTasks.empty")}
			</div>
		);
	}

	const sorted = tasks.slice().sort((a, b) => b.startedAt - a.startedAt);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{finishedCount > 0 && (
				<div className="flex shrink-0 items-center justify-end px-2.5 pt-2">
					<button
						type="button"
						onClick={handleClearFinished}
						className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<span className="icon-[mdi--broom] h-3 w-3" />
						<span>{t("activityPanel.backgroundTasks.clearFinished", { count: finishedCount })}</span>
					</button>
				</div>
			)}
			<div className="flex-1 space-y-2 overflow-y-auto p-2.5">
				{sorted.map((task) => (
					<TaskCard key={task.id} task={task} now={now} />
				))}
			</div>
		</div>
	);
}

import {
	activeSessionAtom,
	type BackgroundTask,
	backgroundTasksBySessionAtom,
	getBackgroundTasksForSession,
} from "@shared/store/atoms";
import type { BackgroundTaskViewItem } from "@vetta/theme-ui/activity";
import type { TFunction } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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

function toViewItem(task: BackgroundTask, now: number, t: TFunction<"chat">): BackgroundTaskViewItem {
	const meta = statusMeta(task.status, t);
	return {
		id: task.id,
		command: task.command,
		status: task.status,
		tail: task.tail,
		exitCode: task.exitCode,
		statusIcon: meta.icon,
		statusLabel: meta.label,
		statusClassName: meta.className,
		durationLabel: formatDuration(task.startedAt, task.endedAt, now, t),
	};
}

export interface BackgroundTasksTabPanelModel {
	items: BackgroundTaskViewItem[];
	emptyLabel: string;
	clearFinishedLabel: string | null;
	onClearFinished: () => void;
}

export function useBackgroundTasksTabPanelModel(): BackgroundTasksTabPanelModel {
	const { t } = useTranslation("chat");
	const tasksMap = useAtomValue(backgroundTasksBySessionAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const tasks = useMemo(
		() => getBackgroundTasksForSession(tasksMap, activeSession?.runtimeId ?? null),
		[tasksMap, activeSession?.runtimeId],
	);

	// 运行中任务的时长每秒刷新
	const hasRunning = tasks.some((task) => task.status === "running");
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!hasRunning) return;
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, [hasRunning]);

	const sessionId = activeSession?.runtimeId;
	const finishedCount = tasks.length - tasks.filter((task) => task.status === "running").length;
	const handleClearFinished = useCallback(() => {
		if (!sessionId) return;
		// 清理落在主进程注册表（数据源），随后的 background_tasks_update 全量
		// 快照事件会驱动本地 atom 更新，无需乐观更新。
		void window.vetta.session.clearFinishedBackgroundTasks(sessionId);
	}, [sessionId]);

	const items = useMemo(
		() =>
			tasks
				.slice()
				.sort((a, b) => b.startedAt - a.startedAt)
				.map((task) => toViewItem(task, now, t)),
		[tasks, now, t],
	);

	return {
		items,
		emptyLabel: t("activityPanel.backgroundTasks.empty"),
		clearFinishedLabel:
			finishedCount > 0 ? t("activityPanel.backgroundTasks.clearFinished", { count: finishedCount }) : null,
		onClearFinished: handleClearFinished,
	};
}

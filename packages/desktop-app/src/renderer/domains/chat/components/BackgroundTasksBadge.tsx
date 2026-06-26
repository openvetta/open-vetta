import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	backgroundTasksBySessionAtom,
	getBackgroundTasksForSession,
} from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityTabKey } from "@shared/lib/project-profile";

/**
 * 右上角后台任务 badge：显示当前 session 运行中的后台任务数。
 * 点击打开活动面板并切换到「后台任务」tab。
 */
export function BackgroundTasksBadge(): JSX.Element | null {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const tasksMap = useAtomValue(backgroundTasksBySessionAtom);
	const setPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);

	const tasks = useMemo(
		() => getBackgroundTasksForSession(tasksMap, activeSession?.runtimeId ?? null),
		[tasksMap, activeSession?.runtimeId],
	);
	const running = useMemo(() => tasks.filter((t) => t.status === "running").length, [tasks]);

	const handleClick = useCallback(() => {
		const cwd = activeSession?.cwd;
		if (cwd) {
			setTabByProject((prev) => {
				const map = new Map(prev);
				map.set(cwd, "background-tasks" as ActivityTabKey);
				return map;
			});
		}
		setPanelOpen(true);
	}, [activeSession?.cwd, setPanelOpen, setTabByProject]);

	// 只在有运行中任务时显示——badge 是「正在跑」的提醒；任务结束后结果已
	// 沉淀进对话，历史记录去活动面板「后台任务」tab 追溯。
	if (running === 0) return null;

	return (
		<button
			type="button"
			onClick={handleClick}
			title={t("backgroundTasksBadge.runningTasksTooltip", { count: running })}
			className="flex h-7 items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
		>
			<span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />
			<span>{running}</span>
		</button>
	);
}

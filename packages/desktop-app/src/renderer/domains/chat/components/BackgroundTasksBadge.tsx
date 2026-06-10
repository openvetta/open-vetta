import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	backgroundTasksBySessionAtom,
	getBackgroundTasksForSession,
} from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import type { ActivityTabKey } from "@shared/lib/project-profile";

/**
 * 右上角后台任务 badge：显示当前 session 运行中的后台任务数。
 * 点击打开活动面板并切换到「后台任务」tab。
 */
export function BackgroundTasksBadge(): JSX.Element | null {
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

	if (tasks.length === 0) return null;

	const isActive = running > 0;
	return (
		<button
			type="button"
			onClick={handleClick}
			title={isActive ? `${running} 个后台任务运行中` : "后台任务已全部结束"}
			className={
				isActive
					? "flex h-7 items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
					: "flex h-7 items-center gap-1 rounded-full border border-border bg-muted/50 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
			}
		>
			<span
				className={
					isActive ? "icon-[mdi--loading] h-3.5 w-3.5 animate-spin" : "icon-[mdi--console-line] h-3.5 w-3.5"
				}
			/>
			<span>{isActive ? running : tasks.length}</span>
		</button>
	);
}

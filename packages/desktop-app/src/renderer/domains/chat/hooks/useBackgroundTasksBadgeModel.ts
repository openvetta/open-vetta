import type { ActivityTabKey } from "@shared/lib/project-profile";
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

export interface BackgroundTasksBadgeModel {
	/** Null when no running tasks (host renders null). */
	runningCount: number | null;
	title: string;
	onClick: () => void;
}

export function useBackgroundTasksBadgeModel(): BackgroundTasksBadgeModel {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const tasksMap = useAtomValue(backgroundTasksBySessionAtom);
	const setPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);

	const tasks = useMemo(
		() => getBackgroundTasksForSession(tasksMap, activeSession?.runtimeId ?? null),
		[tasksMap, activeSession?.runtimeId],
	);
	const running = useMemo(() => tasks.filter((task) => task.status === "running").length, [tasks]);

	const onClick = useCallback(() => {
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

	return {
		runningCount: running === 0 ? null : running,
		title: t("backgroundTasksBadge.runningTasksTooltip", { count: running }),
		onClick,
	};
}

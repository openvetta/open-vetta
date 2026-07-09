import type { ScheduledTask } from "@shared/store/atoms";
import { confirmDialogAtom, runningTaskIdsAtom, scheduledTasksAtom } from "@shared/store/atoms";
import type { TFunction } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { describeSchedule, parseCronExpression } from "../components/schedule-picker/cron-utils";
import { useScheduledTasks } from "./useScheduledTasks";

export interface TaskListItemModel {
	readonly cron: string;
	readonly executionModeLabel: string;
	readonly id: string;
	readonly isOnce: boolean;
	readonly isRunning: boolean;
	readonly isSelected: boolean;
	readonly lastRunLabel: string;
	readonly lastRunStatus: ScheduledTask["lastRunStatus"];
	readonly name: string;
	readonly prompt: string;
	readonly scheduleLabel: string;
	readonly statusLabel: string;
	readonly task: ScheduledTask;
}

export interface TaskListModel {
	readonly items: readonly TaskListItemModel[];
	readonly onDeleteTask: (task: ScheduledTask) => void;
	readonly onRunTask: (taskId: string) => void;
	readonly onToggleTask: (taskId: string) => void;
}

interface UseTaskListModelOptions {
	readonly selectedTaskId: string | null;
}

export function useTaskListModel({ selectedTaskId }: UseTaskListModelOptions): TaskListModel {
	const { t } = useTranslation("automation");
	const tasks = useAtomValue(scheduledTasksAtom);
	const runningTaskIds = useAtomValue(runningTaskIdsAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const { deleteTask, toggleTask, runNow } = useScheduledTasks();

	return useMemo(
		() => ({
			items: tasks.map((task) => {
				const isRunning = runningTaskIds.has(task.id);
				return {
					cron: task.cron,
					executionModeLabel: executionModeLabel(task, t),
					id: task.id,
					isOnce: task.isOnce,
					isRunning,
					isSelected: selectedTaskId === task.id,
					lastRunLabel: formatLastRun(task.lastRunAt, t),
					lastRunStatus: task.lastRunStatus,
					name: task.name,
					prompt: task.prompt,
					scheduleLabel: scheduleLabel(task, t),
					statusLabel: isRunning ? t("list.running") : task.enabled ? t("list.pending") : t("list.disabled"),
					task,
				};
			}),
			onDeleteTask: (task: ScheduledTask): void => {
				setConfirmDialog({
					title: t("confirm.deleteTitle", { name: task.name }),
					message: t("confirm.deleteMsg"),
					confirmLabel: t("confirm.delete"),
					cancelLabel: t("confirm.cancel"),
					variant: "danger",
					onConfirm: () => deleteTask(task.id),
				});
			},
			onRunTask: (taskId: string): void => {
				void runNow(taskId);
			},
			onToggleTask: (taskId: string): void => {
				void toggleTask(taskId);
			},
		}),
		[deleteTask, runNow, runningTaskIds, selectedTaskId, setConfirmDialog, t, tasks, toggleTask],
	);
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

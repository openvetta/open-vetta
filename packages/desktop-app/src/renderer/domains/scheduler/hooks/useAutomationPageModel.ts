import type { ScheduledTask } from "@shared/store/atoms";
import {
	formOpenAtom,
	pageHeaderTitleHiddenAtom,
	runningTaskIdsAtom,
	scheduledTasksAtom,
	selectedTaskIdAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useScheduledTasks } from "./useScheduledTasks";

export interface AutomationPageModel {
	readonly dialogOpen: boolean;
	readonly editingTask: ScheduledTask | undefined;
	readonly hasTasks: boolean;
	readonly selectedTask: ScheduledTask | null;
	readonly selectedTaskId: string | null;
	readonly onCloseDialog: () => void;
	readonly onCloseHistory: () => void;
	readonly onEditTask: (task: ScheduledTask) => void;
	readonly onNewTask: () => void;
	readonly onSelectTask: (id: string) => void;
}

export function useAutomationPageModel(): AutomationPageModel {
	const tasks = useAtomValue(scheduledTasksAtom);
	const [selectedTaskId, setSelectedTaskId] = useAtom(selectedTaskIdAtom);
	const [formEditingTask, setFormEditingTask] = useAtom(formOpenAtom);
	const { refreshTasks } = useScheduledTasks();
	const setRunningTaskIds = useSetAtom(runningTaskIdsAtom);
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);
	const [dialogOpen, setDialogOpen] = useState(false);

	useEffect(() => {
		refreshTasks();
	}, [refreshTasks]);

	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

	useEffect(() => {
		void window.vetta.scheduler.getRunningTaskIds().then((ids) => {
			setRunningTaskIds(new Set(ids));
		});
		return window.vetta.scheduler.onTaskEvent((event) => {
			if (event.type === "tasks.changed") return;
			setRunningTaskIds((prev) => {
				const next = new Set(prev);
				if (event.type === "task.started") next.add(event.taskId);
				else next.delete(event.taskId);
				return next;
			});
		});
	}, [setRunningTaskIds]);

	useEffect(() => {
		if (formEditingTask !== undefined) {
			setDialogOpen(true);
		}
	}, [formEditingTask]);

	return useMemo(() => {
		const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

		const handleCloseDialog = (): void => {
			setDialogOpen(false);
			setFormEditingTask(undefined);
		};

		const handleNewTask = (): void => {
			setFormEditingTask(null);
			setDialogOpen(true);
		};

		const handleEditTask = (task: ScheduledTask): void => {
			setFormEditingTask(task);
			setDialogOpen(true);
		};

		const handleSelectTask = (id: string): void => {
			setSelectedTaskId(selectedTaskId === id ? null : id);
		};

		return {
			dialogOpen,
			editingTask: formEditingTask ?? undefined,
			hasTasks: tasks.length > 0,
			selectedTask,
			selectedTaskId,
			onCloseDialog: handleCloseDialog,
			onCloseHistory: () => setSelectedTaskId(null),
			onEditTask: handleEditTask,
			onNewTask: handleNewTask,
			onSelectTask: handleSelectTask,
		};
	}, [dialogOpen, formEditingTask, selectedTaskId, setFormEditingTask, setSelectedTaskId, tasks]);
}

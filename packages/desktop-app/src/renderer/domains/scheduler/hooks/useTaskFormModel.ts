import type { ExecutionModeOverride, ScheduledTask } from "@shared/store/atoms";
import { defaultConversationCwdAtom, projectsAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import type { SchedulerTaskDraft } from "../components/SchedulerTaskFields";
import { getDefaultDailySchedule, toCronExpression } from "../components/schedule-picker/cron-utils";
import { useScheduledTasks } from "./useScheduledTasks";

export interface TaskFormModel {
	readonly canSubmit: boolean;
	readonly data: SchedulerTaskDraft;
	readonly onChange: (value: SchedulerTaskDraft) => void;
	readonly onSubmit: () => void;
}

interface UseTaskFormModelOptions {
	readonly open: boolean;
	readonly task: ScheduledTask | undefined;
	readonly onClose: () => void;
}

export function useTaskFormModel({ open, task, onClose }: UseTaskFormModelOptions): TaskFormModel {
	const { createTask, updateTask } = useScheduledTasks();
	const projects = useAtomValue(projectsAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const [data, setData] = useState<SchedulerTaskDraft>({
		executionMode: "full-access",
	});

	useEffect(() => {
		if (!open) return;
		const defaultCron = toCronExpression(getDefaultDailySchedule());
		setData({
			name: task?.name ?? "",
			cwd: task?.cwd ?? defaultCwd ?? projects[0]?.cwd ?? "",
			prompt: task?.prompt ?? "",
			cron: task?.cron ?? defaultCron,
			isOnce: task?.isOnce ?? false,
			enabled: task?.enabled ?? true,
			executionMode: task?.executionMode ?? "full-access",
			modelKey: task?.modelKey,
			skill: task?.skill ?? null,
		});
	}, [defaultCwd, open, projects, task]);

	const canSubmit = canSubmitFromData(data);

	return useMemo(() => {
		return {
			canSubmit,
			data,
			onChange: setData,
			onSubmit: (): void => {
				if (!canSubmit || !data.name || !data.prompt || !data.cwd || !data.cron) return;
				const taskData = {
					name: data.name,
					prompt: data.prompt,
					cron: data.cron,
					isOnce: data.isOnce ?? false,
					enabled: true,
					cwd: data.cwd,
					executionMode: (data.executionMode ?? "full-access") as ExecutionModeOverride,
					modelKey: data.modelKey ?? undefined,
					skill: data.skill ?? undefined,
				};

				if (task) {
					void updateTask(task.id, taskData).then(onClose);
					return;
				}
				void createTask(taskData).then(onClose);
			},
		};
	}, [canSubmit, createTask, data, onClose, task, updateTask]);
}

function canSubmitFromData(data: SchedulerTaskDraft): boolean {
	return Boolean(data.name?.trim() && data.prompt?.trim() && data.cwd && data.cron);
}

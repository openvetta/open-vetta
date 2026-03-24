import { useAtom } from "jotai";
import { useCallback } from "react";
import { type ScheduledTask, scheduledTasksAtom } from "../store/atoms";

export const CRON_PRESETS = [
	{ label: "每5分钟", value: "*/5 * * * *" },
	{ label: "每15分钟", value: "*/15 * * * *" },
	{ label: "每30分钟", value: "*/30 * * * *" },
	{ label: "每小时", value: "0 * * * *" },
	{ label: "每天上午9点", value: "0 9 * * *" },
	{ label: "每天下午6点", value: "0 18 * * *" },
	{ label: "每周一上午9点", value: "0 9 * * 1" },
	{ label: "每月1日上午9点", value: "0 9 1 * *" },
];

export function useScheduledTasks() {
	const [tasks, setTasks] = useAtom(scheduledTasksAtom);

	const refreshTasks = useCallback(async () => {
		const loaded = await window.vetta.scheduler.getTasks();
		setTasks(loaded);
	}, [setTasks]);

	const createTask = useCallback(
		async (data: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">) => {
			const task = await window.vetta.scheduler.createTask(data);
			setTasks((prev) => [...prev, task]);
			return task;
		},
		[setTasks],
	);

	const updateTask = useCallback(
		async (id: string, patch: Partial<ScheduledTask>) => {
			await window.vetta.scheduler.updateTask(id, patch);
			setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)));
		},
		[setTasks],
	);

	const deleteTask = useCallback(
		async (id: string) => {
			await window.vetta.scheduler.deleteTask(id);
			setTasks((prev) => prev.filter((t) => t.id !== id));
		},
		[setTasks],
	);

	const toggleTask = useCallback(
		async (id: string) => {
			await window.vetta.scheduler.toggleTask(id);
			setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled, updatedAt: Date.now() } : t)));
		},
		[setTasks],
	);

	const runNow = useCallback(async (id: string) => {
		await window.vetta.scheduler.runTaskNow(id);
	}, []);

	const abortTask = useCallback(async (id: string) => {
		await window.vetta.scheduler.abortTask(id);
	}, []);

	const getTask = useCallback((id: string) => tasks.find((t) => t.id === id), [tasks]);

	return {
		tasks,
		createTask,
		updateTask,
		deleteTask,
		toggleTask,
		runNow,
		abortTask,
		getTask,
		refreshTasks,
		CRON_PRESETS,
	};
}

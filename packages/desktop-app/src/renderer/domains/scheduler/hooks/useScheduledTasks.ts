import { projectsAtom, type ScheduledTask, scheduledTasksAtom } from "@shared/store/atoms";
import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { CRON_PRESETS } from "./CRON_PRESETS";

export { CRON_PRESETS };

export function useScheduledTasks() {
	const [tasks, setTasks] = useAtom(scheduledTasksAtom);
	const setProjects = useSetAtom(projectsAtom);

	const refreshTasks = useCallback(async () => {
		const loaded = await window.vetta.scheduler.getTasks();
		setTasks(loaded);
	}, [setTasks]);

	const createTask = useCallback(
		async (data: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">) => {
			const task = await window.vetta.scheduler.createTask(data);
			setTasks((prev) => [...prev, task]);

			// Write meta.json to mark the project as schedule type
			if (task.cwd) {
				const meta = (await window.vetta.flowing.readMeta(task.cwd)) ?? {};
				if (meta.type !== "schedule") {
					await window.vetta.flowing.writeMeta(task.cwd, { ...meta, type: "schedule" });
				}
				setProjects((prev) => prev.map((p) => (p.cwd === task.cwd ? { ...p, type: "schedule" } : p)));
			}

			return task;
		},
		[setTasks, setProjects],
	);

	const updateTask = useCallback(
		async (id: string, patch: Partial<ScheduledTask>) => {
			const oldTask = tasks.find((t) => t.id === id);
			await window.vetta.scheduler.updateTask(id, patch);
			const updated = tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t));
			setTasks(updated);

			// If cwd changed, update meta for both old and new projects
			if (patch.cwd && oldTask?.cwd && patch.cwd !== oldTask.cwd) {
				// Mark new project as schedule
				const newMeta = (await window.vetta.flowing.readMeta(patch.cwd)) ?? {};
				if (newMeta.type !== "schedule") {
					await window.vetta.flowing.writeMeta(patch.cwd, { ...newMeta, type: "schedule" });
				}
				setProjects((prev) => prev.map((p) => (p.cwd === patch.cwd ? { ...p, type: "schedule" } : p)));
				// Clear old project if no more tasks target it
				if (!updated.some((t) => t.cwd === oldTask.cwd)) {
					const oldMeta = await window.vetta.flowing.readMeta(oldTask.cwd);
					if (oldMeta?.type === "schedule") {
						const { type: _, ...rest } = oldMeta;
						await window.vetta.flowing.writeMeta(oldTask.cwd, rest);
					}
					setProjects((prev) => prev.map((p) => (p.cwd === oldTask.cwd ? { ...p, type: "normal" } : p)));
				}
			}
		},
		[tasks, setTasks, setProjects],
	);

	const deleteTask = useCallback(
		async (id: string) => {
			const target = tasks.find((t) => t.id === id);
			await window.vetta.scheduler.deleteTask(id);
			const remaining = tasks.filter((t) => t.id !== id);
			setTasks(remaining);

			// If no more schedule tasks target this project, clear the schedule type
			if (target?.cwd && !remaining.some((t) => t.cwd === target.cwd)) {
				const meta = await window.vetta.flowing.readMeta(target.cwd);
				if (meta?.type === "schedule") {
					const { type: _, ...rest } = meta;
					await window.vetta.flowing.writeMeta(target.cwd, rest);
				}
				setProjects((prev) => prev.map((p) => (p.cwd === target.cwd ? { ...p, type: "normal" } : p)));
			}
		},
		[tasks, setTasks, setProjects],
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

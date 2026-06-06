import { projectsAtom, type ScheduledTask, scheduledTasksAtom } from "@shared/store/atoms";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { CRON_PRESETS } from "./CRON_PRESETS";

export { CRON_PRESETS };

export function useScheduledTasks() {
	const [tasks, setTasks] = useAtom(scheduledTasksAtom);
	const setProjects = useSetAtom(projectsAtom);

	const refreshTasks = useCallback(async () => {
		const loaded = await window.vetta.scheduler.getTasks();
		setTasks(loaded);
		const scheduledCwds = new Set(loaded.map((task) => task.cwd));
		setProjects((prev) =>
			prev.map((project) => {
				if (scheduledCwds.has(project.cwd)) return { ...project, type: "schedule" };
				if (project.type === "schedule") return { ...project, type: "normal" };
				return project;
			}),
		);
	}, [setProjects, setTasks]);

	useEffect(() => {
		return window.vetta.scheduler.onTaskEvent((event) => {
			if (event.type === "tasks.changed") {
				void refreshTasks();
			}
		});
	}, [refreshTasks]);

	const createTask = useCallback(
		async (data: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">) => {
			const task = await window.vetta.scheduler.createTask(data);
			setTasks((prev) => [...prev, task]);
			setProjects((prev) =>
				prev.map((project) => (project.cwd === task.cwd ? { ...project, type: "schedule" } : project)),
			);

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

			if (patch.cwd && oldTask?.cwd && patch.cwd !== oldTask.cwd) {
				setProjects((prev) => prev.map((p) => (p.cwd === patch.cwd ? { ...p, type: "schedule" } : p)));
				if (!updated.some((t) => t.cwd === oldTask.cwd)) {
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

			if (target?.cwd && !remaining.some((t) => t.cwd === target.cwd)) {
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

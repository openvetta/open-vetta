import { batchProjectsAtom, expandedBatchProjectsAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

export function useBatchTasks() {
	const [projects, setProjects] = useAtom(batchProjectsAtom);
	const [expandedProjects, setExpandedProjects] = useAtom(expandedBatchProjectsAtom);

	const refreshProjects = useCallback(async () => {
		const loadedProjects = await window.vetta.batchTasks.getProjects();
		setProjects(loadedProjects);
	}, [setProjects]);

	const createProject = useCallback(
		async (data: { name: string; prompt: string; folders: string[]; concurrency: number }) => {
			const project = await window.vetta.batchTasks.createProject(data);
			setProjects((prev) => [...prev, project]);
			return project;
		},
		[setProjects],
	);

	const updateProject = useCallback(
		async (
			projectId: string,
			data: { name?: string; prompt?: string; concurrency?: number; newFolders?: string[] },
		) => {
			await window.vetta.batchTasks.updateProject(projectId, data);
			setProjects((prev) =>
				prev.map((p) => {
					if (p.id !== projectId) return p;
					const newTasks = data.newFolders
						? data.newFolders
								.filter((cwd) => !p.tasks.some((t) => t.cwd === cwd))
								.map((cwd) => ({
									id: `batch-task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
									name: cwd.split("/").pop() ?? cwd,
									cwd,
									status: "pending" as const,
									createdAt: Date.now(),
									updatedAt: Date.now(),
								}))
						: [];
					return {
						...p,
						...(data.name !== undefined ? { name: data.name } : {}),
						...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
						...(data.concurrency !== undefined ? { concurrency: data.concurrency } : {}),
						tasks: [...p.tasks, ...newTasks],
						updatedAt: Date.now(),
					};
				}),
			);
		},
		[setProjects],
	);

	const deleteProject = useCallback(
		async (projectId: string) => {
			const project = projects.find((p) => p.id === projectId);
			if (project?.tasks.some((t) => t.status === "running")) {
				throw new Error("请先暂停所有任务");
			}
			await window.vetta.batchTasks.deleteProject(projectId);
			setProjects((prev) => prev.filter((p) => p.id !== projectId));
		},
		[projects, setProjects],
	);

	const toggleProject = useCallback(
		(projectId: string) => {
			setExpandedProjects((prev) => {
				const next = new Set(prev);
				if (next.has(projectId)) {
					next.delete(projectId);
				} else {
					next.add(projectId);
				}
				return next;
			});
		},
		[setExpandedProjects],
	);

	const runTask = useCallback(async (projectId: string, taskId: string) => {
		await window.vetta.batchTasks.runTask(projectId, taskId);
	}, []);

	const pauseTask = useCallback(async (projectId: string, taskId: string) => {
		await window.vetta.batchTasks.pauseTask(projectId, taskId);
	}, []);

	const resumeTask = useCallback(async (projectId: string, taskId: string) => {
		await window.vetta.batchTasks.resumeTask(projectId, taskId);
	}, []);

	const deleteTask = useCallback(
		async (projectId: string, taskId: string) => {
			await window.vetta.batchTasks.deleteTask(projectId, taskId);
			setProjects((prev) =>
				prev.map((p) =>
					p.id === projectId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId), updatedAt: Date.now() } : p,
				),
			);
		},
		[setProjects],
	);

	const batchRetryFailed = useCallback(async (projectId: string) => {
		await window.vetta.batchTasks.batchRetryFailed(projectId);
	}, []);

	const batchPause = useCallback(async (projectId: string) => {
		await window.vetta.batchTasks.batchPause(projectId);
	}, []);

	const batchResume = useCallback(async (projectId: string) => {
		await window.vetta.batchTasks.batchResume(projectId);
	}, []);

	const batchDelete = useCallback(
		async (projectId: string) => {
			await window.vetta.batchTasks.batchDelete(projectId);
			await refreshProjects();
		},
		[refreshProjects],
	);

	const deleteSession = useCallback(async (sessionPath: string) => {
		await window.vetta.batchTasks.deleteSession(sessionPath);
	}, []);

	const batchRunNeverExecuted = useCallback(async (projectId: string) => {
		await window.vetta.batchTasks.batchRunNeverExecuted(projectId);
	}, []);

	useEffect(() => {
		const unsubscribe = window.vetta.batchTasks.onTaskEvent((event) => {
			setProjects((prev) =>
				prev.map((p) => {
					if (p.id !== event.projectId) return p;
					return {
						...p,
						tasks: p.tasks.map((t) => {
							if (t.id !== event.taskId) return t;
							if (event.type === "task.started") {
								return {
									...t,
									status: "running" as const,
									sessionId: event.sessionId,
									sessionPath: event.sessionPath,
								};
							}
							if (event.type === "task.completed") {
								return { ...t, status: "completed" as const };
							}
							if (event.type === "task.failed") {
								return { ...t, status: "failed" as const, error: event.error };
							}
							if (event.type === "task.paused") {
								return { ...t, status: "paused" as const };
							}
							if (event.type === "task.resumed") {
								return { ...t, status: "running" as const };
							}
							return t;
						}),
					};
				}),
			);
		});
		return unsubscribe;
	}, [setProjects]);

	return {
		projects,
		expandedProjects,
		refreshProjects,
		createProject,
		updateProject,
		deleteProject,
		toggleProject,
		runTask,
		pauseTask,
		resumeTask,
		deleteTask,
		batchRetryFailed,
		batchPause,
		batchResume,
		batchDelete,
		deleteSession,
		batchRunNeverExecuted,
	};
}

import { useProjects } from "@domains/project/hooks/useProjects";
import { pathBasename } from "@shared/lib/utils";
import { batchProjectsAtom, type ExecutionModeOverride, expandedBatchProjectsAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

export function useBatchTasks() {
	const [projects, setProjects] = useAtom(batchProjectsAtom);
	const [expandedProjects, setExpandedProjects] = useAtom(expandedBatchProjectsAtom);
	// Batch project create/delete also mutates desktop-config.json (single
	// source of sidebar truth), so we must refresh the config-driven project
	// list whenever a batch CRUD lands.
	const { refreshProjects: refreshConfigProjects } = useProjects();

	const refreshProjects = useCallback(async () => {
		const loadedProjects = await window.vetta.batchTasks.getProjects();
		setProjects(loadedProjects);
	}, [setProjects]);

	const createProject = useCallback(
		async (data: {
			name: string;
			prompt: string;
			modelKey?: string;
			executionMode?: ExecutionModeOverride;
			folders: string[];
			concurrency: number;
			artifactPatterns?: string[];
			notifyEnabled?: boolean;
		}) => {
			const project = await window.vetta.batchTasks.createProject(data);
			setProjects((prev) => [...prev, project]);
			await refreshConfigProjects();
			return project;
		},
		[setProjects, refreshConfigProjects],
	);

	const updateProject = useCallback(
		async (
			projectId: string,
			data: {
				name?: string;
				prompt?: string;
				modelKey?: string;
				executionMode?: ExecutionModeOverride;
				concurrency?: number;
				artifactPatterns?: string[];
				notifyEnabled?: boolean;
				newFolders?: string[];
			},
		) => {
			await window.vetta.batchTasks.updateProject(projectId, data);
			setProjects((prev) =>
				prev.map((p) => {
					if (p.id !== projectId) return p;
					const newTasks = data.newFolders
						? data.newFolders
								.filter((sourcePath) => !p.tasks.some((t) => t.sourcePath === sourcePath))
								.map((sourcePath) => ({
									id: `batch-task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
									name: pathBasename(sourcePath),
									cwd: sourcePath,
									sourcePath,
									status: "pending" as const,
									createdAt: Date.now(),
									updatedAt: Date.now(),
								}))
						: [];
					return {
						...p,
						...(data.name !== undefined ? { name: data.name } : {}),
						...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
						...(data.modelKey !== undefined ? { modelKey: data.modelKey } : {}),
						...(data.executionMode !== undefined ? { executionMode: data.executionMode } : {}),
						...(data.concurrency !== undefined ? { concurrency: data.concurrency } : {}),
						...(data.artifactPatterns !== undefined ? { artifactPatterns: data.artifactPatterns } : {}),
						...(data.notifyEnabled !== undefined ? { notifyEnabled: data.notifyEnabled } : {}),
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
			await refreshConfigProjects();
		},
		[projects, setProjects, refreshConfigProjects],
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

	const retryTask = useCallback(async (projectId: string, taskId: string) => {
		await window.vetta.batchTasks.retryTask(projectId, taskId);
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

	const batchClearFailedAndRetry = useCallback(async (projectId: string) => {
		await window.vetta.batchTasks.batchClearFailedAndRetry(projectId);
	}, []);

	const batchClearFailed = useCallback(async (projectId: string) => {
		await window.vetta.batchTasks.batchClearFailed(projectId);
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

	const batchRestartAll = useCallback(
		async (projectId: string) => {
			await window.vetta.batchTasks.batchRestartAll(projectId);
			await refreshProjects();
		},
		[refreshProjects],
	);

	useEffect(() => {
		const unsubscribe = window.vetta.batchTasks.onTaskEvent((event) => {
			console.log(`[BatchTaskRenderer] Event received: ${event.type}`, {
				projectId: event.projectId,
				taskId: event.taskId,
			});
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
									executionMode: event.executionMode,
									updatedAt: Date.now(),
								};
							}
							if (event.type === "task.completed") {
								return { ...t, status: "completed" as const, updatedAt: Date.now() };
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
							if (event.type === "task.reset") {
								return {
									...t,
									status: "pending" as const,
									sessionId: undefined,
									sessionPath: undefined,
									error: undefined,
									updatedAt: Date.now(),
								};
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
		retryTask,
		pauseTask,
		resumeTask,
		deleteTask,
		batchRetryFailed,
		batchClearFailedAndRetry,
		batchClearFailed,
		batchPause,
		batchResume,
		batchDelete,
		deleteSession,
		batchRunNeverExecuted,
		batchRestartAll,
	};
}

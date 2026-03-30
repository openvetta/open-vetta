import {
	type BatchProject,
	type BatchTask,
	batchProjectsAtom,
	batchSessionsMapAtom,
	expandedBatchProjectsAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";

export function useBatchTasks() {
	const [projects, setProjects] = useAtom(batchProjectsAtom);
	const sessionsMap = useAtomValue(batchSessionsMapAtom);
	const [expandedProjects, setExpandedProjects] = useAtom(expandedBatchProjectsAtom);

	const refreshProjects = () => {
		// TODO: implement refresh from storage/IPC
	};

	const createProject = (data: { name: string; prompt: string; folders: string[] }) => {
		const now = Date.now();
		const tasks: BatchTask[] = data.folders.map((cwd, index) => ({
			id: `batch-task-${now}-${index}`,
			name: cwd.split("/").pop() ?? cwd,
			prompt: data.prompt,
			cwd,
			status: "pending" as const,
			createdAt: now,
			updatedAt: now,
		}));

		const newProject: BatchProject = {
			id: `batch-project-${now}`,
			name: data.name,
			prompt: data.prompt,
			tasks,
			createdAt: now,
			updatedAt: now,
		};

		setProjects((prev) => [...prev, newProject]);
		return newProject;
	};

	const updateProject = (projectId: string, data: { name?: string; prompt?: string }) => {
		setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...data, updatedAt: Date.now() } : p)));
	};

	const deleteProject = (projectId: string) => {
		setProjects((prev) => prev.filter((p) => p.id !== projectId));
	};

	const toggleProject = (projectId: string) => {
		setExpandedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	};

	const runTask = (_projectId: string, _taskId: string) => {
		// TODO: implement task execution
	};

	const pauseTask = (_projectId: string, _taskId: string) => {
		// TODO: implement task pause
	};

	const resumeTask = (_projectId: string, _taskId: string) => {
		// TODO: implement task resume
	};

	const deleteTask = (projectId: string, taskId: string) => {
		setProjects((prev) =>
			prev.map((p) =>
				p.id === projectId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId), updatedAt: Date.now() } : p,
			),
		);
	};

	return {
		projects,
		sessionsMap,
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
	};
}

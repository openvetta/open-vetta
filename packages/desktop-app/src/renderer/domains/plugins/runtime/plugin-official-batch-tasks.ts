import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";

export function createOfficialBatchTasksApi(assertOfficial: () => void): PluginOfficialApi["batchTasks"] {
	return {
		listProjects: async () => {
			assertOfficial();
			return window.vetta.batchTasks.getProjects();
		},
		getProject: async (projectId) => {
			assertOfficial();
			const project = (await window.vetta.batchTasks.getProjects()).find((item) => item.id === projectId);
			if (!project) throw new Error(`Batch project not found: ${projectId}`);
			return project;
		},
		listProjectIds: async () => {
			assertOfficial();
			return (await window.vetta.batchTasks.getProjects()).map((item) => item.id);
		},
		createProject: async (data) => {
			assertOfficial();
			return window.vetta.batchTasks.createProject(data);
		},
		updateProject: async (projectId, data) => {
			assertOfficial();
			await window.vetta.batchTasks.updateProject(projectId, data);
			const project = (await window.vetta.batchTasks.getProjects()).find((item) => item.id === projectId);
			if (!project) throw new Error(`Batch project not found: ${projectId}`);
			return project;
		},
		deleteProject: async (projectId) => {
			assertOfficial();
			await window.vetta.batchTasks.deleteProject(projectId);
			return { projectId, operation: "delete" };
		},
		runTask: async (projectId, taskId) => {
			assertOfficial();
			await window.vetta.batchTasks.runTask(projectId, taskId);
			return { projectId, taskId, operation: "run" };
		},
		retryTask: async (projectId, taskId) => {
			assertOfficial();
			await window.vetta.batchTasks.retryTask(projectId, taskId);
			return { projectId, taskId, operation: "retry" };
		},
		stopTask: async (projectId, taskId) => {
			assertOfficial();
			await window.vetta.batchTasks.stopTask(projectId, taskId);
			return { projectId, taskId, operation: "stop" };
		},
		deleteTask: async (projectId, taskId) => {
			assertOfficial();
			await window.vetta.batchTasks.deleteTask(projectId, taskId);
			return { projectId, taskId, operation: "delete" };
		},
		resumeTask: async (projectId, taskId) => {
			assertOfficial();
			await window.vetta.batchTasks.resumeTask(projectId, taskId);
			return { projectId, taskId, operation: "resume" };
		},
		resumeTaskWithText: async (projectId, taskId, text) => {
			assertOfficial();
			await window.vetta.batchTasks.resumeTaskWithText(projectId, taskId, text);
			return { projectId, taskId, operation: "resume-with-text" };
		},
		deleteTaskSession: async (projectId, taskId) => {
			assertOfficial();
			const project = (await window.vetta.batchTasks.getProjects()).find((item) => item.id === projectId);
			if (!project) throw new Error(`Batch project not found: ${projectId}`);
			const task = project.tasks.find((item) => item.id === taskId);
			if (!task) throw new Error(`Batch task not found: ${taskId}`);
			if (!task.sessionPath) return { projectId, taskId, operation: "delete-session", status: "noop" };
			await window.vetta.batchTasks.deleteSession(task.sessionPath);
			return { projectId, taskId, operation: "delete-session" };
		},
		batchDelete: async (projectId) => {
			assertOfficial();
			await window.vetta.batchTasks.batchDelete(projectId);
			return { projectId, operation: "delete-all" };
		},
		batchStart: async (projectId) => {
			assertOfficial();
			await window.vetta.batchTasks.batchStart(projectId);
			return { projectId, operation: "start" };
		},
		batchStop: async (projectId) => {
			assertOfficial();
			await window.vetta.batchTasks.batchStop(projectId);
			return { projectId, operation: "stop" };
		},
		batchReset: async (projectId) => {
			assertOfficial();
			await window.vetta.batchTasks.batchReset(projectId);
			return { projectId, operation: "reset" };
		},
		batchResetFailed: async (projectId, taskIds) => {
			assertOfficial();
			await window.vetta.batchTasks.batchResetFailed(projectId, taskIds);
			return { projectId, taskIds, operation: "reset-failed" };
		},
	};
}

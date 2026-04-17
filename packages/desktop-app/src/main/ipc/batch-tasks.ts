import { ipcMain, type WebContents } from "electron";
import type { RuntimeHost } from "../../../../runtime-core/src/index.js";
import {
	isTaskRunning,
	pauseTask as pauseTaskExecutor,
	resumeTask,
	runTask,
	subscribeBatchTaskEvents,
} from "../batch-tasks/batch-task-executor";
import { deleteTaskState, recoverRunningTasks } from "../batch-tasks/batch-task-state";
import {
	createProject,
	deleteProject,
	getProject,
	loadProjects,
	removeTaskFromProject,
	updateProject as updateProjectStorage,
} from "../batch-tasks/batch-task-storage";
import { pLimit } from "../batch-tasks/queue";
import { getSharedRuntime } from "../runtime.js";

const CHANNELS = {
	GET_PROJECTS: "vetta:batch-tasks:get-projects",
	CREATE_PROJECT: "vetta:batch-tasks:create-project",
	UPDATE_PROJECT: "vetta:batch-tasks:update-project",
	DELETE_PROJECT: "vetta:batch-tasks:delete-project",
	RUN_TASK: "vetta:batch-tasks:run-task",
	PAUSE_TASK: "vetta:batch-tasks:pause-task",
	RESUME_TASK: "vetta:batch-tasks:resume-task",
	DELETE_TASK: "vetta:batch-tasks:delete-task",
	BATCH_RETRY_FAILED: "vetta:batch-tasks:batch-retry-failed",
	BATCH_PAUSE: "vetta:batch-tasks:batch-pause",
	BATCH_RESUME: "vetta:batch-tasks:batch-resume",
	BATCH_DELETE: "vetta:batch-tasks:batch-delete",
	BATCH_RUN_NEVER_EXECUTED: "vetta:batch-tasks:batch-run-never-executed",
	DELETE_SESSION: "vetta:batch-tasks:delete-session",
	EVENT: "vetta:batch-tasks:event",
} as const;

function getRuntime(): RuntimeHost {
	return getSharedRuntime();
}

export function registerBatchTasksIpc(webContents: WebContents): () => void {
	console.log(`[BatchTaskIPC] registerBatchTasksIpc: subscribing to batch task events`);
	subscribeBatchTaskEvents((event) => {
		console.log(`[BatchTaskIPC] Forwarding batch task event to renderer: ${event.type}`, event);
		webContents.send(CHANNELS.EVENT, event);
	});

	void recoverRunningTasks();

	ipcMain.handle(CHANNELS.GET_PROJECTS, async () => {
		console.log(`[BatchTaskIPC] GET_PROJECTS`);
		return loadProjects();
	});

	ipcMain.handle(
		CHANNELS.CREATE_PROJECT,
		async (_, data: { name: string; prompt: string; modelKey?: string; folders: string[]; concurrency: number }) => {
			console.log(`[BatchTaskIPC] CREATE_PROJECT: ${data.name}`);
			return createProject(data.name, data.prompt, data.modelKey, data.folders, data.concurrency);
		},
	);

	ipcMain.handle(
		CHANNELS.UPDATE_PROJECT,
		async (
			_,
			projectId: string,
			data: Partial<{ name: string; prompt: string; modelKey: string; concurrency: number; newFolders: string[] }>,
		) => {
			console.log(`[BatchTaskIPC] UPDATE_PROJECT: ${projectId}`);
			await updateProjectStorage(projectId, data);
		},
	);

	ipcMain.handle(CHANNELS.DELETE_PROJECT, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] DELETE_PROJECT: ${projectId}`);
		await deleteProject(projectId);
	});

	ipcMain.handle(CHANNELS.RUN_TASK, async (_, projectId: string, taskId: string) => {
		console.log(`[BatchTaskIPC] RUN_TASK: project=${projectId}, task=${taskId}`);
		const project = await getProject(projectId);
		if (!project) {
			console.warn(`[BatchTaskIPC] RUN_TASK: project ${projectId} not found`);
			return;
		}
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) {
			console.warn(`[BatchTaskIPC] RUN_TASK: task ${taskId} not found`);
			return;
		}
		await runTask(project, task, getRuntime());
	});

	ipcMain.handle(CHANNELS.PAUSE_TASK, async (_, projectId: string, taskId: string) => {
		console.log(`[BatchTaskIPC] PAUSE_TASK: project=${projectId}, task=${taskId}`);
		await pauseTaskExecutor(projectId, taskId, getRuntime());
	});

	ipcMain.handle(CHANNELS.RESUME_TASK, async (_, projectId: string, taskId: string) => {
		console.log(`[BatchTaskIPC] RESUME_TASK: project=${projectId}, task=${taskId}`);
		const project = await getProject(projectId);
		if (!project) {
			console.warn(`[BatchTaskIPC] RESUME_TASK: project ${projectId} not found`);
			return;
		}
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) {
			console.warn(`[BatchTaskIPC] RESUME_TASK: task ${taskId} not found`);
			return;
		}
		await resumeTask(project, task, getRuntime());
	});

	ipcMain.handle(CHANNELS.DELETE_TASK, async (_, projectId: string, taskId: string) => {
		console.log(`[BatchTaskIPC] DELETE_TASK: project=${projectId}, task=${taskId}`);
		if (isTaskRunning(taskId)) {
			console.warn(`[BatchTaskIPC] DELETE_TASK: task ${taskId} is running, skip`);
			return;
		}
		await removeTaskFromProject(projectId, taskId);
		await deleteTaskState(projectId, taskId);
	});

	ipcMain.handle(CHANNELS.BATCH_RETRY_FAILED, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_RETRY_FAILED: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;

		const failedTasks = project.tasks.filter((t) => t.status === "failed");
		if (failedTasks.length === 0) {
			console.log(`[BatchTaskIPC] BATCH_RETRY_FAILED: no failed tasks in ${projectId}`);
			return;
		}
		console.log(`[BatchTaskIPC] BATCH_RETRY_FAILED: retrying ${failedTasks.length} tasks`);
		const runtime = getRuntime();
		const taskRunners = failedTasks.map((task) => () => runTask(project, task, runtime));
		await pLimit(project.concurrency, taskRunners);
	});

	ipcMain.handle(CHANNELS.BATCH_PAUSE, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_PAUSE: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;
		const runtime = getRuntime();
		for (const task of project.tasks) {
			if (task.status === "running") {
				await pauseTaskExecutor(projectId, task.id, runtime);
			}
		}
	});

	ipcMain.handle(CHANNELS.BATCH_RESUME, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_RESUME: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;
		for (const task of project.tasks) {
			if (task.status === "paused") {
				await resumeTask(project, task, getRuntime());
			}
		}
	});

	ipcMain.handle(CHANNELS.BATCH_DELETE, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_DELETE: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;
		for (const task of project.tasks) {
			if (task.status !== "running") {
				await removeTaskFromProject(projectId, task.id);
				await deleteTaskState(projectId, task.id);
			}
		}
	});

	ipcMain.handle(CHANNELS.BATCH_RUN_NEVER_EXECUTED, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_RUN_NEVER_EXECUTED: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;

		const pendingTasks = project.tasks.filter((t) => t.status === "pending" && !t.sessionId);
		if (pendingTasks.length === 0) {
			console.log(`[BatchTaskIPC] BATCH_RUN_NEVER_EXECUTED: no pending tasks in ${projectId}`);
			return;
		}
		console.log(`[BatchTaskIPC] BATCH_RUN_NEVER_EXECUTED: running ${pendingTasks.length} tasks`);
		const runtime = getRuntime();
		const taskRunners = pendingTasks.map((task) => () => runTask(project, task, runtime));
		await pLimit(project.concurrency, taskRunners);
	});

	ipcMain.handle(CHANNELS.DELETE_SESSION, async (_, sessionPath: string) => {
		console.log(`[BatchTaskIPC] DELETE_SESSION: ${sessionPath}`);
		await getRuntime().deleteSession(sessionPath);
	});

	return () => {
		ipcMain.removeHandler(CHANNELS.GET_PROJECTS);
		ipcMain.removeHandler(CHANNELS.CREATE_PROJECT);
		ipcMain.removeHandler(CHANNELS.UPDATE_PROJECT);
		ipcMain.removeHandler(CHANNELS.DELETE_PROJECT);
		ipcMain.removeHandler(CHANNELS.RUN_TASK);
		ipcMain.removeHandler(CHANNELS.PAUSE_TASK);
		ipcMain.removeHandler(CHANNELS.RESUME_TASK);
		ipcMain.removeHandler(CHANNELS.DELETE_TASK);
		ipcMain.removeHandler(CHANNELS.BATCH_RETRY_FAILED);
		ipcMain.removeHandler(CHANNELS.BATCH_PAUSE);
		ipcMain.removeHandler(CHANNELS.BATCH_RESUME);
		ipcMain.removeHandler(CHANNELS.BATCH_DELETE);
		ipcMain.removeHandler(CHANNELS.BATCH_RUN_NEVER_EXECUTED);
		ipcMain.removeHandler(CHANNELS.DELETE_SESSION);
	};
}

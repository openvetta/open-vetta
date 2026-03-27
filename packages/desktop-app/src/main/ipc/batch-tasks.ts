import { ipcMain, type WebContents } from "electron";
import { RuntimeHost } from "../../../../runtime-core/src/index.js";
import {
	isTaskRunning,
	pauseTask as pauseTaskExecutor,
	resumeTask,
	runTask,
	subscribeBatchTaskEvents,
} from "../batch-tasks/batch-task-executor";
import { deleteProjectTaskStates, deleteTaskState, recoverRunningTasks } from "../batch-tasks/batch-task-state";
import {
	createProject,
	deleteProject,
	getProject,
	loadProjects,
	removeTaskFromProject,
	updateProject as updateProjectStorage,
} from "../batch-tasks/batch-task-storage";

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

let runtimeInstance: RuntimeHost | null = null;

function getRuntime(): RuntimeHost {
	if (!runtimeInstance) {
		runtimeInstance = new RuntimeHost();
	}
	return runtimeInstance;
}

export function registerBatchTasksIpc(webContents: WebContents): () => void {
	subscribeBatchTaskEvents((event) => {
		webContents.send(CHANNELS.EVENT, event);
	});

	void recoverRunningTasks();

	ipcMain.handle(CHANNELS.GET_PROJECTS, async () => {
		return loadProjects();
	});

	ipcMain.handle(
		CHANNELS.CREATE_PROJECT,
		async (_, data: { name: string; prompt: string; folders: string[]; concurrency: number }) => {
			return createProject(data.name, data.prompt, data.folders, data.concurrency);
		},
	);

	ipcMain.handle(
		CHANNELS.UPDATE_PROJECT,
		async (
			_,
			projectId: string,
			data: Partial<{ name: string; prompt: string; concurrency: number; newFolders: string[] }>,
		) => {
			await updateProjectStorage(projectId, data);
		},
	);

	ipcMain.handle(CHANNELS.DELETE_PROJECT, async (_, projectId: string) => {
		await deleteProject(projectId);
		await deleteProjectTaskStates(projectId);
	});

	ipcMain.handle(CHANNELS.RUN_TASK, async (_, projectId: string, taskId: string) => {
		const project = await getProject(projectId);
		if (!project) return;
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) return;
		await runTask(project, task, getRuntime());
	});

	ipcMain.handle(CHANNELS.PAUSE_TASK, async (_, projectId: string, taskId: string) => {
		await pauseTaskExecutor(projectId, taskId, getRuntime());
	});

	ipcMain.handle(CHANNELS.RESUME_TASK, async (_, projectId: string, taskId: string) => {
		const project = await getProject(projectId);
		if (!project) return;
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) return;
		await resumeTask(project, task, getRuntime());
	});

	ipcMain.handle(CHANNELS.DELETE_TASK, async (_, projectId: string, taskId: string) => {
		if (isTaskRunning(taskId)) return;
		await removeTaskFromProject(projectId, taskId);
		await deleteTaskState(projectId, taskId);
	});

	ipcMain.handle(CHANNELS.BATCH_RETRY_FAILED, async (_, projectId: string) => {
		const project = await getProject(projectId);
		if (!project) return;
		for (const task of project.tasks) {
			if (task.status === "failed") {
				task.status = "pending";
				await runTask(project, task, getRuntime());
			}
		}
	});

	ipcMain.handle(CHANNELS.BATCH_PAUSE, async (_, projectId: string) => {
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
		const project = await getProject(projectId);
		if (!project) return;
		for (const task of project.tasks) {
			if (task.status === "paused") {
				await resumeTask(project, task, getRuntime());
			}
		}
	});

	ipcMain.handle(CHANNELS.BATCH_DELETE, async (_, projectId: string) => {
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
		const project = await getProject(projectId);
		if (!project) return;
		for (const task of project.tasks) {
			if (task.status === "pending" && !task.sessionId) {
				await runTask(project, task, getRuntime());
			}
		}
	});

	ipcMain.handle(CHANNELS.DELETE_SESSION, async (_, sessionPath: string) => {
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

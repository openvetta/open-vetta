import { ipcMain, type WebContents } from "electron";
import type { RuntimeHost } from "../../../../runtime-core/src/index.js";
import {
	emitBatchTaskEvent,
	isTaskRunning,
	pauseTask as pauseTaskExecutor,
	resumeTask,
	runTask,
	subscribeBatchTaskEvents,
} from "../batch-tasks/batch-task-executor";
import { clearAllTaskStates, deleteTaskState, recoverRunningTasks } from "../batch-tasks/batch-task-state";
import type { BatchTask } from "../batch-tasks/batch-task-storage";
import {
	createProject,
	deleteProject,
	getProject,
	loadProjects,
	removeTaskFromProject,
	resetProjectFiles,
	resetTaskFiles,
	updateProject as updateProjectStorage,
} from "../batch-tasks/batch-task-storage";
import { pLimit } from "../batch-tasks/queue";
import type { ExecutionModeOverride } from "../execution-mode.js";
import { getSharedRuntime } from "../runtime.js";

const CHANNELS = {
	GET_PROJECTS: "vetta:batch-tasks:get-projects",
	CREATE_PROJECT: "vetta:batch-tasks:create-project",
	UPDATE_PROJECT: "vetta:batch-tasks:update-project",
	DELETE_PROJECT: "vetta:batch-tasks:delete-project",
	RUN_TASK: "vetta:batch-tasks:run-task",
	RETRY_TASK: "vetta:batch-tasks:retry-task",
	PAUSE_TASK: "vetta:batch-tasks:pause-task",
	RESUME_TASK: "vetta:batch-tasks:resume-task",
	DELETE_TASK: "vetta:batch-tasks:delete-task",
	BATCH_RETRY_FAILED: "vetta:batch-tasks:batch-retry-failed",
	BATCH_CLEAR_FAILED_AND_RETRY: "vetta:batch-tasks:batch-clear-failed-and-retry",
	BATCH_CLEAR_FAILED: "vetta:batch-tasks:batch-clear-failed",
	BATCH_PAUSE: "vetta:batch-tasks:batch-pause",
	BATCH_RESUME: "vetta:batch-tasks:batch-resume",
	BATCH_DELETE: "vetta:batch-tasks:batch-delete",
	BATCH_RUN_NEVER_EXECUTED: "vetta:batch-tasks:batch-run-never-executed",
	BATCH_RESTART_ALL: "vetta:batch-tasks:batch-restart-all",
	DELETE_SESSION: "vetta:batch-tasks:delete-session",
	EVENT: "vetta:batch-tasks:event",
} as const;

function getRuntime(): RuntimeHost {
	return getSharedRuntime();
}

async function cleanTaskFilesAndState(projectId: string, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	if (isTaskRunning(task.id)) {
		await pauseTaskExecutor(projectId, task.id, runtime);
	}
	if (task.sessionPath) {
		try {
			await runtime.deleteSession(task.sessionPath);
		} catch {
			// session may already be gone
		}
	}
	await deleteTaskState(projectId, task.id);
	await resetTaskFiles(projectId, task.id);
}

export function registerBatchTasksIpc(webContents: WebContents): () => void {
	console.log(`[BatchTaskIPC] registerBatchTasksIpc: subscribing to batch task events`);
	const unsubscribeBatchEvents = subscribeBatchTaskEvents((event) => {
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
		async (
			_,
			data: {
				name: string;
				prompt: string;
				modelKey?: string;
				folders: string[];
				concurrency: number;
				executionMode?: ExecutionModeOverride;
				artifactPatterns?: string[];
				notifyEnabled?: boolean;
			},
		) => {
			console.log(`[BatchTaskIPC] CREATE_PROJECT: ${data.name}`);
			return createProject(
				data.name,
				data.prompt,
				data.modelKey,
				data.folders,
				data.concurrency,
				data.executionMode,
				data.artifactPatterns,
				data.notifyEnabled,
			);
		},
	);

	ipcMain.handle(
		CHANNELS.UPDATE_PROJECT,
		async (
			_,
			projectId: string,
			data: Partial<{
				name: string;
				prompt: string;
				modelKey: string;
				concurrency: number;
				executionMode: ExecutionModeOverride;
				artifactPatterns: string[];
				notifyEnabled: boolean;
				newFolders: string[];
			}>,
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

	ipcMain.handle(CHANNELS.RETRY_TASK, async (_, projectId: string, taskId: string) => {
		console.log(`[BatchTaskIPC] RETRY_TASK: project=${projectId}, task=${taskId}`);
		const project = await getProject(projectId);
		if (!project) {
			console.warn(`[BatchTaskIPC] RETRY_TASK: project ${projectId} not found`);
			return;
		}
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) {
			console.warn(`[BatchTaskIPC] RETRY_TASK: task ${taskId} not found`);
			return;
		}
		const runtime = getRuntime();
		await cleanTaskFilesAndState(projectId, task, runtime);
		await runTask(project, task, runtime);
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
		const taskRunners = failedTasks.map((task) => async () => {
			await cleanTaskFilesAndState(projectId, task, runtime);
			await runTask(project, task, runtime);
		});
		await pLimit(project.concurrency, taskRunners);
	});

	// 与 BATCH_RETRY_FAILED 的差别：先把所有失败任务一次性清理为 pending（UI
	// 上立刻看到失败标记消失），再按并发数排队执行。RETRY_FAILED 是逐个 worker
	// 拿到任务后才清理，所以排队中的失败任务在 UI 上会一直显示"失败"直到轮到它。
	ipcMain.handle(CHANNELS.BATCH_CLEAR_FAILED_AND_RETRY, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_CLEAR_FAILED_AND_RETRY: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;

		const failedTasks = project.tasks.filter((t) => t.status === "failed");
		if (failedTasks.length === 0) {
			console.log(`[BatchTaskIPC] BATCH_CLEAR_FAILED_AND_RETRY: no failed tasks in ${projectId}`);
			return;
		}
		console.log(`[BatchTaskIPC] BATCH_CLEAR_FAILED_AND_RETRY: resetting ${failedTasks.length} tasks then retrying`);
		const runtime = getRuntime();

		await Promise.all(
			failedTasks.map(async (task) => {
				await cleanTaskFilesAndState(projectId, task, runtime);
				emitBatchTaskEvent({ type: "task.reset", projectId, taskId: task.id });
			}),
		);

		const taskRunners = failedTasks.map((task) => () => runTask(project, task, runtime));
		await pLimit(project.concurrency, taskRunners);
	});

	// 仅清空失败任务的状态与产物，不重新执行。失败任务的 session、task-state、
	// 工作目录会被并行清理，UI 立即收到 task.reset 把状态重置为 pending。
	ipcMain.handle(CHANNELS.BATCH_CLEAR_FAILED, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_CLEAR_FAILED: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;

		const failedTasks = project.tasks.filter((t) => t.status === "failed");
		if (failedTasks.length === 0) {
			console.log(`[BatchTaskIPC] BATCH_CLEAR_FAILED: no failed tasks in ${projectId}`);
			return;
		}
		console.log(`[BatchTaskIPC] BATCH_CLEAR_FAILED: clearing ${failedTasks.length} tasks`);
		const runtime = getRuntime();

		await Promise.all(
			failedTasks.map(async (task) => {
				await cleanTaskFilesAndState(projectId, task, runtime);
				emitBatchTaskEvent({ type: "task.reset", projectId, taskId: task.id });
			}),
		);
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

		const pausedTasks = project.tasks.filter((t) => t.status === "paused");
		if (pausedTasks.length === 0) {
			console.log(`[BatchTaskIPC] BATCH_RESUME: no paused tasks in ${projectId}`);
			return;
		}
		console.log(`[BatchTaskIPC] BATCH_RESUME: resuming ${pausedTasks.length} tasks`);
		const runtime = getRuntime();
		const taskRunners = pausedTasks.map((task) => () => resumeTask(project, task, runtime));
		await pLimit(project.concurrency, taskRunners);
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

	ipcMain.handle(CHANNELS.BATCH_RESTART_ALL, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_RESTART_ALL: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;

		const runtime = getRuntime();

		// 1. Pause all running tasks
		for (const task of project.tasks) {
			if (isTaskRunning(task.id)) {
				await pauseTaskExecutor(projectId, task.id, runtime);
			}
		}

		// 2. Delete all session files via runtime
		for (const task of project.tasks) {
			if (task.sessionPath) {
				try {
					await runtime.deleteSession(task.sessionPath);
				} catch {
					// session may already be gone
				}
			}
		}

		// 3. Clear task states cache
		await clearAllTaskStates(projectId);

		// 4. Delete all item directories, sessions, task-states.json; keep meta.json; rebuild empty item dirs
		await resetProjectFiles(projectId);

		// 5. Re-load project (now all tasks are pending) and run all
		const refreshedProject = await getProject(projectId);
		if (!refreshedProject) return;
		console.log(`[BatchTaskIPC] BATCH_RESTART_ALL: restarting ${refreshedProject.tasks.length} tasks`);
		const taskRunners = refreshedProject.tasks.map((task) => () => runTask(refreshedProject, task, runtime));
		await pLimit(refreshedProject.concurrency, taskRunners);
	});

	ipcMain.handle(CHANNELS.DELETE_SESSION, async (_, sessionPath: string) => {
		console.log(`[BatchTaskIPC] DELETE_SESSION: ${sessionPath}`);
		await getRuntime().deleteSession(sessionPath);
	});

	return () => {
		unsubscribeBatchEvents();
		ipcMain.removeHandler(CHANNELS.GET_PROJECTS);
		ipcMain.removeHandler(CHANNELS.CREATE_PROJECT);
		ipcMain.removeHandler(CHANNELS.UPDATE_PROJECT);
		ipcMain.removeHandler(CHANNELS.DELETE_PROJECT);
		ipcMain.removeHandler(CHANNELS.RUN_TASK);
		ipcMain.removeHandler(CHANNELS.RETRY_TASK);
		ipcMain.removeHandler(CHANNELS.PAUSE_TASK);
		ipcMain.removeHandler(CHANNELS.RESUME_TASK);
		ipcMain.removeHandler(CHANNELS.DELETE_TASK);
		ipcMain.removeHandler(CHANNELS.BATCH_RETRY_FAILED);
		ipcMain.removeHandler(CHANNELS.BATCH_CLEAR_FAILED_AND_RETRY);
		ipcMain.removeHandler(CHANNELS.BATCH_CLEAR_FAILED);
		ipcMain.removeHandler(CHANNELS.BATCH_PAUSE);
		ipcMain.removeHandler(CHANNELS.BATCH_RESUME);
		ipcMain.removeHandler(CHANNELS.BATCH_DELETE);
		ipcMain.removeHandler(CHANNELS.BATCH_RUN_NEVER_EXECUTED);
		ipcMain.removeHandler(CHANNELS.BATCH_RESTART_ALL);
		ipcMain.removeHandler(CHANNELS.DELETE_SESSION);
	};
}

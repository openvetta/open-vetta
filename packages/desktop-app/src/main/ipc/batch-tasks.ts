import { ipcMain, type WebContents } from "electron";
import type { RuntimeHost } from "../../../../runtime-core/src/index.js";
import {
	abortTask as abortTaskExecutor,
	emitBatchTaskEvent,
	enqueueResumeTask,
	enqueueRunTask,
	isTaskQueued,
	isTaskRunning,
	removeFromPending,
	subscribeBatchTaskEvents,
} from "../batch-tasks/batch-task-executor";
import { clearAllTaskStates, deleteTaskState, recoverRunningTasks } from "../batch-tasks/batch-task-state";
import type { BatchSkillRef, BatchTask } from "../batch-tasks/batch-task-storage";
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
import type { ExecutionModeOverride } from "../execution-mode.js";
import { getSharedRuntime } from "../runtime.js";

const CHANNELS = {
	GET_PROJECTS: "vetta:batch-tasks:get-projects",
	CREATE_PROJECT: "vetta:batch-tasks:create-project",
	UPDATE_PROJECT: "vetta:batch-tasks:update-project",
	DELETE_PROJECT: "vetta:batch-tasks:delete-project",
	RUN_TASK: "vetta:batch-tasks:run-task",
	RETRY_TASK: "vetta:batch-tasks:retry-task",
	STOP_TASK: "vetta:batch-tasks:stop-task",
	DELETE_TASK: "vetta:batch-tasks:delete-task",
	BATCH_DELETE: "vetta:batch-tasks:batch-delete",
	BATCH_START: "vetta:batch-tasks:batch-start",
	BATCH_STOP: "vetta:batch-tasks:batch-stop",
	BATCH_RESET: "vetta:batch-tasks:batch-reset",
	BATCH_RESET_FAILED: "vetta:batch-tasks:batch-reset-failed",
	DELETE_SESSION: "vetta:batch-tasks:delete-session",
	RESUME_TASK: "vetta:batch-tasks:resume-task",
	RESUME_TASK_WITH_TEXT: "vetta:batch-tasks:resume-task-with-text",
	EVENT: "vetta:batch-tasks:event",
} as const;

function getRuntime(): RuntimeHost {
	return getSharedRuntime();
}

async function cleanTaskFilesAndState(projectId: string, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	if (isTaskRunning(task.id) || isTaskQueued(task.id)) {
		await abortTaskExecutor(projectId, task.id, runtime);
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
				timeoutMinutes?: number;
				skill?: BatchSkillRef;
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
				data.timeoutMinutes,
				data.skill,
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
				timeoutMinutes: number;
				newFolders: string[];
				skill: BatchSkillRef | null;
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
		enqueueRunTask(project, task, getRuntime());
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
		enqueueRunTask(project, task, runtime);
	});

	// "取消等待 / 中断单任务"：对一个 queued 或 running 的任务执行 abort + 清理，
	// 让它回到「未执行」状态。和 BATCH_STOP 的单任务版本语义一致。
	ipcMain.handle(CHANNELS.STOP_TASK, async (_, projectId: string, taskId: string) => {
		console.log(`[BatchTaskIPC] STOP_TASK: project=${projectId}, task=${taskId}`);
		const project = await getProject(projectId);
		if (!project) return;
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) return;
		const runtime = getRuntime();
		await cleanTaskFilesAndState(projectId, task, runtime);
		emitBatchTaskEvent({ type: "task.reset", projectId, taskId });
	});

	ipcMain.handle(CHANNELS.DELETE_TASK, async (_, projectId: string, taskId: string) => {
		console.log(`[BatchTaskIPC] DELETE_TASK: project=${projectId}, task=${taskId}`);
		if (isTaskRunning(taskId)) {
			console.warn(`[BatchTaskIPC] DELETE_TASK: task ${taskId} is running, skip`);
			return;
		}
		// 排队中的任务先从队列移除，避免删除后调度器仍试图执行
		removeFromPending(projectId, taskId);
		await removeTaskFromProject(projectId, taskId);
		await deleteTaskState(projectId, taskId);
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

	// "开始"按钮：把所有未执行（status === pending 且无 session）的任务一次性
	// 按并发数入队执行；同时把所有 paused 的任务以"继续"语义送回队首恢复运行。
	// 已完成 / 运行中 / 失败 / 等待中的任务保持不变。
	ipcMain.handle(CHANNELS.BATCH_START, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_START: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;

		const pendingTasks = project.tasks.filter((t) => t.status === "pending" && !t.sessionId);
		const pausedTasks = project.tasks.filter((t) => t.status === "paused");
		if (pendingTasks.length === 0 && pausedTasks.length === 0) {
			console.log(`[BatchTaskIPC] BATCH_START: nothing to start in ${projectId}`);
			return;
		}
		console.log(
			`[BatchTaskIPC] BATCH_START: running ${pendingTasks.length} pending + resuming ${pausedTasks.length} paused`,
		);
		const runtime = getRuntime();
		for (const task of pendingTasks) {
			enqueueRunTask(project, task, runtime);
		}
		for (const task of pausedTasks) {
			enqueueResumeTask(project, task, runtime);
		}
	});

	// "停止"按钮：中断所有运行中的任务、清空调度器排队、并把所有非「已完成」
	// 任务的 session、task-state、工作目录产物全部清空，状态重置为「未执行」。
	// 已完成任务保留。完成后队列只剩「已完成」和「未执行」两种状态。
	ipcMain.handle(CHANNELS.BATCH_STOP, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_STOP: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;

		const targets = project.tasks.filter((t) => t.status !== "completed");
		if (targets.length === 0) {
			console.log(`[BatchTaskIPC] BATCH_STOP: nothing to stop in ${projectId}`);
			return;
		}
		console.log(`[BatchTaskIPC] BATCH_STOP: stopping ${targets.length} tasks`);
		const runtime = getRuntime();

		// 1. 先中断所有 running / queued 的任务（cleanTaskFilesAndState 内部会做）。
		// 2. 删 session、task-state、工作目录产物，让 UI 立刻回到「未执行」。
		await Promise.all(
			targets.map(async (task) => {
				await cleanTaskFilesAndState(projectId, task, runtime);
				emitBatchTaskEvent({ type: "task.reset", projectId, taskId: task.id });
			}),
		);
	});

	// "重置"按钮：项目级硬重置。删除所有任务（含已完成）的会话和文件，
	// 然后按并发数依次重新执行全部任务。
	ipcMain.handle(CHANNELS.BATCH_RESET, async (_, projectId: string) => {
		console.log(`[BatchTaskIPC] BATCH_RESET: project=${projectId}`);
		const project = await getProject(projectId);
		if (!project) return;

		const runtime = getRuntime();

		for (const task of project.tasks) {
			if (isTaskRunning(task.id) || isTaskQueued(task.id)) {
				await abortTaskExecutor(projectId, task.id, runtime);
			}
		}

		for (const task of project.tasks) {
			if (task.sessionPath) {
				try {
					await runtime.deleteSession(task.sessionPath);
				} catch {
					// session may already be gone
				}
			}
		}

		await clearAllTaskStates(projectId);
		await resetProjectFiles(projectId);

		const refreshedProject = await getProject(projectId);
		if (!refreshedProject) return;
		console.log(`[BatchTaskIPC] BATCH_RESET: restarting ${refreshedProject.tasks.length} tasks`);
		for (const task of refreshedProject.tasks) {
			enqueueRunTask(refreshedProject, task, runtime);
		}
	});

	// 「重置失败」入口：仅针对调用方传入的 failed taskIds 做快照式重置，避免与
	// 实时新失败的任务发生竞争。清空 session/产物/状态后：
	// - 若该项目当前队列处于活动态（有 running 或 queued），自动 enqueue 到队尾继续；
	// - 否则仅重置为「未执行」，等用户手动「开始」。
	ipcMain.handle(CHANNELS.BATCH_RESET_FAILED, async (_, projectId: string, taskIds: string[]) => {
		console.log(`[BatchTaskIPC] BATCH_RESET_FAILED: project=${projectId}, ids=${taskIds.length}`);
		const project = await getProject(projectId);
		if (!project) return;

		const idSet = new Set(taskIds);
		const targets = project.tasks.filter((t) => idSet.has(t.id) && t.status === "failed");
		if (targets.length === 0) {
			console.log(`[BatchTaskIPC] BATCH_RESET_FAILED: no matching failed tasks`);
			return;
		}

		const runtime = getRuntime();
		// 在重置之前判定队列是否活动：检查项目下是否还有 running 或 queued 的任务
		// （targets 本身是 failed，不会处于 running/queued，所以不影响判定）。
		const queueActive = project.tasks.some((t) => isTaskRunning(t.id) || isTaskQueued(t.id));

		await Promise.all(
			targets.map(async (task) => {
				await cleanTaskFilesAndState(projectId, task, runtime);
				emitBatchTaskEvent({ type: "task.reset", projectId, taskId: task.id });
			}),
		);

		if (queueActive) {
			const refreshed = await getProject(projectId);
			if (!refreshed) return;
			console.log(`[BatchTaskIPC] BATCH_RESET_FAILED: queue active, enqueueing ${targets.length} tasks to tail`);
			for (const task of refreshed.tasks) {
				if (idSet.has(task.id)) enqueueRunTask(refreshed, task, runtime);
			}
		}
	});

	ipcMain.handle(CHANNELS.DELETE_SESSION, async (_, sessionPath: string) => {
		console.log(`[BatchTaskIPC] DELETE_SESSION: ${sessionPath}`);
		await getRuntime().deleteSession(sessionPath);
	});

	// "继续"卡片按钮：让一个 paused 子任务回到队列，下一次放行优先处理。
	ipcMain.handle(CHANNELS.RESUME_TASK, async (_, projectId: string, taskId: string) => {
		console.log(`[BatchTaskIPC] RESUME_TASK: project=${projectId}, task=${taskId}`);
		const project = await getProject(projectId);
		if (!project) return;
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) return;
		if (task.status !== "paused") {
			console.warn(`[BatchTaskIPC] RESUME_TASK: task ${taskId} not in paused state (status=${task.status})`);
			return;
		}
		enqueueResumeTask(project, task, getRuntime());
	});

	// 在 paused session 对话页发新消息：把用户输入作为 resumeText 送回队列。
	ipcMain.handle(CHANNELS.RESUME_TASK_WITH_TEXT, async (_, projectId: string, taskId: string, text: string) => {
		console.log(`[BatchTaskIPC] RESUME_TASK_WITH_TEXT: project=${projectId}, task=${taskId}`);
		const project = await getProject(projectId);
		if (!project) return;
		const task = project.tasks.find((t) => t.id === taskId);
		if (!task) return;
		if (task.status !== "paused") {
			console.warn(
				`[BatchTaskIPC] RESUME_TASK_WITH_TEXT: task ${taskId} not in paused state (status=${task.status})`,
			);
			return;
		}
		const trimmed = (text ?? "").trim();
		enqueueResumeTask(project, task, getRuntime(), trimmed.length > 0 ? text : "继续");
	});

	return () => {
		unsubscribeBatchEvents();
		ipcMain.removeHandler(CHANNELS.GET_PROJECTS);
		ipcMain.removeHandler(CHANNELS.CREATE_PROJECT);
		ipcMain.removeHandler(CHANNELS.UPDATE_PROJECT);
		ipcMain.removeHandler(CHANNELS.DELETE_PROJECT);
		ipcMain.removeHandler(CHANNELS.RUN_TASK);
		ipcMain.removeHandler(CHANNELS.RETRY_TASK);
		ipcMain.removeHandler(CHANNELS.STOP_TASK);
		ipcMain.removeHandler(CHANNELS.DELETE_TASK);
		ipcMain.removeHandler(CHANNELS.BATCH_DELETE);
		ipcMain.removeHandler(CHANNELS.BATCH_START);
		ipcMain.removeHandler(CHANNELS.BATCH_STOP);
		ipcMain.removeHandler(CHANNELS.BATCH_RESET);
		ipcMain.removeHandler(CHANNELS.BATCH_RESET_FAILED);
		ipcMain.removeHandler(CHANNELS.DELETE_SESSION);
		ipcMain.removeHandler(CHANNELS.RESUME_TASK);
		ipcMain.removeHandler(CHANNELS.RESUME_TASK_WITH_TEXT);
	};
}

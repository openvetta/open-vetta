import { join } from "node:path";
import type { RuntimeHost, SessionEvent } from "../../../../runtime-core/src/index.js";
import { type BatchTaskState, saveTaskState } from "./batch-task-state";
import type { BatchProject, BatchTask } from "./batch-task-storage";

export type BatchTaskEvent =
	| { type: "task.started"; projectId: string; taskId: string; sessionId: string; sessionPath: string | undefined }
	| { type: "task.completed"; projectId: string; taskId: string }
	| { type: "task.failed"; projectId: string; taskId: string; error: string }
	| { type: "task.paused"; projectId: string; taskId: string }
	| { type: "task.resumed"; projectId: string; taskId: string };

interface ExecutingTask {
	projectId: string;
	taskId: string;
	sessionId: string;
	sessionPath: string | undefined;
	abortController: AbortController;
}

const executingTasks = new Map<string, ExecutingTask>();
const eventHandlers = new Set<(event: BatchTaskEvent) => void>();

export function emitBatchTaskEvent(event: BatchTaskEvent): void {
	for (const handler of eventHandlers) {
		handler(event);
	}
}

export function subscribeBatchTaskEvents(handler: (event: BatchTaskEvent) => void): () => void {
	eventHandlers.add(handler);
	return () => {
		eventHandlers.delete(handler);
	};
}

function createTaskEventHandler(
	projectId: string,
	taskId: string,
	_abortController: AbortController,
): (event: SessionEvent) => void {
	return async (event: SessionEvent) => {
		console.log(`[BatchTask] Session event: ${event.type} for task ${taskId}`, event);
		if (event.type === "session.lifecycle" && event.phase === "agent_end") {
			if (!executingTasks.has(taskId)) return;
			console.log(`[BatchTask] agent_end received, task ${taskId} completed`);
			const executing = executingTasks.get(taskId)!;
			const state: BatchTaskState = {
				taskId,
				status: "completed",
				sessionId: executing.sessionId,
				sessionPath: executing.sessionPath,
				completedAt: Date.now(),
				lastModified: Date.now(),
			};
			await saveTaskState(projectId, taskId, state);
			executingTasks.delete(taskId);
			emitBatchTaskEvent({ type: "task.completed", projectId, taskId });
		}

		if (event.type === "session.lifecycle" && event.phase === "aborted") {
			if (!executingTasks.has(taskId)) return;
			console.log(`[BatchTask] session aborted, task ${taskId} paused`);
			const executing = executingTasks.get(taskId)!;
			const state: BatchTaskState = {
				taskId,
				status: "paused",
				sessionId: executing.sessionId,
				sessionPath: executing.sessionPath,
				lastModified: Date.now(),
			};
			await saveTaskState(projectId, taskId, state);
			executingTasks.delete(taskId);
			emitBatchTaskEvent({ type: "task.paused", projectId, taskId });
		}

		if (event.type === "error") {
			if (!executingTasks.has(taskId)) return;
			if (event.error?.retryable) {
				console.log(`[BatchTask] retryable error for task ${taskId}, skipping: ${event.error.message}`);
				return;
			}
			console.log(`[BatchTask] non-retryable error for task ${taskId}: ${event.error?.message}`);
			const executing = executingTasks.get(taskId)!;
			const state: BatchTaskState = {
				taskId,
				status: "failed",
				error: event.error?.message ?? "Unknown error",
				sessionId: executing.sessionId,
				sessionPath: executing.sessionPath,
				completedAt: Date.now(),
				lastModified: Date.now(),
			};
			await saveTaskState(projectId, taskId, state);
			executingTasks.delete(taskId);
			emitBatchTaskEvent({ type: "task.failed", projectId, taskId, error: event.error?.message ?? "Unknown error" });
		}
	};
}

function buildTaskPrompt(project: BatchProject, task: BatchTask): string {
	return [
		`## 任务上下文`,
		`- 源代码路径（只读参考）: ${task.sourcePath}`,
		`- 工作目录: ${task.cwd}`,
		`- 任务名称: ${task.name}`,
		``,
		`## 规则`,
		`- 只读取源代码路径中的文件作为参考，不要修改源目录中的任何内容`,
		`- 所有输出/生成的文件应放在当前工作目录中`,
		`- 完成所有工作后直接结束，不要等待用户确认`,
		``,
		`## 任务指令`,
		project.prompt,
	].join("\n");
}

export async function runTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	const abortController = new AbortController();
	console.log(
		`[BatchTask] runTask: project=${project.id}(${project.name}), task=${task.id}(${task.name}), cwd=${task.cwd}`,
	);

	try {
		const sessionDir = join(project.id, ".vetta", "sessions");
		const result = await runtime.createSession({ cwd: task.cwd, sessionDir });
		const sessionId = result.sessionId;
		const sessionPath = runtime.getSessionPath(sessionId);
		executingTasks.set(task.id, { projectId: project.id, taskId: task.id, sessionId, sessionPath, abortController });
		console.log(`[BatchTask] Session created: ${sessionId}, path=${sessionPath}`);

		runtime.renameSessionById(sessionId, `${project.name}: ${task.name}`);

		const state: BatchTaskState = {
			taskId: task.id,
			status: "running",
			sessionId,
			sessionPath,
			startedAt: Date.now(),
			lastModified: Date.now(),
		};
		await saveTaskState(project.id, task.id, state);

		emitBatchTaskEvent({ type: "task.started", projectId: project.id, taskId: task.id, sessionId, sessionPath });
		console.log(`[BatchTask] task.started emitted: ${task.id}`);

		runtime.subscribe(sessionId, createTaskEventHandler(project.id, task.id, abortController));

		if (project.modelKey) {
			console.log(`[BatchTask] Applying model ${project.modelKey} for session ${sessionId}`);
			await runtime.updateSettings(sessionId, { modelKey: project.modelKey });
			const state = runtime.getState(sessionId);
			const activeModelKey = state.model ? `${state.model.provider}/${state.model.id}` : undefined;
			if (activeModelKey !== project.modelKey) {
				throw new Error(`模型不可用: ${project.modelKey}`);
			}
		}

		const fullPrompt = buildTaskPrompt(project, task);
		console.log(`[BatchTask] Sending prompt for session ${sessionId}`);
		await runtime.prompt(sessionId, { text: fullPrompt });
		console.log(`[BatchTask] Prompt sent, task ${task.id} is now running`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[BatchTask] runTask failed for task ${task.id}: ${errorMessage}`);
		const executing = executingTasks.get(task.id);
		const state: BatchTaskState = {
			taskId: task.id,
			status: "failed",
			error: errorMessage,
			sessionId: executing?.sessionId,
			sessionPath: executing?.sessionPath,
			completedAt: Date.now(),
			lastModified: Date.now(),
		};
		await saveTaskState(project.id, task.id, state);
		executingTasks.delete(task.id);
		emitBatchTaskEvent({ type: "task.failed", projectId: project.id, taskId: task.id, error: errorMessage });
	}
}

export async function pauseTask(projectId: string, taskId: string, runtime: RuntimeHost): Promise<void> {
	console.log(`[BatchTask] pauseTask: project=${projectId}, task=${taskId}`);
	const executing = executingTasks.get(taskId);
	if (!executing) {
		console.warn(`[BatchTask] pauseTask: task ${taskId} not found in executingTasks`);
		return;
	}

	// 先从 map 中删除，防止 abort 触发的事件回调重复处理状态
	executingTasks.delete(taskId);
	await runtime.abort(executing.sessionId);
	executing.abortController.abort();
	console.log(`[BatchTask] Abort called for session ${executing.sessionId}`);

	const state: BatchTaskState = {
		taskId,
		status: "paused",
		sessionId: executing.sessionId,
		sessionPath: executing.sessionPath,
		lastModified: Date.now(),
	};
	await saveTaskState(projectId, taskId, state);
	emitBatchTaskEvent({ type: "task.paused", projectId, taskId });
	console.log(`[BatchTask] task.paused emitted: ${taskId}`);
}

export async function resumeTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	console.log(`[BatchTask] resumeTask: project=${project.id}, task=${task.id}, session=${task.sessionId}`);
	if (!task.sessionId) {
		console.warn(`[BatchTask] resumeTask: task ${task.id} has no sessionId`);
		return;
	}

	const abortController = new AbortController();
	executingTasks.set(task.id, {
		projectId: project.id,
		taskId: task.id,
		sessionId: task.sessionId,
		sessionPath: task.sessionPath,
		abortController,
	});

	const state: BatchTaskState = {
		taskId: task.id,
		status: "running",
		sessionId: task.sessionId,
		sessionPath: task.sessionPath,
		lastModified: Date.now(),
	};
	await saveTaskState(project.id, task.id, state);

	emitBatchTaskEvent({ type: "task.resumed", projectId: project.id, taskId: task.id });
	console.log(`[BatchTask] task.resumed emitted: ${task.id}`);

	runtime.subscribe(task.sessionId, createTaskEventHandler(project.id, task.id, abortController));

	console.log(`[BatchTask] Calling continue for session ${task.sessionId}`);
	await runtime.continue(task.sessionId);
	console.log(`[BatchTask] continue succeeded for task ${task.id}`);
}

export function isTaskRunning(taskId: string): boolean {
	return executingTasks.has(taskId);
}

export function getExecutingTaskIds(): string[] {
	return Array.from(executingTasks.keys());
}

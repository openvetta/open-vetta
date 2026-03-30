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
		if (event.type === "session.lifecycle" && event.phase === "agent_end") {
			if (!executingTasks.has(taskId)) return;
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
			// Skip retryable errors — AgentSession will auto-retry and eventually
			// emit agent_end (success) or a non-retryable error.
			if (event.error?.retryable) return;
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

export async function runTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	const abortController = new AbortController();

	try {
		const result = await runtime.createSession({ cwd: task.cwd });
		const sessionId = result.sessionId;
		const sessionPath = runtime.getSessionPath(sessionId);
		executingTasks.set(task.id, { projectId: project.id, taskId: task.id, sessionId, sessionPath, abortController });

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

		runtime.subscribe(sessionId, createTaskEventHandler(project.id, task.id, abortController));

		await runtime.prompt(sessionId, { text: project.prompt });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
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
	const executing = executingTasks.get(taskId);
	if (!executing) return;

	await runtime.abort(executing.sessionId);
	executing.abortController.abort();

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

export async function resumeTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	if (!task.sessionId) return;

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

	runtime.subscribe(task.sessionId, createTaskEventHandler(project.id, task.id, abortController));

	await runtime.continue(task.sessionId);
}

export function isTaskRunning(taskId: string): boolean {
	return executingTasks.has(taskId);
}

export function getExecutingTaskIds(): string[] {
	return Array.from(executingTasks.keys());
}

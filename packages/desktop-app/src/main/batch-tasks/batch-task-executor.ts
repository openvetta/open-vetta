import type { RuntimeHost, SessionEvent } from "../../../../runtime-core/src/index.js";
import { type BatchTaskState, saveTaskState } from "./batch-task-state";
import type { BatchProject, BatchTask } from "./batch-task-storage";
import { updateTaskStatus } from "./batch-task-storage";

export type BatchTaskEvent =
	| { type: "task.started"; projectId: string; taskId: string; sessionId: string; sessionPath: string | undefined }
	| { type: "task.completed"; projectId: string; taskId: string }
	| { type: "task.failed"; projectId: string; taskId: string; error: string }
	| { type: "task.paused"; projectId: string; taskId: string }
	| { type: "task.resumed"; projectId: string; taskId: string };

interface ExecutingTask {
	projectId: string;
	taskId: string;
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

export function getExecutingCount(projectId: string): number {
	let count = 0;
	for (const executing of executingTasks.values()) {
		if (executing.projectId === projectId) {
			count++;
		}
	}
	return count;
}

export function canStartTask(project: BatchProject): boolean {
	return getExecutingCount(project.id) < project.concurrency;
}

function createTaskEventHandler(
	projectId: string,
	taskId: string,
	_abortController: AbortController,
): (event: SessionEvent) => void {
	return async (event: SessionEvent) => {
		if (event.type === "session.lifecycle" && event.phase === "agent_end") {
			const state: BatchTaskState = {
				taskId,
				status: "completed",
				completedAt: Date.now(),
				lastModified: Date.now(),
			};
			await saveTaskState(projectId, taskId, state);
			executingTasks.delete(taskId);
			emitBatchTaskEvent({ type: "task.completed", projectId, taskId });
		}

		if (event.type === "session.lifecycle" && event.phase === "aborted") {
			const state: BatchTaskState = {
				taskId,
				status: "paused",
				lastModified: Date.now(),
			};
			await saveTaskState(projectId, taskId, state);
			executingTasks.delete(taskId);
			emitBatchTaskEvent({ type: "task.paused", projectId, taskId });
		}

		if (event.type === "error") {
			const state: BatchTaskState = {
				taskId,
				status: "failed",
				error: event.error?.message ?? "Unknown error",
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
	if (!canStartTask(project)) {
		return;
	}

	const abortController = new AbortController();
	executingTasks.set(task.id, { projectId: project.id, taskId: task.id, abortController });

	try {
		const result = await runtime.createSession({ cwd: task.cwd });
		const sessionId = result.sessionId;
		const sessionPath = runtime.getSessionPath(sessionId);

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

		await updateTaskStatus(project.id, task.id, "running", undefined, sessionId, sessionPath, true);

		emitBatchTaskEvent({ type: "task.started", projectId: project.id, taskId: task.id, sessionId, sessionPath });

		runtime.subscribe(sessionId, createTaskEventHandler(project.id, task.id, abortController));

		await runtime.prompt(sessionId, { text: project.prompt });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const state: BatchTaskState = {
			taskId: task.id,
			status: "failed",
			error: errorMessage,
			completedAt: Date.now(),
			lastModified: Date.now(),
		};
		await saveTaskState(project.id, task.id, state);
		await updateTaskStatus(project.id, task.id, "failed", errorMessage);
		executingTasks.delete(task.id);
		emitBatchTaskEvent({ type: "task.failed", projectId: project.id, taskId: task.id, error: errorMessage });
	}
}

export function pauseTask(_projectId: string, taskId: string): void {
	const executing = executingTasks.get(taskId);
	if (!executing) return;

	executing.abortController.abort();
}

export async function resumeTask(project: BatchProject, task: BatchTask, runtime: RuntimeHost): Promise<void> {
	if (!task.sessionId) return;

	const abortController = new AbortController();
	executingTasks.set(task.id, { projectId: project.id, taskId: task.id, abortController });

	const state: BatchTaskState = {
		taskId: task.id,
		status: "running",
		sessionId: task.sessionId,
		sessionPath: task.sessionPath,
		lastModified: Date.now(),
	};
	await saveTaskState(project.id, task.id, state);
	await updateTaskStatus(project.id, task.id, "running");

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

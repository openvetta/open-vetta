import { readFileSync } from "node:fs";
import {
	type BackgroundTaskEvent,
	BackgroundTaskManager,
	type BackgroundTaskSnapshot,
} from "../../core/background-tasks/index.js";

export type RuntimeBackgroundCommandStatus = "running" | "completed" | "failed" | "killed";
export type RuntimeBackgroundCommandStopReason = "user" | "agent" | "dispose";

export interface RuntimeBackgroundCommandSnapshot {
	readonly id: string;
	readonly command: string;
	readonly cwd: string;
	readonly status: RuntimeBackgroundCommandStatus;
	readonly outputFile: string;
	readonly exitCode: number | undefined;
	readonly startedAt: number;
	readonly endedAt?: number;
	readonly toolCallId?: string;
	readonly tail: string;
	readonly endedBy?: RuntimeBackgroundCommandStopReason;
}

export type RuntimeBackgroundCommandEvent =
	| { readonly type: "task_started"; readonly task: RuntimeBackgroundCommandSnapshot }
	| { readonly type: "task_output"; readonly task: RuntimeBackgroundCommandSnapshot }
	| { readonly type: "task_ended"; readonly task: RuntimeBackgroundCommandSnapshot }
	| { readonly type: "tasks_cleared" };

export interface RuntimeBackgroundCommandService {
	spawn(options: {
		readonly command: string;
		readonly cwd: string;
		readonly env: NodeJS.ProcessEnv;
		readonly toolCallId?: string;
		readonly notifyOnlyIfPromoted?: boolean;
	}): RuntimeBackgroundCommandSnapshot;
	subscribe(listener: (event: RuntimeBackgroundCommandEvent) => void): () => void;
	subscribeNotifications(listener: (task: RuntimeBackgroundCommandSnapshot) => void): () => void;
	wait(
		taskId: string,
		options: { readonly maxMs: number; readonly signal?: AbortSignal },
	): Promise<{ readonly stillRunning: boolean; readonly snapshot: RuntimeBackgroundCommandSnapshot }>;
	get(taskId: string): RuntimeBackgroundCommandSnapshot | undefined;
	readOutput(taskId: string, options: { readonly fromStart: boolean; readonly advanceCursor: boolean }): string;
	stop(taskId: string, reason?: RuntimeBackgroundCommandStopReason): boolean;
	dispose(): void;
}

export function createCodingAgentBackgroundCommandService(
	manager: BackgroundTaskManager = new BackgroundTaskManager(),
): RuntimeBackgroundCommandService {
	const notificationListeners: Array<(task: RuntimeBackgroundCommandSnapshot) => void> = [];
	const previousNotificationHandler = manager.onNotify;
	manager.onNotify = (task) => {
		previousNotificationHandler?.(task);
		for (const listener of notificationListeners) listener(task);
	};

	return {
		spawn: (options) => manager.spawn(options),
		subscribe: (listener) => manager.subscribe((event) => listener(toRuntimeEvent(event))),
		subscribeNotifications(listener) {
			notificationListeners.push(listener);
			return () => {
				const index = notificationListeners.indexOf(listener);
				if (index >= 0) notificationListeners.splice(index, 1);
			};
		},
		wait: (taskId, options) => manager.wait(taskId, options),
		get: (taskId) => manager.get(taskId),
		readOutput(taskId, options) {
			const task = manager.get(taskId);
			if (!task) return "";
			const cursor = options.advanceCursor ? manager.consumeReadOffset(taskId) : undefined;
			const start = options.fromStart ? 0 : (cursor?.offset ?? 0);
			try {
				return readFileSync(task.outputFile).subarray(start).toString("utf-8");
			} catch {
				return "";
			}
		},
		stop: (taskId, reason) => manager.kill(taskId, reason),
		dispose: () => manager.killAll(),
	};
}

function toRuntimeEvent(event: BackgroundTaskEvent): RuntimeBackgroundCommandEvent {
	if (event.type === "tasks_cleared") return event;
	return { type: event.type, task: toRuntimeSnapshot(event.task) };
}

function toRuntimeSnapshot(task: BackgroundTaskSnapshot): RuntimeBackgroundCommandSnapshot {
	return task;
}

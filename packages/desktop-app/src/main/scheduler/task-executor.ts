import type { RuntimeHost, SessionEvent } from "../../../../runtime-core/src/index.js";
import { resolveExecutionMode } from "../execution-mode.js";
import { readDesktopConfig } from "../ipc/fs.js";
import { emitTaskEvent, emitTaskStreamEvent } from "../ipc/scheduler.js";
import { assertSandboxAvailableForMode } from "../sandbox/capability.js";
import type { ScheduledTask, TaskExecutionRecord } from "./task-storage";
import { createRecord, generateId, updateRecordMetadata, updateTaskLastRun } from "./task-storage";

interface ExecutingTask {
	sessionId: string;
	abortFn: () => void;
}

const executingTasks = new Map<string, ExecutingTask>();

export async function executeTask(task: ScheduledTask, runtime: RuntimeHost): Promise<void> {
	const recordId = generateId();
	let sessionId = "";

	const record: TaskExecutionRecord = {
		id: recordId,
		taskId: task.id,
		sessionId: "",
		cwd: task.cwd,
		startedAt: Date.now(),
		completedAt: null,
		status: "running",
		prompt: task.prompt,
		responsePreview: "",
		executionMode: undefined,
	};

	try {
		const config = await readDesktopConfig();
		const executionMode = resolveExecutionMode(task.executionMode, config.defaultExecutionMode);
		await assertSandboxAvailableForMode(executionMode, async () => executionMode);
		record.executionMode = executionMode;

		const result = await runtime.createSession({ cwd: task.cwd, executionMode });
		sessionId = result.sessionId;
		record.sessionId = sessionId;

		// Name the session so it's identifiable in the sidebar
		runtime.renameSessionById(sessionId, `[定时] ${task.name}`);

		// Get session path for navigation
		record.sessionPath = runtime.getSessionPath(sessionId);

		await createRecord(record);

		emitTaskEvent({
			type: "task.started",
			taskId: task.id,
			recordId,
		});

		let responseText = "";
		let unsubscribed = false;
		let unsubscribe: () => void = () => {};
		const safeUnsubscribe = (): void => {
			if (unsubscribed) return;
			unsubscribed = true;
			unsubscribe();
		};

		unsubscribe = runtime.subscribe(sessionId, async (event: SessionEvent) => {
			if (event.type === "message.delta") {
				responseText += event.delta;
				emitTaskStreamEvent({
					taskId: task.id,
					sessionId,
					type: "message.delta",
					delta: event.delta,
				});
			}

			if (event.type === "thinking.delta") {
				emitTaskStreamEvent({
					taskId: task.id,
					sessionId,
					type: "thinking.delta",
					delta: event.delta,
				});
			}

			if (event.type === "toolcall.start") {
				emitTaskStreamEvent({
					taskId: task.id,
					sessionId,
					type: "toolcall.start",
					toolCallId: event.toolCallId,
					toolName: event.toolName,
				});
			}

			if (event.type === "tool.start") {
				emitTaskStreamEvent({
					taskId: task.id,
					sessionId,
					type: "tool.start",
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					args: event.args as Record<string, unknown>,
				});
			}

			if (event.type === "tool.end") {
				emitTaskStreamEvent({
					taskId: task.id,
					sessionId,
					type: "tool.end",
					toolCallId: event.toolCallId,
					result: event.result,
					isError: event.isError,
				});
			}

			if (event.type === "session.lifecycle") {
				emitTaskStreamEvent({
					taskId: task.id,
					sessionId,
					type: "session.lifecycle",
					phase: event.phase,
				});

				if (event.phase === "agent_end" || event.phase === "aborted") {
					record.status = event.phase === "aborted" ? "aborted" : "success";
					record.completedAt = Date.now();
					record.responsePreview = responseText.slice(0, 500);
					record.durationMs = record.completedAt - record.startedAt;

					await updateRecordMetadata(record);
					await updateTaskLastRun(task.id, event.phase === "aborted" ? "failed" : "success");
					executingTasks.delete(task.id);
					// 解除订阅，避免用户后续在同一 session 继续对话时误触发本
					// 回调覆写历史记录。RuntimeHost 由 session IPC 与本模块
					// 共享，session 仍然存活，下次打开复用即可。
					safeUnsubscribe();

					emitTaskEvent({
						type: "record.updated",
						taskId: task.id,
						sessionId,
						status: event.phase === "aborted" ? "aborted" : "success",
					});

					// Auto-disable one-time tasks after execution completes
					if (task.isOnce && event.phase === "agent_end") {
						// Dynamically import to avoid circular dependency
						const { disableTaskInCron } = await import("./scheduler.js");
						disableTaskInCron(task.id);
						const { updateTaskEnabled } = await import("./task-storage");
						await updateTaskEnabled(task.id, false);
					}
				}
			}
		});

		executingTasks.set(task.id, { sessionId, abortFn: safeUnsubscribe });

		await runtime.prompt(sessionId, {
			text: task.prompt,
			...(task.modelKey ? { modelKey: task.modelKey } : {}),
		});
	} catch (error) {
		record.status = "failed";
		record.completedAt = Date.now();
		record.error = String(error);
		record.durationMs = record.completedAt - record.startedAt;
		await createRecord(record);
		await updateTaskLastRun(task.id, "failed");
		executingTasks.delete(task.id);
	}
}

export function abortTask(taskId: string): void {
	const executing = executingTasks.get(taskId);
	if (executing) {
		executing.abortFn();
		executingTasks.delete(taskId);
	}
}

export function isTaskRunning(taskId: string): boolean {
	return executingTasks.has(taskId);
}

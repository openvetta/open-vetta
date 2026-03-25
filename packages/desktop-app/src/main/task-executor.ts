import { homedir } from "node:os";
import type { RuntimeHost, SessionEvent } from "../../../runtime-core/src/index.js";
import { emitTaskEvent, emitTaskStreamEvent } from "./ipc-scheduler";
import type { ScheduledTask, TaskExecutionRecord, TaskMessage } from "./task-storage";
import { appendMessage, createRecord, generateId, updateRecordMetadata, updateTaskLastRun } from "./task-storage";

interface ExecutingTask {
	sessionId: string;
	abortFn: () => void;
}

const executingTasks = new Map<string, ExecutingTask>();
const DEFAULT_WORKSPACE = `${homedir()}/.vetta/workspace`;

export async function executeTask(task: ScheduledTask, runtime: RuntimeHost): Promise<void> {
	const recordId = generateId();
	let sessionId = "";

	const record: TaskExecutionRecord = {
		id: recordId,
		taskId: task.id,
		sessionId: "",
		startedAt: Date.now(),
		completedAt: null,
		status: "running",
		prompt: task.prompt,
		responsePreview: "",
	};

	try {
		const result = await runtime.createSession({ cwd: DEFAULT_WORKSPACE });
		sessionId = result.sessionId;
		record.sessionId = sessionId;
		await createRecord(record);

		emitTaskEvent({
			type: "task.started",
			taskId: task.id,
			recordId,
		});

		let responseText = "";

		const unsubscribe = runtime.subscribe(sessionId, async (event: SessionEvent) => {
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

					try {
						const messages = runtime.getMessages(sessionId);
						for (const m of messages) {
							const msg: TaskMessage = {
								role: m.role,
								content: (m as { content?: unknown }).content,
								...(m.role === "toolResult" && {
									toolCallId: (m as { toolCallId?: string }).toolCallId,
									toolName: (m as { toolName?: string }).toolName,
									isError: (m as { isError?: boolean }).isError,
								}),
							};
							await appendMessage(task.id, sessionId, msg);
						}
					} catch {
						// ignore
					}

					await updateRecordMetadata(record);
					await updateTaskLastRun(task.id, event.phase === "aborted" ? "failed" : "success");
					executingTasks.delete(task.id);

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

		executingTasks.set(task.id, { sessionId, abortFn: unsubscribe });

		await runtime.prompt(sessionId, { text: task.prompt });
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

import type { RuntimeHost, SessionEvent } from "../../../runtime-core/src/index.js";
import type { ScheduledTask, TaskExecutionRecord } from "./task-storage";
import { addRecord, generateId, updateRecord, updateTaskLastRun } from "./task-storage";

interface ExecutingTask {
	sessionId: string;
	abortFn: () => void;
}

const executingTasks = new Map<string, ExecutingTask>();
const DEFAULT_WORKSPACE = "~/.vetta/workspace";

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
		addRecord(record);

		let responseText = "";

		const unsubscribe = runtime.subscribe(sessionId, (event: SessionEvent) => {
			if (event.type === "message.delta") {
				responseText += event.delta;
			}

			if (event.type === "session.lifecycle") {
				if (event.phase === "agent_end" || event.phase === "aborted") {
					record.status = event.phase === "aborted" ? "aborted" : "success";
					record.completedAt = Date.now();
					record.responsePreview = responseText.slice(0, 500);
					record.durationMs = record.completedAt - record.startedAt;
					updateRecord(record);
					updateTaskLastRun(task.id, event.phase === "aborted" ? "failed" : "success");
					executingTasks.delete(task.id);
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
		addRecord(record);
		updateTaskLastRun(task.id, "failed");
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

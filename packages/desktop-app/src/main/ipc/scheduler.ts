import { ipcMain, type WebContents } from "electron";
import { abortTask, getRuntime, scheduleTaskInCron, unscheduleTaskInCron } from "../scheduler/scheduler.js";
import { executeTask } from "../scheduler/task-executor";
import type { ScheduledTask } from "../scheduler/task-storage";
import { deleteTaskRecords, generateId, loadRecords, loadTasks, saveTasks } from "../scheduler/task-storage";

const CHANNELS = {
	GET_TASKS: "vetta:scheduler:get-tasks",
	CREATE_TASK: "vetta:scheduler:create-task",
	UPDATE_TASK: "vetta:scheduler:update-task",
	DELETE_TASK: "vetta:scheduler:delete-task",
	TOGGLE_TASK: "vetta:scheduler:toggle-task",
	DISABLE_TASK: "vetta:scheduler:disable-task",
	GET_RECORDS: "vetta:scheduler:get-records",
	RUN_NOW: "vetta:scheduler:run-now",
	ABORT: "vetta:scheduler:abort",
	EVENT: "vetta:scheduler:event",
	STREAM_EVENT: "vetta:scheduler:stream-event",
} as const;

type TaskStreamHandler = (event: TaskStreamEvent) => void;
interface TaskStreamEvent {
	taskId: string;
	sessionId: string;
	type: "message.delta" | "thinking.delta" | "tool.start" | "tool.end" | "toolcall.start" | "session.lifecycle";
	delta?: string;
	toolCallId?: string;
	toolName?: string;
	args?: Record<string, unknown>;
	result?: unknown;
	isError?: boolean;
	phase?: string;
}

type TaskEvent =
	| { type: "task.started"; taskId: string; recordId: string }
	| { type: "task.completed"; taskId: string; recordId: string; status: "success" | "failed" }
	| { type: "task.failed"; taskId: string; error: string }
	| { type: "record.updated"; taskId: string; sessionId: string; status: "success" | "aborted" };

const streamHandlers = new Set<TaskStreamHandler>();
const eventHandlers = new Set<(event: TaskEvent) => void>();

export function emitTaskStreamEvent(event: TaskStreamEvent): void {
	for (const handler of streamHandlers) {
		handler(event);
	}
}

export function emitTaskEvent(event: TaskEvent): void {
	for (const handler of eventHandlers) {
		handler(event);
	}
}

export function registerSchedulerIpc(webContents: WebContents): () => void {
	streamHandlers.add((event) => {
		webContents.send(CHANNELS.STREAM_EVENT, event);
	});

	eventHandlers.add((event) => {
		webContents.send(CHANNELS.EVENT, event);
	});

	ipcMain.handle(CHANNELS.GET_TASKS, async () => {
		return loadTasks();
	});

	ipcMain.handle(
		CHANNELS.CREATE_TASK,
		async (_, task: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">) => {
			const tasks = await loadTasks();
			const now = Date.now();
			const newTask: ScheduledTask = {
				...task,
				id: generateId(),
				createdAt: now,
				updatedAt: now,
				lastRunAt: null,
				lastRunStatus: null,
			};
			tasks.push(newTask);
			await saveTasks(tasks);

			if (newTask.enabled) {
				scheduleTaskInCron(newTask);
			}

			return newTask;
		},
	);

	ipcMain.handle(CHANNELS.UPDATE_TASK, async (_, id: string, patch: Partial<ScheduledTask>) => {
		const tasks = await loadTasks();
		const index = tasks.findIndex((t) => t.id === id);
		if (index === -1) return;

		tasks[index] = { ...tasks[index], ...patch, updatedAt: Date.now() };
		await saveTasks(tasks);

		if (tasks[index].enabled) {
			scheduleTaskInCron(tasks[index]);
		}
	});

	ipcMain.handle(CHANNELS.DELETE_TASK, async (_, id: string) => {
		unscheduleTaskInCron(id);
		const tasks = await loadTasks();
		const filtered = tasks.filter((t) => t.id !== id);
		await saveTasks(filtered);
		await deleteTaskRecords(id);
	});

	ipcMain.handle(CHANNELS.TOGGLE_TASK, async (_, id: string) => {
		const tasks = await loadTasks();
		const task = tasks.find((t) => t.id === id);
		if (!task) return;

		task.enabled = !task.enabled;
		task.updatedAt = Date.now();
		await saveTasks(tasks);

		if (task.enabled) {
			scheduleTaskInCron(task);
		} else {
			unscheduleTaskInCron(id);
		}
	});

	ipcMain.handle(CHANNELS.DISABLE_TASK, async (_, id: string) => {
		const tasks = await loadTasks();
		const task = tasks.find((t) => t.id === id);
		if (!task?.enabled) return;

		task.enabled = false;
		task.updatedAt = Date.now();
		await saveTasks(tasks);
		unscheduleTaskInCron(id);
	});

	ipcMain.handle(CHANNELS.GET_RECORDS, async (_, taskId: string) => {
		return loadRecords(taskId);
	});

	ipcMain.handle(CHANNELS.ABORT, async (_, taskId: string) => {
		abortTask(taskId);
	});

	ipcMain.handle(CHANNELS.RUN_NOW, async (_, taskId: string) => {
		const tasks = await loadTasks();
		const task = tasks.find((t) => t.id === taskId);
		if (!task) return;
		await executeTask(task, getRuntime());
	});

	return () => {
		streamHandlers.clear();
		eventHandlers.clear();
		ipcMain.removeHandler(CHANNELS.GET_TASKS);
		ipcMain.removeHandler(CHANNELS.CREATE_TASK);
		ipcMain.removeHandler(CHANNELS.UPDATE_TASK);
		ipcMain.removeHandler(CHANNELS.DELETE_TASK);
		ipcMain.removeHandler(CHANNELS.TOGGLE_TASK);
		ipcMain.removeHandler(CHANNELS.DISABLE_TASK);
		ipcMain.removeHandler(CHANNELS.GET_RECORDS);
		ipcMain.removeHandler(CHANNELS.ABORT);
		ipcMain.removeHandler(CHANNELS.RUN_NOW);
	};
}

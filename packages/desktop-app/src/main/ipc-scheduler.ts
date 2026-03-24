import { ipcMain, type WebContents } from "electron";
import { abortTask, getRuntime, scheduleTaskInCron } from "./scheduler";
import { executeTask } from "./task-executor";
import type { ScheduledTask } from "./task-storage";
import { generateId, loadRecords, loadTasks, saveTasks } from "./task-storage";

const CHANNELS = {
	GET_TASKS: "vetta:scheduler:get-tasks",
	CREATE_TASK: "vetta:scheduler:create-task",
	UPDATE_TASK: "vetta:scheduler:update-task",
	DELETE_TASK: "vetta:scheduler:delete-task",
	TOGGLE_TASK: "vetta:scheduler:toggle-task",
	GET_RECORDS: "vetta:scheduler:get-records",
	RUN_NOW: "vetta:scheduler:run-now",
	ABORT: "vetta:scheduler:abort",
	EVENT: "vetta:scheduler:event",
} as const;

export function registerSchedulerIpc(_webContents: WebContents): () => void {
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
		const tasks = await loadTasks();
		const filtered = tasks.filter((t) => t.id !== id);
		await saveTasks(filtered);
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
		}
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
		ipcMain.removeHandler(CHANNELS.GET_TASKS);
		ipcMain.removeHandler(CHANNELS.CREATE_TASK);
		ipcMain.removeHandler(CHANNELS.UPDATE_TASK);
		ipcMain.removeHandler(CHANNELS.DELETE_TASK);
		ipcMain.removeHandler(CHANNELS.TOGGLE_TASK);
		ipcMain.removeHandler(CHANNELS.GET_RECORDS);
		ipcMain.removeHandler(CHANNELS.ABORT);
		ipcMain.removeHandler(CHANNELS.RUN_NOW);
	};
}

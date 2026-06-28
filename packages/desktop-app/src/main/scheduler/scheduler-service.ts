import { stat } from "node:fs/promises";
import type { RuntimeHost } from "../../../../runtime-core/src/index.js";
import { recordAutomationTaskCreated } from "../app-monitor/app-monitor-service.js";
import { isValidCronExpression } from "./cron.js";
import { abortTask, executeTask, isTaskRunning } from "./task-executor.js";
import {
	deleteTaskRecords,
	generateId,
	loadRecords,
	loadTasks,
	mutateTasks,
	type ScheduledTask,
	type TaskExecutionRecord,
	updateTaskEnabled,
} from "./task-storage.js";

export type CreateScheduledTaskInput = Omit<
	ScheduledTask,
	"id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus"
>;

export type UpdateScheduledTaskInput = Partial<
	Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">
>;

export interface SchedulerCommandResult {
	status: "accepted" | "noop";
	taskId: string;
}

export interface SchedulerServiceDependencies {
	getRuntime: () => RuntimeHost;
	scheduleTask: (task: ScheduledTask) => void;
	unscheduleTask: (taskId: string) => void;
}

export class SchedulerServiceError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly details?: Record<string, string | string[]>,
	) {
		super(message);
		this.name = "SchedulerServiceError";
	}
}

export class SchedulerService {
	private readonly changeHandlers = new Set<() => void>();

	constructor(private readonly dependencies: SchedulerServiceDependencies) {}

	onTasksChanged(handler: () => void): () => void {
		this.changeHandlers.add(handler);
		return () => {
			this.changeHandlers.delete(handler);
		};
	}

	async listTasks(): Promise<ScheduledTask[]> {
		return await loadTasks();
	}

	async getTask(taskId: string): Promise<ScheduledTask> {
		return await this.requireTask(taskId);
	}

	async getHistory(taskId: string): Promise<TaskExecutionRecord[]> {
		await this.requireTask(taskId);
		return await loadRecords(taskId);
	}

	async createTask(data: CreateScheduledTaskInput): Promise<ScheduledTask> {
		this.assertCron(data.cron);
		await this.assertDirectory(data.cwd);
		const now = Date.now();
		const task: ScheduledTask = {
			...data,
			id: generateId(),
			createdAt: now,
			updatedAt: now,
			lastRunAt: null,
			lastRunStatus: null,
		};
		await mutateTasks((tasks) => {
			tasks.push(task);
		});
		if (task.enabled) {
			this.dependencies.scheduleTask(task);
		}
		this.emitTasksChanged();
		recordAutomationTaskCreated();
		return task;
	}

	async updateTask(taskId: string, patch: UpdateScheduledTaskInput): Promise<ScheduledTask> {
		if (patch.cron !== undefined) {
			this.assertCron(patch.cron);
		}
		if (patch.cwd !== undefined) {
			await this.assertDirectory(patch.cwd);
		}
		const task = await mutateTasks((tasks) => {
			const index = tasks.findIndex((candidate) => candidate.id === taskId);
			if (index < 0) {
				throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
			}
			const updated: ScheduledTask = {
				...tasks[index],
				...patch,
				id: tasks[index].id,
				createdAt: tasks[index].createdAt,
				lastRunAt: tasks[index].lastRunAt,
				lastRunStatus: tasks[index].lastRunStatus,
				updatedAt: Date.now(),
			};
			tasks[index] = updated;
			return updated;
		});
		this.syncScheduledJob(task);
		this.emitTasksChanged();
		return task;
	}

	async deleteTask(taskId: string): Promise<SchedulerCommandResult> {
		if (isTaskRunning(taskId)) {
			throw new SchedulerServiceError("SCHEDULER_TASK_RUNNING", "运行中的定时任务不能删除，请先中止。", {
				taskId,
			});
		}
		await mutateTasks((tasks) => {
			const index = tasks.findIndex((candidate) => candidate.id === taskId);
			if (index < 0) {
				throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
			}
			tasks.splice(index, 1);
		});
		this.dependencies.unscheduleTask(taskId);
		await deleteTaskRecords(taskId);
		this.emitTasksChanged();
		return { status: "accepted", taskId };
	}

	async setEnabled(taskId: string, enabled: boolean): Promise<ScheduledTask> {
		return await this.updateTask(taskId, { enabled });
	}

	async toggleTask(taskId: string): Promise<ScheduledTask> {
		const task = await mutateTasks((tasks) => {
			const index = tasks.findIndex((candidate) => candidate.id === taskId);
			if (index < 0) {
				throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
			}
			const updated = {
				...tasks[index],
				enabled: !tasks[index].enabled,
				updatedAt: Date.now(),
			};
			tasks[index] = updated;
			return updated;
		});
		this.syncScheduledJob(task);
		this.emitTasksChanged();
		return task;
	}

	async runNow(taskId: string): Promise<SchedulerCommandResult> {
		const task = await this.requireTask(taskId);
		if (isTaskRunning(taskId)) {
			throw new SchedulerServiceError("SCHEDULER_TASK_RUNNING", "定时任务已在运行。", { taskId });
		}
		await executeTask(task, this.dependencies.getRuntime(), {
			onOneTimeCompleted: async () => {
				this.dependencies.unscheduleTask(task.id);
				await updateTaskEnabled(task.id, false);
			},
		});
		return { status: "accepted", taskId };
	}

	async abort(taskId: string): Promise<SchedulerCommandResult> {
		await this.requireTask(taskId);
		const aborted = await abortTask(taskId);
		if (!aborted) return { status: "noop", taskId };
		return { status: "accepted", taskId };
	}

	private async requireTask(taskId: string): Promise<ScheduledTask> {
		const task = (await loadTasks()).find((candidate) => candidate.id === taskId);
		if (!task) {
			throw new SchedulerServiceError("SCHEDULER_TASK_NOT_FOUND", "定时任务不存在。", { taskId });
		}
		return task;
	}

	private async assertDirectory(path: string): Promise<void> {
		const info = await stat(path).catch(() => undefined);
		if (!info?.isDirectory()) {
			throw new SchedulerServiceError("SCHEDULER_CWD_INVALID", "任务工作目录不存在或不是目录。", {
				path,
			});
		}
	}

	private assertCron(cron: string): void {
		if (!isValidCronExpression(cron)) {
			throw new SchedulerServiceError("SCHEDULER_CRON_INVALID", "Cron 表达式无效。", { cron });
		}
	}

	private syncScheduledJob(task: ScheduledTask): void {
		if (task.enabled) {
			this.dependencies.scheduleTask(task);
		} else {
			this.dependencies.unscheduleTask(task.id);
		}
	}

	private emitTasksChanged(): void {
		for (const handler of this.changeHandlers) handler();
	}
}

import cron, { type ScheduledTask } from "node-cron";
import { RuntimeHost } from "../../../../runtime-core/src/index.js";
import { abortTask, executeTask } from "./task-executor";
import type { ScheduledTask as TaskData } from "./task-storage";
import { loadTasks } from "./task-storage";

let runtimeInstance: RuntimeHost | null = null;
const scheduledJobs = new Map<string, ScheduledTask>();

function getRuntime(): RuntimeHost {
	if (!runtimeInstance) {
		runtimeInstance = new RuntimeHost();
	}
	return runtimeInstance;
}

export async function initScheduler(): Promise<void> {
	const tasks = await loadTasks();
	let enabledCount = 0;

	for (const task of tasks) {
		if (task.enabled) {
			scheduleTaskInCron(task);
			enabledCount++;
		}
	}

	console.log(`[Scheduler] Initialized with ${enabledCount} enabled tasks`);
}

export function scheduleTaskInCron(task: TaskData): void {
	if (!cron.validate(task.cron)) {
		console.error(`[Scheduler] Invalid cron expression: ${task.cron}`);
		return;
	}

	unscheduleTaskInCron(task.id);

	const job = cron.schedule(
		task.cron,
		async () => {
			console.log(`[Scheduler] Executing task: ${task.name} (${task.id})`);
			try {
				await executeTask(task, getRuntime());
			} catch (error) {
				console.error(`[Scheduler] Task execution failed:`, error);
			}
		},
		{
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		},
	);

	scheduledJobs.set(task.id, job);
}

export function unscheduleTaskInCron(taskId: string): void {
	const existing = scheduledJobs.get(taskId);
	if (existing) {
		existing.stop();
		scheduledJobs.delete(taskId);
	}
}

/** Stop and remove a scheduled job without changing task enabled state */
export function disableTaskInCron(taskId: string): void {
	unscheduleTaskInCron(taskId);
}

export async function rescheduleAll(): Promise<void> {
	for (const job of scheduledJobs.values()) {
		job.stop();
	}
	scheduledJobs.clear();

	const tasks = await loadTasks();
	for (const task of tasks) {
		if (task.enabled) {
			scheduleTaskInCron(task);
		}
	}
}

export { abortTask, getRuntime };

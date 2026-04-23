import { AsyncTask, CronJob, ToadScheduler } from "toad-scheduler";
import { RuntimeHost } from "../../../../runtime-core/src/index.js";
import { readDesktopConfig } from "../ipc/fs.js";
import { getAvailableLinuxBubblewrapPath } from "../sandbox/capability.js";
import { resolveWindowsSandboxHostBinary } from "../sandbox/windows-binary-resolver.js";
import { abortTask, executeTask } from "./task-executor";
import type { ScheduledTask as TaskData } from "./task-storage";
import { loadTasks } from "./task-storage";

let runtimeInstance: RuntimeHost | null = null;
const _scheduler = new ToadScheduler();
const scheduledJobs = new Map<string, CronJob>();

function getRuntime(): RuntimeHost {
	if (!runtimeInstance) {
		runtimeInstance = new RuntimeHost({
			getDefaultExecutionMode: async () => {
				const config = await readDesktopConfig();
				return config.defaultExecutionMode;
			},
			sandboxHostPath: resolveWindowsSandboxHostBinary()?.path,
			linuxBubblewrapPath: getAvailableLinuxBubblewrapPath(),
		});
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
	unscheduleTaskInCron(task.id);

	const asyncTask = new AsyncTask(
		`scheduled-task-${task.id}`,
		async () => {
			console.log(`[Scheduler] Executing task: ${task.name} (${task.id})`);
			try {
				await executeTask(task, getRuntime());
			} catch (error) {
				console.error(`[Scheduler] Task execution failed:`, error);
			}
		},
		(error: Error) => {
			console.error(`[Scheduler] Task error: ${task.name} (${task.id})`, error);
		},
	);

	const job = new CronJob(
		{
			cronExpression: task.cron,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		},
		asyncTask,
	);

	scheduledJobs.set(task.id, job);
	job.start();
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

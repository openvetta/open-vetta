import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".vetta");
const STATES_FILE = join(CONFIG_DIR, "batch-task-states.json");

export type BatchTaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface BatchTaskState {
	taskId: string;
	status: BatchTaskStatus;
	sessionId?: string;
	sessionPath?: string;
	error?: string;
	startedAt?: number;
	completedAt?: number;
	lastModified: number;
}

export type ProjectTaskStates = Record<string, BatchTaskState>;

type AllTaskStates = Record<string, ProjectTaskStates>;

let cachedStates: AllTaskStates | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function ensureDirectory(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadTaskStates(): Promise<AllTaskStates> {
	if (cachedStates !== null) {
		return cachedStates;
	}
	try {
		await ensureDirectory();
		const data = await readFile(STATES_FILE, "utf-8");
		cachedStates = JSON.parse(data);
	} catch {
		cachedStates = {};
	}
	return cachedStates!;
}

export async function saveTaskStates(states: AllTaskStates): Promise<void> {
	await ensureDirectory();
	await writeFile(STATES_FILE, JSON.stringify(states, null, 2), "utf-8");
}

function scheduleFlush(): void {
	if (saveTimer !== null) return;
	saveTimer = setTimeout(async () => {
		saveTimer = null;
		if (cachedStates !== null) {
			await saveTaskStates(cachedStates);
		}
	}, 50);
}

export async function getTaskState(projectId: string, taskId: string): Promise<BatchTaskState | undefined> {
	const states = await loadTaskStates();
	return states[projectId]?.[taskId];
}

export async function saveTaskState(projectId: string, taskId: string, state: BatchTaskState): Promise<void> {
	const states = await loadTaskStates();
	if (!states[projectId]) {
		states[projectId] = {};
	}
	states[projectId][taskId] = state;
	console.log(
		`[BatchTaskState] State scheduled to save: project=${projectId}, task=${taskId}, status=${state.status}`,
	);
	scheduleFlush();
}

export async function deleteTaskState(projectId: string, taskId: string): Promise<void> {
	const states = await loadTaskStates();
	if (states[projectId]) {
		delete states[projectId][taskId];
		if (Object.keys(states[projectId]).length === 0) {
			delete states[projectId];
		}
		scheduleFlush();
	}
}

export async function deleteProjectTaskStates(projectId: string): Promise<void> {
	const states = await loadTaskStates();
	delete states[projectId];
	scheduleFlush();
}

export async function updateTaskState(
	projectId: string,
	taskId: string,
	patch: Partial<BatchTaskState>,
): Promise<void> {
	const states = await loadTaskStates();
	if (states[projectId]?.[taskId]) {
		states[projectId][taskId] = {
			...states[projectId][taskId],
			...patch,
			lastModified: Date.now(),
		};
		scheduleFlush();
	}
}

export async function recoverRunningTasks(): Promise<void> {
	console.log(`[BatchTaskState] recoverRunningTasks: checking for stale running tasks`);
	const states = await loadTaskStates();
	let modified = false;

	for (const projectId of Object.keys(states)) {
		for (const taskId of Object.keys(states[projectId])) {
			const state = states[projectId][taskId];
			if (state.status === "running") {
				console.log(`[BatchTaskState] Recovering stale task ${taskId} (project ${projectId})`);
				state.status = "failed";
				state.error = "应用异常退出";
				state.completedAt = Date.now();
				state.lastModified = Date.now();
				modified = true;
			}
		}
	}

	if (modified) {
		await saveTaskStates(states);
		console.log(`[BatchTaskState] Stale tasks recovered and saved`);
	} else {
		console.log(`[BatchTaskState] No stale running tasks found`);
	}
}

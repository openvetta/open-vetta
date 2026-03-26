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

async function ensureDirectory(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadTaskStates(): Promise<AllTaskStates> {
	try {
		await ensureDirectory();
		const data = await readFile(STATES_FILE, "utf-8");
		return JSON.parse(data);
	} catch {
		return {};
	}
}

export async function saveTaskStates(states: AllTaskStates): Promise<void> {
	await ensureDirectory();
	await writeFile(STATES_FILE, JSON.stringify(states, null, 2), "utf-8");
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
	await saveTaskStates(states);
}

export async function deleteTaskState(projectId: string, taskId: string): Promise<void> {
	const states = await loadTaskStates();
	if (states[projectId]) {
		delete states[projectId][taskId];
		if (Object.keys(states[projectId]).length === 0) {
			delete states[projectId];
		}
		await saveTaskStates(states);
	}
}

export async function deleteProjectTaskStates(projectId: string): Promise<void> {
	const states = await loadTaskStates();
	delete states[projectId];
	await saveTaskStates(states);
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
		await saveTaskStates(states);
	}
}

export async function recoverRunningTasks(): Promise<void> {
	const states = await loadTaskStates();
	let modified = false;

	for (const projectId of Object.keys(states)) {
		for (const taskId of Object.keys(states[projectId])) {
			const state = states[projectId][taskId];
			if (state.status === "running") {
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
	}
}

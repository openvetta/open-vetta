import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionExecutionMode } from "../../../../runtime-core/src/index.js";
import { type ExecutionModeOverride, normalizeExecutionModeOverride } from "../execution-mode.js";

const CONFIG_DIR = join(homedir(), ".vetta");
const TASKS_FILE = join(CONFIG_DIR, "scheduled-tasks.json");
const RECORDS_DIR = join(CONFIG_DIR, "task-records");

export interface ScheduledTask {
	id: string;
	name: string;
	prompt: string;
	cron: string;
	isOnce: boolean;
	enabled: boolean;
	/** Project working directory this task is associated with */
	cwd: string;
	modelId?: string;
	executionMode?: ExecutionModeOverride;
	createdAt: number;
	updatedAt: number;
	lastRunAt: number | null;
	lastRunStatus: "success" | "failed" | null;
}

export interface TaskExecutionRecord {
	id: string;
	taskId: string;
	sessionId: string;
	/** Session file path for navigating to the conversation */
	sessionPath?: string;
	/** Project working directory */
	cwd?: string;
	startedAt: number;
	completedAt: number | null;
	status: "running" | "success" | "failed" | "aborted";
	prompt: string;
	responsePreview: string;
	error?: string;
	durationMs?: number;
	executionMode?: SessionExecutionMode;
}

async function ensureDirectories(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
	await mkdir(RECORDS_DIR, { recursive: true });
}

export async function loadTasks(): Promise<ScheduledTask[]> {
	try {
		await ensureDirectories();
		const data = await readFile(TASKS_FILE, "utf-8");
		const tasks: ScheduledTask[] = JSON.parse(data);
		// Backfill fields for old tasks
		for (const task of tasks) {
			if (!("isOnce" in task)) {
				(task as ScheduledTask).isOnce = false;
			}
			if (!("cwd" in task)) {
				(task as ScheduledTask).cwd = `${homedir()}/.vetta/workspace`;
			}
			task.executionMode = normalizeExecutionModeOverride(task.executionMode, "full-access");
		}
		return tasks;
	} catch {
		return [];
	}
}

export async function saveTasks(tasks: ScheduledTask[]): Promise<void> {
	await ensureDirectories();
	const normalized = tasks.map((task) => ({
		...task,
		executionMode: normalizeExecutionModeOverride(task.executionMode, "full-access"),
	}));
	await writeFile(TASKS_FILE, JSON.stringify(normalized, null, 2), "utf-8");
}

function getTaskRecordsDir(taskId: string): string {
	return join(RECORDS_DIR, taskId);
}

function getRecordFilePath(taskId: string, sessionId: string): string {
	return join(RECORDS_DIR, taskId, `${sessionId}.jsonl`);
}

export async function loadRecords(taskId: string): Promise<TaskExecutionRecord[]> {
	const taskDir = getTaskRecordsDir(taskId);
	if (!existsSync(taskDir)) {
		return [];
	}

	const records: TaskExecutionRecord[] = [];

	try {
		const files = await readdir(taskDir);
		for (const file of files) {
			if (!file.endsWith(".jsonl")) continue;
			const filePath = join(taskDir, file);
			try {
				const content = await readFile(filePath, "utf-8");
				const lines = content.trim().split("\n").filter(Boolean);
				if (lines.length > 0) {
					const record = JSON.parse(lines[0]) as TaskExecutionRecord;
					records.push(record);
				}
			} catch {
				// skip malformed files
			}
		}
	} catch {
		return [];
	}

	records.sort((a, b) => b.startedAt - a.startedAt);
	return records;
}

export async function createRecord(record: TaskExecutionRecord): Promise<void> {
	const taskDir = getTaskRecordsDir(record.taskId);
	await mkdir(taskDir, { recursive: true });
	const filePath = getRecordFilePath(record.taskId, record.sessionId);
	const metadataLine = JSON.stringify(record);
	await writeFile(filePath, `${metadataLine}\n`, "utf-8");
}

export async function updateRecordMetadata(record: TaskExecutionRecord): Promise<void> {
	const filePath = getRecordFilePath(record.taskId, record.sessionId);
	if (!existsSync(filePath)) {
		return;
	}

	try {
		const content = await readFile(filePath, "utf-8");
		const lines = content.trim().split("\n").filter(Boolean);
		if (lines.length === 0) return;

		lines[0] = JSON.stringify(record);
		await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
	} catch {
		// ignore
	}
}

export async function deleteTaskRecords(taskId: string): Promise<void> {
	const taskDir = getTaskRecordsDir(taskId);
	if (!existsSync(taskDir)) {
		return;
	}
	await rm(taskDir, { recursive: true, force: true });
}

export function loadRecordsSync(taskId: string): TaskExecutionRecord[] {
	const taskDir = getTaskRecordsDir(taskId);
	if (!existsSync(taskDir)) {
		return [];
	}

	const records: TaskExecutionRecord[] = [];

	try {
		const files = readdirSync(taskDir);
		for (const file of files) {
			if (!file.endsWith(".jsonl")) continue;
			const filePath = join(taskDir, file);
			try {
				const content = readFileSync(filePath, "utf-8");
				const lines = content.trim().split("\n").filter(Boolean);
				if (lines.length > 0) {
					const record = JSON.parse(lines[0]) as TaskExecutionRecord;
					records.push(record);
				}
			} catch {
				// skip malformed files
			}
		}
	} catch {
		return [];
	}

	records.sort((a, b) => b.startedAt - a.startedAt);
	return records;
}

export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function updateTaskLastRun(taskId: string, status: "success" | "failed"): Promise<void> {
	const tasks = await loadTasks();
	const task = tasks.find((t) => t.id === taskId);
	if (task) {
		task.lastRunAt = Date.now();
		task.lastRunStatus = status;
		task.updatedAt = Date.now();
		await saveTasks(tasks);
	}
}

export async function updateTaskEnabled(taskId: string, enabled: boolean): Promise<void> {
	const tasks = await loadTasks();
	const task = tasks.find((t) => t.id === taskId);
	if (task) {
		task.enabled = enabled;
		task.updatedAt = Date.now();
		await saveTasks(tasks);
	}
}

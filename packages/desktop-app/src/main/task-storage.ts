import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".vetta");
const TASKS_FILE = join(CONFIG_DIR, "scheduled-tasks.json");
const RECORDS_DIR = join(CONFIG_DIR, "task-records");

const MAX_RECORDS_PER_TASK = 100;

export interface ScheduledTask {
	id: string;
	name: string;
	prompt: string;
	cron: string;
	enabled: boolean;
	modelId?: string;
	createdAt: number;
	updatedAt: number;
	lastRunAt: number | null;
	lastRunStatus: "success" | "failed" | null;
}

export interface TaskExecutionRecord {
	id: string;
	taskId: string;
	sessionId: string;
	startedAt: number;
	completedAt: number | null;
	status: "running" | "success" | "failed" | "aborted";
	prompt: string;
	responsePreview: string;
	error?: string;
	durationMs?: number;
}

async function ensureDirectories(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
	await mkdir(RECORDS_DIR, { recursive: true });
}

export async function loadTasks(): Promise<ScheduledTask[]> {
	try {
		await ensureDirectories();
		const data = await readFile(TASKS_FILE, "utf-8");
		return JSON.parse(data);
	} catch {
		return [];
	}
}

export async function saveTasks(tasks: ScheduledTask[]): Promise<void> {
	await ensureDirectories();
	await writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf-8");
}

export async function loadRecords(taskId: string): Promise<TaskExecutionRecord[]> {
	const file = join(RECORDS_DIR, `${taskId}.json`);
	try {
		const data = await readFile(file, "utf-8");
		return JSON.parse(data);
	} catch {
		return [];
	}
}

export async function saveRecords(taskId: string, records: TaskExecutionRecord[]): Promise<void> {
	const file = join(RECORDS_DIR, `${taskId}.json`);
	await ensureDirectories();
	await writeFile(file, JSON.stringify(records, null, 2), "utf-8");
}

export function loadRecordsSync(taskId: string): TaskExecutionRecord[] {
	const file = join(RECORDS_DIR, `${taskId}.json`);
	if (!existsSync(file)) {
		return [];
	}
	try {
		const data = readFileSync(file, "utf-8");
		return JSON.parse(data);
	} catch {
		return [];
	}
}

export function saveRecordsSync(taskId: string, records: TaskExecutionRecord[]): void {
	const file = join(RECORDS_DIR, `${taskId}.json`);
	const dir = RECORDS_DIR;
	if (!existsSync(dir)) {
		mkdirSyncRecursive(dir);
	}
	writeFileSync(file, JSON.stringify(records, null, 2), "utf-8");
}

function mkdirSyncRecursive(dir: string): void {
	const parent = join(dir, "..");
	if (!existsSync(parent)) {
		mkdirSyncRecursive(parent);
	}
	try {
		mkdir(dir, { recursive: true });
	} catch {
		// ignore
	}
}

export function addRecord(record: TaskExecutionRecord): void {
	const records = loadRecordsSync(record.taskId);
	records.push(record);
	const trimmed = records.slice(-MAX_RECORDS_PER_TASK);
	saveRecordsSync(record.taskId, trimmed);
}

export function updateRecord(record: TaskExecutionRecord): void {
	const records = loadRecordsSync(record.taskId);
	const index = records.findIndex((r) => r.id === record.id);
	if (index !== -1) {
		records[index] = record;
		saveRecordsSync(record.taskId, records);
	}
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

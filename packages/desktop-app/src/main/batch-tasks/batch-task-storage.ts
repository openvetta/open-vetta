import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { SessionExecutionMode } from "../../../../runtime-core/src/index.js";
import { type ExecutionModeOverride, normalizeExecutionModeOverride } from "../execution-mode.js";
import { getWorkspacePath } from "../utils/workspace";
import { type BatchTaskState, type BatchTaskStatus, loadProjectTaskStates } from "./batch-task-state";

export type { BatchTaskStatus } from "./batch-task-state";

// ─── meta.json structures ───

interface BatchItemMeta {
	id: string;
	name: string;
	sourcePath: string;
	createdAt: number;
}

interface BatchProjectMeta {
	type: "batch";
	prompt: string;
	modelKey?: string;
	concurrency: number;
	executionMode?: ExecutionModeOverride;
	items: BatchItemMeta[];
	createdAt: number;
	updatedAt: number;
}

// ─── Exported types ───

export interface BatchTask {
	id: string;
	name: string;
	cwd: string;
	sourcePath: string;
	status: BatchTaskStatus;
	sessionId?: string;
	sessionPath?: string;
	executionMode?: SessionExecutionMode;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

export interface BatchProject {
	id: string;
	name: string;
	prompt: string;
	modelKey?: string;
	concurrency: number;
	executionMode?: ExecutionModeOverride;
	tasks: BatchTask[];
	createdAt: number;
	updatedAt: number;
}

// ─── Internal helpers ───

function metaPath(projectDir: string): string {
	return join(projectDir, ".vetta", "meta.json");
}

async function readProjectMeta(projectDir: string): Promise<BatchProjectMeta | null> {
	try {
		const raw = await readFile(metaPath(projectDir), "utf-8");
		const parsed = JSON.parse(raw) as BatchProjectMeta;
		if (parsed.type !== "batch") return null;
		return parsed;
	} catch {
		return null;
	}
}

async function writeProjectMeta(projectDir: string, meta: BatchProjectMeta): Promise<void> {
	const dir = join(projectDir, ".vetta");
	await mkdir(dir, { recursive: true });
	await writeFile(metaPath(projectDir), JSON.stringify(meta, null, 2), "utf-8");
}

async function uniqueItemName(projectDir: string, baseName: string): Promise<string> {
	let name = baseName;
	let counter = 2;
	const existing = new Set<string>();
	try {
		const entries = await readdir(projectDir);
		for (const e of entries) existing.add(e);
	} catch {
		// directory may not exist yet
	}
	while (existing.has(name)) {
		name = `${baseName}-${counter}`;
		counter++;
	}
	return name;
}

function assembleProject(
	projectDir: string,
	meta: BatchProjectMeta,
	states: Record<string, BatchTaskState>,
): BatchProject {
	const tasks: BatchTask[] = meta.items.map((item) => {
		const state: BatchTaskState | undefined = states[item.id];
		return {
			id: item.id,
			name: item.name,
			cwd: join(projectDir, item.name),
			sourcePath: item.sourcePath,
			status: state?.status ?? "pending",
			sessionId: state?.sessionId,
			sessionPath: state?.sessionPath,
			executionMode: state?.executionMode,
			error: state?.error,
			createdAt: item.createdAt,
			updatedAt: state?.lastModified ?? item.createdAt,
		};
	});

	return {
		id: projectDir,
		name: basename(projectDir),
		prompt: meta.prompt,
		modelKey: meta.modelKey,
		concurrency: meta.concurrency,
		executionMode: normalizeExecutionModeOverride(meta.executionMode, "full-access"),
		tasks,
		createdAt: meta.createdAt,
		updatedAt: meta.updatedAt,
	};
}

// ─── Public API ───

export async function discoverBatchProjects(): Promise<string[]> {
	const workspacePath = await getWorkspacePath();
	try {
		const entries = await readdir(workspacePath, { withFileTypes: true });
		const candidates = entries
			.filter((e) => e.isDirectory() && !e.name.startsWith("."))
			.map((e) => join(workspacePath, e.name));
		const results = await Promise.all(
			candidates.map(async (projectDir) => {
				const meta = await readProjectMeta(projectDir);
				return meta ? projectDir : null;
			}),
		);
		return results.filter((d): d is string => d !== null);
	} catch {
		// workspace may not exist yet
		return [];
	}
}

export async function loadProjects(): Promise<BatchProject[]> {
	try {
		const projectDirs = await discoverBatchProjects();
		const projects: BatchProject[] = [];
		for (const projectDir of projectDirs) {
			const meta = await readProjectMeta(projectDir);
			if (!meta) continue;
			if (!meta.concurrency) meta.concurrency = 1;
			const states = await loadProjectTaskStates(projectDir);
			projects.push(assembleProject(projectDir, meta, states));
		}
		console.log(`[BatchTaskStorage] loadProjects: loaded ${projects.length} projects`);
		return projects;
	} catch (error) {
		console.error(
			`[BatchTaskStorage] loadProjects failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

export async function createProject(
	name: string,
	prompt: string,
	modelKey: string | undefined,
	folders: string[],
	concurrency: number,
	executionMode?: ExecutionModeOverride,
): Promise<BatchProject> {
	const workspacePath = await getWorkspacePath();
	const projectDir = join(workspacePath, name);
	await mkdir(projectDir, { recursive: true });

	const now = Date.now();
	const items: BatchItemMeta[] = [];

	for (const sourcePath of folders) {
		const baseName = basename(sourcePath);
		const itemName = await uniqueItemName(projectDir, baseName);
		const itemDir = join(projectDir, itemName);
		await mkdir(itemDir, { recursive: true });
		items.push({
			id: `batch-task-${now}-${items.length}-${Math.random().toString(36).slice(2, 11)}`,
			name: itemName,
			sourcePath,
			createdAt: now,
		});
	}

	const meta: BatchProjectMeta = {
		type: "batch",
		prompt,
		modelKey,
		concurrency,
		executionMode: normalizeExecutionModeOverride(executionMode, "full-access"),
		items,
		createdAt: now,
		updatedAt: now,
	};

	await writeProjectMeta(projectDir, meta);
	// Ensure sessions directory exists
	await mkdir(join(projectDir, ".vetta", "sessions"), { recursive: true });

	console.log(
		`[BatchTaskStorage] createProject: ${projectDir}(${name}), tasks=${items.length}, concurrency=${concurrency}`,
	);

	return assembleProject(projectDir, meta, {});
}

export async function updateProject(
	projectDir: string,
	data: Partial<{
		name: string;
		prompt: string;
		modelKey: string;
		concurrency: number;
		executionMode: ExecutionModeOverride;
		newFolders: string[];
	}>,
): Promise<void> {
	const meta = await readProjectMeta(projectDir);
	if (!meta) return;

	if (data.prompt !== undefined) meta.prompt = data.prompt;
	if (data.modelKey !== undefined) meta.modelKey = data.modelKey;
	if (data.concurrency !== undefined) meta.concurrency = data.concurrency;
	if (data.executionMode !== undefined) meta.executionMode = normalizeExecutionModeOverride(data.executionMode);

	if (data.newFolders) {
		const now = Date.now();
		const existingSources = new Set(meta.items.map((item) => item.sourcePath));
		for (const sourcePath of data.newFolders) {
			if (existingSources.has(sourcePath)) continue;
			const baseName = basename(sourcePath);
			const itemName = await uniqueItemName(projectDir, baseName);
			const itemDir = join(projectDir, itemName);
			await mkdir(itemDir, { recursive: true });
			meta.items.push({
				id: `batch-task-${now}-${meta.items.length}-${Math.random().toString(36).slice(2, 11)}`,
				name: itemName,
				sourcePath,
				createdAt: now,
			});
		}
	}

	meta.updatedAt = Date.now();
	await writeProjectMeta(projectDir, meta);
}

export async function deleteProject(projectDir: string): Promise<void> {
	console.log(`[BatchTaskStorage] deleteProject: ${projectDir}`);
	await rm(projectDir, { recursive: true, force: true });
}

export async function getProject(projectDir: string): Promise<BatchProject | undefined> {
	const meta = await readProjectMeta(projectDir);
	if (!meta) return undefined;
	if (!meta.concurrency) meta.concurrency = 1;
	const states = await loadProjectTaskStates(projectDir);
	return assembleProject(projectDir, meta, states);
}

export async function addTaskToProject(projectDir: string, sourcePath: string): Promise<BatchTask | undefined> {
	const meta = await readProjectMeta(projectDir);
	if (!meta) return undefined;

	const now = Date.now();
	const baseName = basename(sourcePath);
	const itemName = await uniqueItemName(projectDir, baseName);
	const itemDir = join(projectDir, itemName);
	await mkdir(itemDir, { recursive: true });

	const item: BatchItemMeta = {
		id: `batch-task-${now}-${Math.random().toString(36).slice(2, 11)}`,
		name: itemName,
		sourcePath,
		createdAt: now,
	};
	meta.items.push(item);
	meta.updatedAt = now;
	await writeProjectMeta(projectDir, meta);

	return {
		id: item.id,
		name: item.name,
		cwd: itemDir,
		sourcePath: item.sourcePath,
		status: "pending",
		createdAt: now,
		updatedAt: now,
	};
}

export async function removeTaskFromProject(projectDir: string, taskId: string): Promise<void> {
	const meta = await readProjectMeta(projectDir);
	if (!meta) return;

	const item = meta.items.find((i) => i.id === taskId);
	if (item) {
		// Remove item subdirectory
		const itemDir = join(projectDir, item.name);
		await rm(itemDir, { recursive: true, force: true }).catch(() => {});
	}

	meta.items = meta.items.filter((i) => i.id !== taskId);
	meta.updatedAt = Date.now();
	await writeProjectMeta(projectDir, meta);
}

export async function resetTaskFiles(projectDir: string, taskId: string): Promise<void> {
	const meta = await readProjectMeta(projectDir);
	if (!meta) return;
	const item = meta.items.find((i) => i.id === taskId);
	if (!item) return;
	const itemDir = join(projectDir, item.name);
	await rm(itemDir, { recursive: true, force: true });
	await mkdir(itemDir, { recursive: true });
}

export async function resetProjectFiles(projectDir: string): Promise<void> {
	const meta = await readProjectMeta(projectDir);
	if (!meta) return;

	// Delete everything in projectDir except .vetta/meta.json
	const entries = await readdir(projectDir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(projectDir, entry.name);
		if (entry.name === ".vetta") {
			// Inside .vetta, delete everything except meta.json
			const vettaEntries = await readdir(fullPath);
			for (const ve of vettaEntries) {
				if (ve === "meta.json") continue;
				await rm(join(fullPath, ve), { recursive: true, force: true });
			}
		} else {
			await rm(fullPath, { recursive: true, force: true });
		}
	}

	// Rebuild empty item directories and sessions directory
	for (const item of meta.items) {
		await mkdir(join(projectDir, item.name), { recursive: true });
	}
	await mkdir(join(projectDir, ".vetta", "sessions"), { recursive: true });
}

export function generateTaskId(): string {
	return `batch-task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

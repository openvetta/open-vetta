import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type BatchTaskState, loadTaskStates } from "./batch-task-state";

const CONFIG_DIR = join(homedir(), ".vetta");
const PROJECTS_FILE = join(CONFIG_DIR, "batch-projects.json");

export type BatchTaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface BatchTaskMeta {
	id: string;
	name: string;
	cwd: string;
	createdAt: number;
}

export interface BatchTask {
	id: string;
	name: string;
	cwd: string;
	status: BatchTaskStatus;
	sessionId?: string;
	sessionPath?: string;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

export interface BatchProject {
	id: string;
	name: string;
	prompt: string;
	concurrency: number;
	tasks: BatchTask[];
	createdAt: number;
	updatedAt: number;
}

interface StoredProject {
	id: string;
	name: string;
	prompt: string;
	concurrency: number;
	tasks: BatchTaskMeta[];
	createdAt: number;
	updatedAt: number;
}

async function ensureDirectory(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadProjects(): Promise<BatchProject[]> {
	try {
		await ensureDirectory();
		const [data, allStates] = await Promise.all([readFile(PROJECTS_FILE, "utf-8"), loadTaskStates()]);
		const storedProjects = JSON.parse(data) as StoredProject[];
		const projects: BatchProject[] = [];

		for (const stored of storedProjects) {
			if (!stored.concurrency) {
				stored.concurrency = 1;
			}
			const projectStates = allStates[stored.id] || {};
			const tasks: BatchTask[] = [];

			for (const meta of stored.tasks) {
				const state: BatchTaskState | undefined = projectStates[meta.id];
				tasks.push({
					id: meta.id,
					name: (meta.name || meta.cwd.split("/").pop()) ?? meta.cwd,
					cwd: meta.cwd,
					status: state?.status ?? "pending",
					sessionId: state?.sessionId,
					sessionPath: state?.sessionPath,
					error: state?.error,
					createdAt: meta.createdAt,
					updatedAt: state?.lastModified ?? meta.createdAt,
				});
			}

			projects.push({
				id: stored.id,
				name: stored.name,
				prompt: stored.prompt,
				concurrency: stored.concurrency,
				tasks,
				createdAt: stored.createdAt,
				updatedAt: stored.updatedAt,
			});
		}

		return projects;
	} catch {
		return [];
	}
}

export async function saveProjects(_projects: BatchProject[]): Promise<void> {
	await ensureDirectory();
	const storedProjects: StoredProject[] = _projects.map((p) => ({
		id: p.id,
		name: p.name,
		prompt: p.prompt,
		concurrency: p.concurrency,
		tasks: p.tasks.map((t) => ({
			id: t.id,
			name: t.name,
			cwd: t.cwd,
			createdAt: t.createdAt,
		})),
		createdAt: p.createdAt,
		updatedAt: p.updatedAt,
	}));
	await writeFile(PROJECTS_FILE, JSON.stringify(storedProjects, null, 2), "utf-8");
}

export function generateProjectId(): string {
	return `batch-project-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function generateTaskId(): string {
	return `batch-task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function createProject(
	name: string,
	prompt: string,
	folders: string[],
	concurrency: number,
): Promise<BatchProject> {
	const now = Date.now();
	const tasks: BatchTask[] = folders.map((cwd, index) => ({
		id: `batch-task-${now}-${index}-${Math.random().toString(36).slice(2, 11)}`,
		name: cwd.split("/").pop() ?? cwd,
		cwd,
		status: "pending" as const,
		createdAt: now,
		updatedAt: now,
	}));

	const project: BatchProject = {
		id: generateProjectId(),
		name,
		prompt,
		concurrency,
		tasks,
		createdAt: now,
		updatedAt: now,
	};

	const projects = await loadProjects();
	projects.push(project);
	await saveProjects(projects);

	return project;
}

export async function updateProject(
	projectId: string,
	data: Partial<{ name: string; prompt: string; concurrency: number; newFolders: string[] }>,
): Promise<void> {
	const projects = await loadProjects();
	const project = projects.find((p) => p.id === projectId);
	if (project) {
		if (data.name !== undefined) project.name = data.name;
		if (data.prompt !== undefined) project.prompt = data.prompt;
		if (data.concurrency !== undefined) project.concurrency = data.concurrency;
		if (data.newFolders) {
			const now = Date.now();
			const existingCwds = new Set(project.tasks.map((t) => t.cwd));
			for (const cwd of data.newFolders) {
				if (!existingCwds.has(cwd)) {
					project.tasks.push({
						id: generateTaskId(),
						name: cwd.split("/").pop() ?? cwd,
						cwd,
						status: "pending",
						createdAt: now,
						updatedAt: now,
					});
				}
			}
		}
		project.updatedAt = Date.now();
		await saveProjects(projects);
	}
}

export async function deleteProject(projectId: string): Promise<void> {
	const projects = await loadProjects();
	const filtered = projects.filter((p) => p.id !== projectId);
	await saveProjects(filtered);
}

export async function getProject(projectId: string): Promise<BatchProject | undefined> {
	const projects = await loadProjects();
	return projects.find((p) => p.id === projectId);
}

export async function addTaskToProject(projectId: string, cwd: string): Promise<BatchTask | undefined> {
	const projects = await loadProjects();
	const project = projects.find((p) => p.id === projectId);
	if (!project) return undefined;

	const now = Date.now();
	const task: BatchTask = {
		id: generateTaskId(),
		name: cwd.split("/").pop() ?? cwd,
		cwd,
		status: "pending",
		createdAt: now,
		updatedAt: now,
	};

	project.tasks.push(task);
	project.updatedAt = now;
	await saveProjects(projects);

	return task;
}

export async function removeTaskFromProject(projectId: string, taskId: string): Promise<void> {
	const projects = await loadProjects();
	const project = projects.find((p) => p.id === projectId);
	if (project) {
		project.tasks = project.tasks.filter((t) => t.id !== taskId);
		project.updatedAt = Date.now();
		await saveProjects(projects);
	}
}

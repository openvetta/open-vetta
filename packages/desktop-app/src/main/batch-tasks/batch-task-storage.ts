import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".vetta");
const PROJECTS_FILE = join(CONFIG_DIR, "batch-projects.json");

export type BatchTaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

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

async function ensureDirectory(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadProjects(): Promise<BatchProject[]> {
	try {
		await ensureDirectory();
		const data = await readFile(PROJECTS_FILE, "utf-8");
		const projects: BatchProject[] = JSON.parse(data);
		for (const project of projects) {
			if (!("concurrency" in project)) {
				(project as BatchProject).concurrency = 1;
			}
			for (const task of project.tasks) {
				const t = task as BatchTask;
				if (!t.name) {
					t.name = t.cwd.split("/").pop() ?? t.cwd;
				}
			}
		}
		return projects;
	} catch {
		return [];
	}
}

export async function saveProjects(projects: BatchProject[]): Promise<void> {
	await ensureDirectory();
	await writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
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
	data: Partial<{ name: string; prompt: string; concurrency: number }>,
): Promise<void> {
	const projects = await loadProjects();
	const project = projects.find((p) => p.id === projectId);
	if (project) {
		if (data.name !== undefined) project.name = data.name;
		if (data.prompt !== undefined) project.prompt = data.prompt;
		if (data.concurrency !== undefined) project.concurrency = data.concurrency;
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

export async function updateTaskStatus(
	projectId: string,
	taskId: string,
	status: BatchTaskStatus,
	error?: string,
	sessionId?: string,
	sessionPath?: string,
	clearError?: boolean,
): Promise<void> {
	const projects = await loadProjects();
	const project = projects.find((p) => p.id === projectId);
	if (project) {
		const task = project.tasks.find((t) => t.id === taskId);
		if (task) {
			task.status = status;
			if (clearError) {
				task.error = undefined;
			}
			if (error !== undefined) task.error = error;
			if (sessionId !== undefined) task.sessionId = sessionId;
			if (sessionPath !== undefined) task.sessionPath = sessionPath;
			task.updatedAt = Date.now();
		}
		project.updatedAt = Date.now();
		await saveProjects(projects);
	}
}

import { readJsonFile, writeJsonFile, type PluginStorageApi } from "@vetta-org/plugin-sdk";
import { CONVERSATION_WORKSPACE, parseWorkspaceSource, type WorkspaceSource } from "./workspace";

export const STATE_FILE = "state.json";

export type GithubTaskSource =
	| { kind: "issue"; owner: string; repo: string; issueNumber: number; issueUrl: string; issueUpdatedAt: string }
	| { kind: "manual"; cwd?: string };

export type GithubTaskStatus = "pending" | "running" | "completed" | "failed";

export interface GithubTask {
	id: string;
	title: string;
	promptText: string;
	source: GithubTaskSource;
	status: GithubTaskStatus;
	sessionId?: string;
	error?: string;
	createdAt: number;
	updatedAt: number;
	labels?: string[];
	assignees?: string[];
	body?: string;
}

export interface PluginState {
	repoTarget: { owner: string; repo: string } | null;
	workspace: WorkspaceSource;
	tasks: GithubTask[];
	issueNextPage: number | null;
	lastFetch: { owner: string; repo: string } | null;
}

export const EMPTY_STATE: PluginState = {
	repoTarget: null,
	workspace: CONVERSATION_WORKSPACE,
	tasks: [],
	issueNextPage: null,
	lastFetch: null,
};

const STATUSES: Record<GithubTaskStatus, true> = {
	pending: true,
	running: true,
	completed: true,
	failed: true,
};

function isStatus(value: unknown): value is GithubTaskStatus {
	return typeof value === "string" && value in STATUSES;
}

function parseStringList(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function parseSource(value: unknown): GithubTaskSource | null {
	if (typeof value !== "object" || value === null || !("kind" in value)) return null;
	if (value.kind === "manual") {
		if ("cwd" in value && typeof value.cwd === "string") {
			const cwd = value.cwd.trim();
			if (cwd) return { kind: "manual", cwd };
		}
		return { kind: "manual" };
	}
	if (value.kind !== "issue") return null;
	if (!("owner" in value) || typeof value.owner !== "string") return null;
	if (!("repo" in value) || typeof value.repo !== "string") return null;
	if (!("issueNumber" in value) || typeof value.issueNumber !== "number") return null;
	if (!("issueUrl" in value) || typeof value.issueUrl !== "string") return null;
	if (!("issueUpdatedAt" in value) || typeof value.issueUpdatedAt !== "string") return null;
	return {
		kind: "issue",
		owner: value.owner,
		repo: value.repo,
		issueNumber: value.issueNumber,
		issueUrl: value.issueUrl,
		issueUpdatedAt: value.issueUpdatedAt,
	};
}

function parseTask(value: unknown): GithubTask | null {
	if (typeof value !== "object" || value === null) return null;
	if (!("id" in value) || typeof value.id !== "string") return null;
	if (!("title" in value) || typeof value.title !== "string") return null;
	if (!("promptText" in value) || typeof value.promptText !== "string") return null;
	if (!("source" in value)) return null;
	const source = parseSource(value.source);
	if (!source) return null;
	if (!("status" in value) || !isStatus(value.status)) return null;
	if (!("createdAt" in value) || typeof value.createdAt !== "number") return null;
	if (!("updatedAt" in value) || typeof value.updatedAt !== "number") return null;
	const task: GithubTask = {
		id: value.id,
		title: value.title,
		promptText: value.promptText,
		source,
		status: value.status,
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
	};
	if ("sessionId" in value && typeof value.sessionId === "string") task.sessionId = value.sessionId;
	if ("error" in value && typeof value.error === "string") task.error = value.error;
	const labels = "labels" in value ? parseStringList(value.labels) : undefined;
	if (labels) task.labels = labels;
	const assignees = "assignees" in value ? parseStringList(value.assignees) : undefined;
	if (assignees) task.assignees = assignees;
	if ("body" in value && typeof value.body === "string") task.body = value.body;
	return task;
}

function parseRepoTarget(value: unknown): { owner: string; repo: string } | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "object") return null;
	if (!("owner" in value) || typeof value.owner !== "string") return null;
	if (!("repo" in value) || typeof value.repo !== "string") return null;
	return { owner: value.owner, repo: value.repo };
}

function parseIssueNextPage(value: unknown): number | null {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

export function parsePluginState(value: unknown): PluginState {
	if (typeof value !== "object" || value === null) return EMPTY_STATE;
	const repoTarget = "repoTarget" in value ? parseRepoTarget(value.repoTarget) : null;
	const workspace = "workspace" in value ? parseWorkspaceSource(value.workspace) : CONVERSATION_WORKSPACE;
	const tasks =
		"tasks" in value && Array.isArray(value.tasks)
			? value.tasks.flatMap((item) => {
					const task = parseTask(item);
					return task ? [task] : [];
				})
			: [];
	const issueNextPage = "issueNextPage" in value ? parseIssueNextPage(value.issueNextPage) : null;
	const lastFetch = "lastFetch" in value ? parseRepoTarget(value.lastFetch) : null;
	return { repoTarget, workspace, tasks, issueNextPage, lastFetch };
}

function titleFromPrompt(promptText: string): string {
	return promptText.split(/\r?\n/, 1)[0] ?? promptText;
}

export function addManualTask(
	state: PluginState,
	input: { id: string; promptText: string; now: number; cwd: string | null },
): PluginState {
	const promptText = input.promptText.trim();
	const cwd = input.cwd?.trim() ?? "";
	const task: GithubTask = {
		id: input.id,
		title: titleFromPrompt(promptText),
		promptText,
		source: cwd ? { kind: "manual", cwd } : { kind: "manual" },
		status: "pending",
		createdAt: input.now,
		updatedAt: input.now,
	};
	return { ...state, tasks: [...state.tasks, task] };
}

export function removeTask(state: PluginState, taskId: string): PluginState {
	const task = state.tasks.find((item) => item.id === taskId);
	if (!task || task.source.kind !== "manual" || task.status === "running") return state;
	return { ...state, tasks: state.tasks.filter((item) => item.id !== taskId) };
}

export function updateTaskPrompt(
	state: PluginState,
	input: { taskId: string; promptText: string; now: number },
): PluginState {
	const promptText = input.promptText.trim();
	if (!promptText) return state;
	let changed = false;
	const tasks = state.tasks.map((task) => {
		if (task.id !== input.taskId) return task;
		if (task.source.kind !== "manual") return task;
		if (task.status === "running" || task.status === "completed") return task;
		changed = true;
		const next: GithubTask = {
			...task,
			title: titleFromPrompt(promptText),
			promptText,
			updatedAt: input.now,
		};
		if (task.status === "failed") {
			next.status = "pending";
			delete next.error;
		}
		return next;
	});
	return changed ? { ...state, tasks } : state;
}

function issueIdentity(source: Extract<GithubTaskSource, { kind: "issue" }>): string {
	return `${source.owner}/${source.repo}/${source.issueNumber}`;
}

function sameStringList(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
	const a = left ?? [];
	const b = right ?? [];
	if (a.length !== b.length) return false;
	return a.every((item, index) => item === b[index]);
}

function issueFieldsChanged(existing: GithubTask, incoming: GithubTask): boolean {
	if (existing.title !== incoming.title) return true;
	if (!sameStringList(existing.labels, incoming.labels)) return true;
	if (!sameStringList(existing.assignees, incoming.assignees)) return true;
	if ((existing.body ?? "") !== (incoming.body ?? "")) return true;
	if (existing.source.kind !== "issue" || incoming.source.kind !== "issue") return true;
	return existing.source.issueUpdatedAt !== incoming.source.issueUpdatedAt;
}

export function mergeIssueTasks(
	state: PluginState,
	incoming: GithubTask[],
): { state: PluginState; imported: number; updated: number } {
	const indexByIdentity = new Map<string, number>();
	for (const [index, task] of state.tasks.entries()) {
		if (task.source.kind !== "issue") continue;
		indexByIdentity.set(issueIdentity(task.source), index);
	}
	if (state.tasks.length === 0 && incoming.length === 0) {
		return { state, imported: 0, updated: 0 };
	}

	const tasks = [...state.tasks];
	let imported = 0;
	let updated = 0;
	let changed = false;
	for (const task of incoming) {
		if (task.source.kind !== "issue") continue;
		const key = issueIdentity(task.source);
		const existingIndex = indexByIdentity.get(key);
		if (existingIndex === undefined) {
			indexByIdentity.set(key, tasks.length);
			tasks.push(task);
			imported += 1;
			changed = true;
			continue;
		}
		const existing = tasks[existingIndex];
		if (!existing) continue;
		const next: GithubTask = {
			...existing,
			title: task.title,
			labels: task.labels,
			assignees: task.assignees,
			body: task.body,
			source: task.source,
		};
		if (existing.status === "pending" || existing.status === "failed") {
			next.promptText = task.promptText;
			next.updatedAt = task.updatedAt;
		}
		if (issueFieldsChanged(existing, task)) updated += 1;
		tasks[existingIndex] = next;
		changed = true;
	}
	if (!changed) return { state, imported: 0, updated: 0 };
	return { state: { ...state, tasks }, imported, updated };
}

export function setTaskStatus(
	state: PluginState,
	taskId: string,
	update: {
		status: GithubTaskStatus;
		sessionId?: string;
		error?: string;
		now: number;
	},
): PluginState {
	return {
		...state,
		tasks: state.tasks.map((task) => {
			if (task.id !== taskId) return task;
			const next: GithubTask = { ...task, status: update.status, updatedAt: update.now };
			if (update.sessionId !== undefined) next.sessionId = update.sessionId;
			if (update.status === "failed") next.error = update.error ?? "";
			else delete next.error;
			return next;
		}),
	};
}

export function hasRunningTask(state: PluginState): boolean {
	return state.tasks.some((task) => task.status === "running");
}

export async function loadPluginState(storage: PluginStorageApi): Promise<PluginState> {
	try {
		const raw = await readJsonFile<unknown>(storage, STATE_FILE);
		return parsePluginState(raw);
	} catch {
		return EMPTY_STATE;
	}
}

export async function savePluginState(storage: PluginStorageApi, state: PluginState): Promise<void> {
	await writeJsonFile(storage, STATE_FILE, state);
}

import { readJsonFile, writeJsonFile, type PluginStorageApi } from "@vetta-org/plugin-sdk";

export const STATE_FILE = "state.json";

export type GithubTaskSource =
	| { kind: "issue"; owner: string; repo: string; issueNumber: number; issueUrl: string; issueUpdatedAt: string }
	| { kind: "manual" };

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
}

export interface PluginState {
	repoTarget: { owner: string; repo: string } | null;
	tasks: GithubTask[];
}

export const EMPTY_STATE: PluginState = { repoTarget: null, tasks: [] };

const STATUSES: Record<GithubTaskStatus, true> = {
	pending: true,
	running: true,
	completed: true,
	failed: true,
};

function isStatus(value: unknown): value is GithubTaskStatus {
	return typeof value === "string" && value in STATUSES;
}

function parseSource(value: unknown): GithubTaskSource | null {
	if (typeof value !== "object" || value === null || !("kind" in value)) return null;
	if (value.kind === "manual") return { kind: "manual" };
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
	return task;
}

function parseRepoTarget(value: unknown): { owner: string; repo: string } | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "object") return null;
	if (!("owner" in value) || typeof value.owner !== "string") return null;
	if (!("repo" in value) || typeof value.repo !== "string") return null;
	return { owner: value.owner, repo: value.repo };
}

export function parsePluginState(value: unknown): PluginState {
	if (typeof value !== "object" || value === null) return EMPTY_STATE;
	const repoTarget = "repoTarget" in value ? parseRepoTarget(value.repoTarget) : null;
	const tasks =
		"tasks" in value && Array.isArray(value.tasks)
			? value.tasks.flatMap((item) => {
					const task = parseTask(item);
					return task ? [task] : [];
				})
			: [];
	return { repoTarget, tasks };
}

export function addManualTask(
	state: PluginState,
	input: { id: string; promptText: string; now: number },
): PluginState {
	const promptText = input.promptText.trim();
	const task: GithubTask = {
		id: input.id,
		title: promptText.split(/\r?\n/, 1)[0] ?? promptText,
		promptText,
		source: { kind: "manual" },
		status: "pending",
		createdAt: input.now,
		updatedAt: input.now,
	};
	return { ...state, tasks: [...state.tasks, task] };
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

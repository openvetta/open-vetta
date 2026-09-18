import type { GithubTask } from "./state";

export type WorkspaceSource = { kind: "conversation" } | { kind: "path"; path: string };

export const CONVERSATION_WORKSPACE: WorkspaceSource = { kind: "conversation" };

const PATH_PREFIX = "path:";

export function parseWorkspaceSource(value: unknown): WorkspaceSource {
	if (typeof value !== "object" || value === null) return CONVERSATION_WORKSPACE;
	if (!("kind" in value) || value.kind !== "path") return CONVERSATION_WORKSPACE;
	if (!("path" in value) || typeof value.path !== "string") return CONVERSATION_WORKSPACE;
	const path = value.path.trim();
	if (!path) return CONVERSATION_WORKSPACE;
	return { kind: "path", path };
}

export function resolveWorkspaceCwd(
	workspace: WorkspaceSource,
	conversationCwd: string | null | undefined,
): string | null {
	if (workspace.kind === "path") {
		const path = workspace.path.trim();
		return path || null;
	}
	const cwd = conversationCwd?.trim() ?? "";
	return cwd || null;
}

export function workspaceSelectValue(workspace: WorkspaceSource): string {
	return workspace.kind === "path" ? `${PATH_PREFIX}${workspace.path}` : "conversation";
}

export function parseWorkspaceSelectValue(value: string): WorkspaceSource {
	if (value.startsWith(PATH_PREFIX)) {
		const path = value.slice(PATH_PREFIX.length).trim();
		if (path) return { kind: "path", path };
	}
	return CONVERSATION_WORKSPACE;
}

export function normalizeLocalPath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

export function pathBasename(path: string): string {
	const normalized = normalizeLocalPath(path);
	const index = normalized.lastIndexOf("/");
	return index >= 0 ? normalized.slice(index + 1) : normalized;
}

export function extraWorkspacePath(
	workspace: WorkspaceSource,
	workbenchPaths: readonly string[],
): string | null {
	if (workspace.kind !== "path") return null;
	if (workbenchPaths.some((path) => normalizeLocalPath(path) === normalizeLocalPath(workspace.path))) {
		return null;
	}
	return workspace.path;
}

export function tasksVisibleForRepo(
	tasks: GithubTask[],
	repoTarget: { owner: string; repo: string } | null,
): GithubTask[] {
	if (!repoTarget) return tasks;
	return tasks.filter((task) => {
		if (task.source.kind !== "issue") return true;
		return task.source.owner === repoTarget.owner && task.source.repo === repoTarget.repo;
	});
}

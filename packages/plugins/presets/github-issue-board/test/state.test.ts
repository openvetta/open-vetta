import { describe, expect, it } from "vitest";
import {
	addManualTask,
	EMPTY_STATE,
	mergeIssueTasks,
	parsePluginState,
	removeTask,
	updateTaskPrompt,
	type GithubTask,
} from "../src/state";
import { CONVERSATION_WORKSPACE } from "../src/workspace";

const NOW = 1_700_000_000_000;

function issueTask(overrides: Partial<GithubTask> & Pick<GithubTask, "title">): GithubTask {
	return {
		id: overrides.id ?? "task-1",
		title: overrides.title,
		promptText: overrides.promptText ?? overrides.title,
		source: overrides.source ?? {
			kind: "issue",
			owner: "acme",
			repo: "app",
			issueNumber: 10,
			issueUrl: "https://github.com/acme/app/issues/10",
			issueUpdatedAt: "2026-01-02T03:04:05Z",
		},
		status: overrides.status ?? "pending",
		createdAt: overrides.createdAt ?? NOW,
		updatedAt: overrides.updatedAt ?? NOW,
		labels: overrides.labels,
		assignees: overrides.assignees,
		body: overrides.body,
		sessionId: overrides.sessionId,
		error: overrides.error,
	};
}

describe("parsePluginState", () => {
	it("keeps a pinned workspace path and defaults missing workspace to the current session", () => {
		expect(parsePluginState({ repoTarget: null, workspace: { kind: "path", path: "/apps/web" }, tasks: [] })).toEqual({
			repoTarget: null,
			workspace: { kind: "path", path: "/apps/web" },
			tasks: [],
			issueNextPage: null,
			lastFetch: null,
		});
		expect(parsePluginState({ repoTarget: null, tasks: [] })).toEqual({
			repoTarget: null,
			workspace: CONVERSATION_WORKSPACE,
			tasks: [],
			issueNextPage: null,
			lastFetch: null,
		});
		expect(parsePluginState(null)).toEqual(EMPTY_STATE);
	});

	it("treats missing issueNextPage and lastFetch as null", () => {
		const parsed = parsePluginState({
			repoTarget: { owner: "acme", repo: "app" },
			workspace: CONVERSATION_WORKSPACE,
			tasks: [],
		});
		expect(parsed.issueNextPage).toBeNull();
		expect(parsed.lastFetch).toBeNull();
		expect(parsePluginState({ ...parsed, issueNextPage: 0, lastFetch: { owner: "acme" } }).issueNextPage).toBeNull();
		expect(
			parsePluginState({
				...parsed,
				issueNextPage: 2,
				lastFetch: { owner: "acme", repo: "app" },
			}).issueNextPage,
		).toBe(2);
	});

	it("round-trips a manual task cwd and keeps legacy manual tasks without one", () => {
		const withCwd = addManualTask(EMPTY_STATE, {
			id: "manual-1",
			promptText: "本地修复",
			now: NOW,
			cwd: "/apps/web",
		});
		expect(withCwd.tasks[0]?.source).toEqual({ kind: "manual", cwd: "/apps/web" });
		expect(parsePluginState(withCwd).tasks[0]?.source).toEqual({ kind: "manual", cwd: "/apps/web" });
		expect(
			parsePluginState({
				...EMPTY_STATE,
				tasks: [
					{
						id: "legacy",
						title: "legacy",
						promptText: "legacy",
						source: { kind: "manual" },
						status: "pending",
						createdAt: NOW,
						updatedAt: NOW,
					},
				],
			}).tasks[0]?.source,
		).toEqual({ kind: "manual" });
	});
});

describe("mergeIssueTasks", () => {
	it("appends a new issue and refreshes a pending issue's title, body and prompt", () => {
		const existing = issueTask({
			id: "kept",
			title: "Fix login",
			promptText: "old prompt",
			body: "old body",
		});
		const incomingNew = issueTask({
			id: "new",
			title: "Ship web",
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 11,
				issueUrl: "https://github.com/acme/app/issues/11",
				issueUpdatedAt: "2026-01-03T00:00:00Z",
			},
		});
		const incomingRefresh = issueTask({
			id: "ignored",
			title: "Fix login button",
			promptText: "new prompt",
			body: "new body",
			labels: ["bug"],
			assignees: ["alice"],
			updatedAt: NOW + 5,
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 10,
				issueUrl: "https://github.com/acme/app/issues/10",
				issueUpdatedAt: "2026-01-04T00:00:00Z",
			},
		});
		const merged = mergeIssueTasks({ ...EMPTY_STATE, tasks: [existing] }, [incomingRefresh, incomingNew]);
		expect(merged.imported).toBe(1);
		expect(merged.updated).toBe(1);
		expect(merged.state.tasks).toHaveLength(2);
		expect(merged.state.tasks[0]).toMatchObject({
			id: "kept",
			title: "Fix login button",
			promptText: "new prompt",
			body: "new body",
			labels: ["bug"],
			assignees: ["alice"],
			status: "pending",
			updatedAt: NOW + 5,
		});
		expect(merged.state.tasks[1]?.id).toBe("new");
	});

	it("refreshes a running issue's title without replacing the prompt", () => {
		const existing = issueTask({
			id: "kept",
			title: "Fix login",
			promptText: "old prompt",
			body: "old body",
			status: "running",
			sessionId: "sess-1",
			updatedAt: NOW,
		});
		const incoming = issueTask({
			id: "ignored",
			title: "Fix login button",
			promptText: "new prompt",
			body: "new body",
			updatedAt: NOW + 5,
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 10,
				issueUrl: "https://github.com/acme/app/issues/10",
				issueUpdatedAt: "2026-01-04T00:00:00Z",
			},
		});
		const merged = mergeIssueTasks({ ...EMPTY_STATE, tasks: [existing] }, [incoming]);
		expect(merged.imported).toBe(0);
		expect(merged.updated).toBe(1);
		expect(merged.state.tasks[0]).toMatchObject({
			id: "kept",
			title: "Fix login button",
			promptText: "old prompt",
			body: "new body",
			status: "running",
			sessionId: "sess-1",
			updatedAt: NOW,
		});
	});
});

describe("removeTask", () => {
	it("drops a pending manual task and leaves issues and running tasks in the queue", () => {
		const pending = addManualTask(EMPTY_STATE, { id: "p", promptText: "pending", now: NOW, cwd: null }).tasks[0]!;
		const running = {
			...addManualTask(EMPTY_STATE, { id: "r", promptText: "running", now: NOW, cwd: null }).tasks[0]!,
			status: "running" as const,
		};
		const issue = issueTask({ id: "i", title: "Fix login" });
		const state = { ...EMPTY_STATE, tasks: [pending, running, issue] };
		expect(removeTask(state, "p").tasks.map((task) => task.id)).toEqual(["r", "i"]);
		expect(removeTask(state, "r")).toBe(state);
		expect(removeTask(state, "i")).toBe(state);
		expect(removeTask(state, "missing")).toBe(state);
	});
});

describe("updateTaskPrompt", () => {
	it("rewrites a manual title and returns a failed task to pending", () => {
		const queued = addManualTask(EMPTY_STATE, { id: "m", promptText: "old", now: NOW, cwd: "/repo" });
		const failed = {
			...queued,
			tasks: [{ ...queued.tasks[0]!, status: "failed" as const, error: "boom" }],
		};
		const next = updateTaskPrompt(failed, { taskId: "m", promptText: "new title\nmore", now: NOW + 1 });
		expect(next.tasks[0]).toMatchObject({
			title: "new title",
			promptText: "new title\nmore",
			status: "pending",
			updatedAt: NOW + 1,
		});
		expect(next.tasks[0]?.error).toBeUndefined();
	});

	it("ignores issue tasks, running tasks, and empty edits", () => {
		const pending = addManualTask(EMPTY_STATE, { id: "m", promptText: "old", now: NOW, cwd: null }).tasks[0]!;
		const running = { ...pending, id: "r", status: "running" as const };
		const issue = issueTask({ id: "i", title: "Fix login", promptText: "old" });
		const state = { ...EMPTY_STATE, tasks: [pending, running, issue] };
		expect(updateTaskPrompt(state, { taskId: "i", promptText: "new prompt", now: NOW + 1 })).toBe(state);
		expect(updateTaskPrompt(state, { taskId: "r", promptText: "nope", now: NOW + 1 })).toBe(state);
		expect(updateTaskPrompt(state, { taskId: "m", promptText: "   ", now: NOW + 1 })).toBe(state);
	});
});

import { describe, expect, it } from "vitest";
import {
	addManualTask,
	applyIssueFetchFilter,
	applyOpenIssueSnapshot,
	DEFAULT_ISSUE_FETCH_FILTER,
	EMPTY_STATE,
	finishIssueFetchPage,
	hasRunningTask,
	isUnfilteredIssueFetch,
	mergeIssueTasks,
	parsePluginState,
	reclaimRunningTasks,
	reconcileRunningTasks,
	removeTask,
	retryFailedTask,
	selectAutoAdvanceTask,
	setAutoAdvance,
	setTaskStatus,
	updateTaskPrompt,
	type GithubTask,
	type PluginState,
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
			issueState: "open",
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
			issueSync: null,
			fetchFilter: DEFAULT_ISSUE_FETCH_FILTER,
			autoAdvance: false,
		});
		expect(parsePluginState({ repoTarget: null, tasks: [] })).toEqual({
			repoTarget: null,
			workspace: CONVERSATION_WORKSPACE,
			tasks: [],
			issueNextPage: null,
			lastFetch: null,
			issueSync: null,
			fetchFilter: DEFAULT_ISSUE_FETCH_FILTER,
			autoAdvance: false,
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

	it("defaults missing autoAdvance to false and only keeps a boolean true", () => {
		expect(parsePluginState({ tasks: [] }).autoAdvance).toBe(false);
		expect(parsePluginState({ autoAdvance: true, tasks: [] }).autoAdvance).toBe(true);
		expect(parsePluginState({ autoAdvance: false, tasks: [] }).autoAdvance).toBe(false);
		expect(parsePluginState({ autoAdvance: "yes", tasks: [] }).autoAdvance).toBe(false);
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
				issueState: "open",
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
				issueState: "open",
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
				issueState: "open",
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

	it("does not import a closed issue that is not already queued", () => {
		const incoming = issueTask({
			id: "closed",
			title: "Old bug",
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 9,
				issueUrl: "https://github.com/acme/app/issues/9",
				issueUpdatedAt: "2026-01-04T00:00:00Z",
				issueState: "closed",
			},
		});
		const merged = mergeIssueTasks(EMPTY_STATE, [incoming]);
		expect(merged.imported).toBe(0);
		expect(merged.state.tasks).toHaveLength(0);
	});
});

describe("applyOpenIssueSnapshot", () => {
	it("marks repo issues missing from the open snapshot as closed", () => {
		const open = issueTask({ id: "open", title: "Still open" });
		const stale = issueTask({
			id: "stale",
			title: "Closed on GitHub",
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 11,
				issueUrl: "https://github.com/acme/app/issues/11",
				issueUpdatedAt: "2026-01-03T00:00:00Z",
				issueState: "open",
			},
		});
		const otherRepo = issueTask({
			id: "other",
			title: "Other repo",
			source: {
				kind: "issue",
				owner: "acme",
				repo: "web",
				issueNumber: 11,
				issueUrl: "https://github.com/acme/web/issues/11",
				issueUpdatedAt: "2026-01-03T00:00:00Z",
				issueState: "open",
			},
		});
		const result = applyOpenIssueSnapshot({ ...EMPTY_STATE, tasks: [open, stale, otherRepo] }, {
			owner: "acme",
			repo: "app",
			openNumbers: new Set([10]),
		});
		expect(result.closed).toBe(1);
		expect(result.state.tasks[0]?.source).toMatchObject({ issueNumber: 10, issueState: "open" });
		expect(result.state.tasks[1]?.source).toMatchObject({ issueNumber: 11, issueState: "closed" });
		expect(result.state.tasks[2]?.source).toMatchObject({ repo: "web", issueState: "open" });
	});

	it("treats a missing persisted issueState as open", () => {
		const parsed = parsePluginState({
			repoTarget: null,
			tasks: [
				{
					id: "legacy",
					title: "Fix login",
					promptText: "Fix login",
					source: {
						kind: "issue",
						owner: "acme",
						repo: "app",
						issueNumber: 10,
						issueUrl: "https://github.com/acme/app/issues/10",
						issueUpdatedAt: "2026-01-02T03:04:05Z",
					},
					status: "pending",
					createdAt: NOW,
					updatedAt: NOW,
				},
			],
		});
		expect(parsed.issueSync).toBeNull();
		expect(parsed.tasks[0]?.source).toMatchObject({ kind: "issue", issueState: "open" });
	});

	it("reads missing fetchFilter as all open issues with no label", () => {
		expect(parsePluginState({ repoTarget: null, tasks: [] }).fetchFilter).toEqual(DEFAULT_ISSUE_FETCH_FILTER);
		expect(
			parsePluginState({
				repoTarget: null,
				tasks: [],
				fetchFilter: { assignee: "me", label: "  bug  " },
			}).fetchFilter,
		).toEqual({ assignee: "me", label: "bug" });
		expect(
			parsePluginState({
				repoTarget: null,
				tasks: [],
				fetchFilter: { assignee: "someone", label: "   " },
			}).fetchFilter,
		).toEqual(DEFAULT_ISSUE_FETCH_FILTER);
	});
});

describe("applyIssueFetchFilter", () => {
	it("resets pagination when the fetch filter changes and keeps queued tasks", () => {
		const queued = issueTask({ id: "keep", title: "Already queued" });
		const state = {
			...EMPTY_STATE,
			tasks: [queued],
			issueNextPage: 2,
			issueSync: { owner: "acme", repo: "app", seenNumbers: [10] },
			lastFetch: { owner: "acme", repo: "app" },
		};
		const next = applyIssueFetchFilter(state, { assignee: "me", label: " bug " });
		expect(next.tasks).toEqual([queued]);
		expect(next.lastFetch).toBeNull();
		expect(next.fetchFilter).toEqual({ assignee: "me", label: "bug" });
		expect(next.issueNextPage).toBeNull();
		expect(next.issueSync).toBeNull();
		expect(isUnfilteredIssueFetch(next.fetchFilter)).toBe(false);
		expect(applyIssueFetchFilter(next, { assignee: "me", label: "bug" })).toBe(next);
	});
});

describe("finishIssueFetchPage", () => {
	it("does not close queued issues that are outside a filtered fetch", () => {
		const leftover = issueTask({ id: "keep", title: "Unassigned leftover" });
		const fetched = issueTask({
			id: "mine",
			title: "Assigned to me",
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 12,
				issueUrl: "https://github.com/acme/app/issues/12",
				issueUpdatedAt: "2026-01-02T03:04:05Z",
				issueState: "open",
			},
		});
		const result = finishIssueFetchPage(
			{ ...EMPTY_STATE, tasks: [leftover, fetched] },
			{
				owner: "acme",
				repo: "app",
				filter: { assignee: "me", label: null },
				seenNumbers: [12],
				nextPage: null,
			},
		);
		expect(result.closed).toBe(0);
		expect(result.state.tasks[0]?.source).toMatchObject({ issueNumber: 10, issueState: "open" });
		expect(result.state.issueSync).toBeNull();
		expect(result.state.lastFetch).toEqual({ owner: "acme", repo: "app" });
	});

	it("still closes unseen issues after the last unfiltered page", () => {
		const leftover = issueTask({ id: "old", title: "Old leftover" });
		const result = finishIssueFetchPage(
			{ ...EMPTY_STATE, tasks: [leftover] },
			{
				owner: "acme",
				repo: "app",
				filter: DEFAULT_ISSUE_FETCH_FILTER,
				seenNumbers: [],
				nextPage: null,
			},
		);
		expect(result.closed).toBe(1);
		expect(result.state.tasks[0]?.source).toMatchObject({ issueNumber: 10, issueState: "closed" });
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

describe("reclaimRunningTasks", () => {
	it("marks a finished session completed, keeps the session, and leaves other tasks alone", () => {
		const running = issueTask({
			id: "run",
			title: "Fix login",
			status: "running",
			sessionId: "/repo/sess-1.jsonl",
			updatedAt: NOW,
		});
		const pendingTask = issueTask({
			id: "pend",
			title: "Add docs",
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 11,
				issueUrl: "https://github.com/acme/app/issues/11",
				issueUpdatedAt: "2026-01-02T03:04:05Z",
				issueState: "open",
			},
		});
		const completed = addManualTask(EMPTY_STATE, {
			id: "done",
			promptText: "done",
			now: NOW,
			cwd: null,
		}).tasks[0]!;
		const completedTask = { ...completed, status: "completed" as const };
		const state = { ...EMPTY_STATE, tasks: [running, pendingTask, completedTask] };
		const next = reclaimRunningTasks(state, NOW + 5, "Interrupted by a previous session");
		expect(next.tasks[0]).toMatchObject({
			id: "run",
			status: "completed",
			sessionId: "/repo/sess-1.jsonl",
			updatedAt: NOW + 5,
			promptText: "Fix login",
		});
		expect(next.tasks[0]?.error).toBeUndefined();
		expect(next.tasks[1]).toBe(pendingTask);
		expect(next.tasks[2]).toBe(completedTask);
		expect(hasRunningTask(next)).toBe(false);
	});

	it("marks a running task without a session as interrupted", () => {
		const running = issueTask({
			id: "run",
			title: "Fix login",
			status: "running",
			updatedAt: NOW,
		});
		const next = reclaimRunningTasks(
			{ ...EMPTY_STATE, tasks: [running] },
			NOW + 5,
			"Interrupted by a previous session",
		);
		expect(next.tasks[0]).toMatchObject({
			id: "run",
			status: "failed",
			error: "Interrupted by a previous session",
			updatedAt: NOW + 5,
		});
		expect(next.tasks[0]?.sessionId).toBeUndefined();
	});

	it("returns the same state when nothing is running", () => {
		const pending = issueTask({ title: "Fix login" });
		const state = { ...EMPTY_STATE, tasks: [pending] };
		expect(reclaimRunningTasks(state, NOW + 1, "Interrupted by a previous session")).toBe(state);
	});
});

describe("reconcileRunningTasks", () => {
	it("keeps a running task whose session is still live", () => {
		const running = issueTask({
			id: "run",
			title: "Fix login",
			status: "running",
			sessionId: "/repo/sess-1.jsonl",
		});
		const state = { ...EMPTY_STATE, tasks: [running] };
		const result = reconcileRunningTasks(state, ["/repo/sess-1.jsonl"], NOW + 1, "Interrupted by a previous session");
		expect(result.state).toBe(state);
		expect(result.live).toEqual([running]);
	});

	it("marks a running task completed when its session is no longer live", () => {
		const running = issueTask({
			id: "run",
			title: "Fix login",
			status: "running",
			sessionId: "/repo/sess-1.jsonl",
		});
		const pending = issueTask({ id: "pend", title: "Add docs" });
		const state = { ...EMPTY_STATE, tasks: [running, pending] };
		const result = reconcileRunningTasks(state, [], NOW + 5, "Interrupted by a previous session");
		expect(result.live).toEqual([]);
		expect(result.state.tasks[0]).toMatchObject({
			id: "run",
			status: "completed",
			sessionId: "/repo/sess-1.jsonl",
			updatedAt: NOW + 5,
		});
		expect(result.state.tasks[0]?.error).toBeUndefined();
		expect(result.state.tasks[1]).toBe(pending);
	});

	it("marks a running task interrupted when it never recorded a session", () => {
		const running = issueTask({
			id: "run",
			title: "Fix login",
			status: "running",
		});
		const result = reconcileRunningTasks(
			{ ...EMPTY_STATE, tasks: [running] },
			[],
			NOW + 5,
			"Interrupted by a previous session",
		);
		expect(result.live).toEqual([]);
		expect(result.state.tasks[0]).toMatchObject({
			status: "failed",
			error: "Interrupted by a previous session",
			updatedAt: NOW + 5,
		});
	});
});

describe("retryFailedTask", () => {
	it("returns a failed issue to pending without changing the prompt", () => {
		const failed = issueTask({
			title: "Fix login",
			status: "failed",
			error: "boom",
			sessionId: "/repo/sess-1.jsonl",
			promptText: "Fix login\n\nThe button does nothing.",
		});
		const state = { ...EMPTY_STATE, tasks: [failed] };
		const next = retryFailedTask(state, "task-1", NOW + 2);
		expect(next.tasks[0]).toMatchObject({
			status: "pending",
			sessionId: "/repo/sess-1.jsonl",
			promptText: "Fix login\n\nThe button does nothing.",
			title: "Fix login",
			updatedAt: NOW + 2,
		});
		expect(next.tasks[0]?.error).toBeUndefined();
	});

	it("leaves pending, running, and completed tasks unchanged", () => {
		const pending = issueTask({ id: "p", title: "pending" });
		const running = issueTask({ id: "r", title: "running", status: "running" });
		const completed = issueTask({ id: "c", title: "completed", status: "completed" });
		const state = { ...EMPTY_STATE, tasks: [pending, running, completed] };
		expect(retryFailedTask(state, "p", NOW + 1)).toBe(state);
		expect(retryFailedTask(state, "r", NOW + 1)).toBe(state);
		expect(retryFailedTask(state, "c", NOW + 1)).toBe(state);
		expect(retryFailedTask(state, "missing", NOW + 1)).toBe(state);
	});
});

describe("selectAutoAdvanceTask", () => {
	function queuedManual(...titles: string[]): PluginState {
		return titles.reduce(
			(state, title, index) =>
				addManualTask(state, { id: `task-${index + 1}`, promptText: title, now: index + 1, cwd: "/repo" }),
			EMPTY_STATE,
		);
	}

	it("picks the first pending task after the board visibility rules when autoAdvance is on and the finished task completed", () => {
		const completed = setTaskStatus(setAutoAdvance(queuedManual("Fix login", "Add docs"), true), "task-1", {
			status: "completed",
			now: 9,
		});
		expect(selectAutoAdvanceTask(completed, { cwd: "/repo", finishedTaskId: "task-1" })?.id).toBe("task-2");
	});

	it("does not skip a pending task that table filters would hide", () => {
		const withIssue = mergeIssueTasks(setAutoAdvance(EMPTY_STATE, true), [
			issueTask({ id: "bug", title: "Fix login", labels: ["bug"] }),
			issueTask({
				id: "docs",
				title: "Add docs",
				labels: ["docs"],
				source: {
					kind: "issue",
					owner: "acme",
					repo: "app",
					issueNumber: 12,
					issueUrl: "https://github.com/acme/app/issues/12",
					issueUpdatedAt: "2026-01-02T03:04:05Z",
					issueState: "open",
				},
			}),
		]).state;
		const completed = setTaskStatus(withIssue, "bug", { status: "completed", now: 9 });
		expect(selectAutoAdvanceTask(completed, { cwd: "/repo", finishedTaskId: "bug" })?.id).toBe("docs");
	});

	it("does not advance after a failed or stopped task, when the switch is off, or when a run is still in flight", () => {
		const queued = queuedManual("Fix login", "Add docs");
		const failed = setTaskStatus(setAutoAdvance(queued, true), "task-1", {
			status: "failed",
			error: "Stopped",
			now: 9,
		});
		expect(selectAutoAdvanceTask(failed, { cwd: "/repo", finishedTaskId: "task-1" })).toBeNull();

		const completedOff = setTaskStatus(queued, "task-1", { status: "completed", now: 9 });
		expect(selectAutoAdvanceTask(completedOff, { cwd: "/repo", finishedTaskId: "task-1" })).toBeNull();

		const stillRunning = setTaskStatus(setAutoAdvance(queued, true), "task-1", { status: "running", now: 9 });
		expect(selectAutoAdvanceTask(stillRunning, { cwd: "/repo", finishedTaskId: "task-1" })).toBeNull();
	});

	it("stops when there is no project, and skips issues that are not visible on this board", () => {
		const completed = setTaskStatus(setAutoAdvance(queuedManual("Fix login", "Add docs"), true), "task-1", {
			status: "completed",
			now: 9,
		});
		expect(
			selectAutoAdvanceTask(completed, { cwd: "/repo", finishedTaskId: "task-1", notice: "no-project" }),
		).toBeNull();

		const foreign = mergeIssueTasks(
			setAutoAdvance({ ...EMPTY_STATE, repoTarget: { owner: "acme", repo: "app" } }, true),
			[
				issueTask({ id: "local", title: "Fix login" }),
				issueTask({
					id: "other",
					title: "Other repo",
					source: {
						kind: "issue",
						owner: "other",
						repo: "lib",
						issueNumber: 3,
						issueUrl: "https://github.com/other/lib/issues/3",
						issueUpdatedAt: "2026-01-02T03:04:05Z",
						issueState: "open",
					},
				}),
			],
		).state;
		const done = setTaskStatus(foreign, "local", { status: "completed", now: 9 });
		expect(selectAutoAdvanceTask(done, { cwd: "/repo", finishedTaskId: "local" })).toBeNull();
	});
});

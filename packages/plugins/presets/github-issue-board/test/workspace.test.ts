import { describe, expect, it } from "vitest";
import type { GithubTask } from "../src/state";
import {
	CONVERSATION_WORKSPACE,
	extraWorkspacePath,
	parseWorkspaceSelectValue,
	parseWorkspaceSource,
	pathBasename,
	resolveWorkspaceCwd,
	tasksVisibleForBoard,
	filterBoardTasks,
	workspaceSelectValue,
} from "../src/workspace";

function issueTask(owner: string, repo: string, title: string): GithubTask {
	return {
		id: title,
		title,
		promptText: title,
		source: {
			kind: "issue",
			owner,
			repo,
			issueNumber: 1,
			issueUrl: `https://github.com/${owner}/${repo}/issues/1`,
			issueUpdatedAt: "2026-01-01T00:00:00Z",
			issueState: "open",
		},
		status: "pending",
		createdAt: 1,
		updatedAt: 1,
	};
}

describe("workspace source", () => {
	it("treats missing or invalid persisted workspace as the current session", () => {
		expect(parseWorkspaceSource(undefined)).toEqual(CONVERSATION_WORKSPACE);
		expect(parseWorkspaceSource({ kind: "path" })).toEqual(CONVERSATION_WORKSPACE);
		expect(parseWorkspaceSource({ kind: "path", path: "  " })).toEqual(CONVERSATION_WORKSPACE);
		expect(parseWorkspaceSource({ kind: "path", path: "/apps/web" })).toEqual({
			kind: "path",
			path: "/apps/web",
		});
	});

	it("resolves cwd from a pinned path or the live conversation", () => {
		expect(resolveWorkspaceCwd({ kind: "path", path: "/apps/web" }, "/repo")).toBe("/apps/web");
		expect(resolveWorkspaceCwd(CONVERSATION_WORKSPACE, "/repo")).toBe("/repo");
		expect(resolveWorkspaceCwd(CONVERSATION_WORKSPACE, null)).toBeNull();
	});

	it("round-trips the project select value and keeps extra picked folders out of the workbench list", () => {
		expect(workspaceSelectValue({ kind: "path", path: "/apps/web" })).toBe("path:/apps/web");
		expect(parseWorkspaceSelectValue("path:/apps/web")).toEqual({ kind: "path", path: "/apps/web" });
		expect(parseWorkspaceSelectValue("conversation")).toEqual(CONVERSATION_WORKSPACE);
		expect(extraWorkspacePath({ kind: "path", path: "/apps/web" }, ["/apps/web"])).toBeNull();
		expect(extraWorkspacePath({ kind: "path", path: "/picked" }, ["/apps/web"])).toBe("/picked");
		expect(pathBasename("/apps/web")).toBe("web");
	});

	it("hides issues from other repositories once a repo is selected", () => {
		const manual: GithubTask = {
			id: "manual",
			title: "manual",
			promptText: "manual",
			source: { kind: "manual" },
			status: "pending",
			createdAt: 1,
			updatedAt: 1,
		};
		const tasks = [issueTask("acme", "app", "Fix login"), issueTask("acme", "web", "Ship web"), manual];
		expect(tasksVisibleForBoard(tasks, null, "/repo").map((task) => task.title)).toEqual([
			"Fix login",
			"Ship web",
			"manual",
		]);
		expect(tasksVisibleForBoard(tasks, { owner: "acme", repo: "web" }, "/repo").map((task) => task.title)).toEqual([
			"Ship web",
			"manual",
		]);
	});

	it("shows manual tasks for the current directory and always shows legacy tasks without cwd", () => {
		const legacy: GithubTask = {
			id: "legacy",
			title: "legacy",
			promptText: "legacy",
			source: { kind: "manual" },
			status: "pending",
			createdAt: 1,
			updatedAt: 1,
		};
		const webFix: GithubTask = {
			id: "web",
			title: "本地修复",
			promptText: "本地修复",
			source: { kind: "manual", cwd: "/apps/web" },
			status: "pending",
			createdAt: 1,
			updatedAt: 1,
		};
		const repoFix: GithubTask = {
			id: "repo",
			title: "repo fix",
			promptText: "repo fix",
			source: { kind: "manual", cwd: "/repo" },
			status: "pending",
			createdAt: 1,
			updatedAt: 1,
		};
		const tasks = [legacy, webFix, repoFix];
		expect(tasksVisibleForBoard(tasks, null, "/apps/web").map((task) => task.title)).toEqual(["legacy", "本地修复"]);
		expect(tasksVisibleForBoard(tasks, null, "/repo").map((task) => task.title)).toEqual(["legacy", "repo fix"]);
		expect(tasksVisibleForBoard(tasks, null, null).map((task) => task.title)).toEqual(["legacy"]);
	});

	it("hides closed issues without a session and keeps those with a conversation", () => {
		const closedNoSession: GithubTask = {
			...issueTask("acme", "app", "Closed leftover"),
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 2,
				issueUrl: "https://github.com/acme/app/issues/2",
				issueUpdatedAt: "2026-01-01T00:00:00Z",
				issueState: "closed",
			},
		};
		const closedWithSession: GithubTask = {
			...issueTask("acme", "app", "Closed with session"),
			source: {
				kind: "issue",
				owner: "acme",
				repo: "app",
				issueNumber: 3,
				issueUrl: "https://github.com/acme/app/issues/3",
				issueUpdatedAt: "2026-01-01T00:00:00Z",
				issueState: "closed",
			},
			status: "completed",
			sessionId: "sess-1",
		};
		const tasks = [issueTask("acme", "app", "Still open"), closedNoSession, closedWithSession];
		expect(
			tasksVisibleForBoard(tasks, { owner: "acme", repo: "app" }, "/repo").map((task) => task.title),
		).toEqual(["Still open", "Closed with session"]);
	});
});

describe("filterBoardTasks", () => {
	function numbered(title: string, issueNumber: number, extra: Omit<Partial<GithubTask>, "source"> = {}): GithubTask {
		const base = issueTask("acme", "app", title);
		if (base.source.kind !== "issue") throw new Error("expected issue source");
		return {
			...base,
			...extra,
			id: title,
			source: { ...base.source, issueNumber },
		};
	}

	const login = numbered("Fix login", 10, { labels: ["bug"] });
	const docs = numbered("Add docs", 12, { labels: ["docs"], status: "failed" });
	const manual: GithubTask = {
		id: "manual",
		title: "Local fix",
		promptText: "Local fix\nmore detail",
		source: { kind: "manual" },
		status: "pending",
		createdAt: 1,
		updatedAt: 1,
	};

	it("keeps only the issue whose number matches a #query", () => {
		expect(
			filterBoardTasks([login, docs, manual], { query: "#12", status: "all", label: "all" }).map(
				(task) => task.title,
			),
		).toEqual(["Add docs"]);
	});

	it("keeps only failed tasks when status is failed", () => {
		expect(
			filterBoardTasks([login, docs, manual], { query: "", status: "failed", label: "all" }).map(
				(task) => task.title,
			),
		).toEqual(["Add docs"]);
	});

	it("keeps only issues with the selected label", () => {
		expect(
			filterBoardTasks([login, docs, manual], { query: "", status: "all", label: "bug" }).map((task) => task.title),
		).toEqual(["Fix login"]);
	});

	it("applies query, status and label together", () => {
		expect(
			filterBoardTasks([login, docs, numbered("Fix login later", 10, { labels: ["bug"], status: "failed" })], {
				query: "login",
				status: "failed",
				label: "bug",
			}).map((task) => task.title),
		).toEqual(["Fix login later"]);
	});

	it("treats a whitespace-only query as no search", () => {
		expect(
			filterBoardTasks([login, docs], { query: "   ", status: "all", label: "all" }).map((task) => task.title),
		).toEqual(["Fix login", "Add docs"]);
	});
});

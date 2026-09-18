import { describe, expect, it } from "vitest";
import type { GithubTask } from "../src/state";
import {
	CONVERSATION_WORKSPACE,
	extraWorkspacePath,
	parseWorkspaceSelectValue,
	parseWorkspaceSource,
	pathBasename,
	resolveWorkspaceCwd,
	tasksVisibleForRepo,
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
		expect(tasksVisibleForRepo(tasks, null).map((task) => task.title)).toEqual([
			"Fix login",
			"Ship web",
			"manual",
		]);
		expect(tasksVisibleForRepo(tasks, { owner: "acme", repo: "web" }).map((task) => task.title)).toEqual([
			"Ship web",
			"manual",
		]);
	});
});

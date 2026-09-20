import { describe, expect, it, vi } from "vitest";
import type { PluginCommandApi, PluginNetworkApi } from "@vetta-org/plugin-sdk";
import {
	fetchIssueComments,
	fetchOpenGithubIssues,
	githubIssueCommentsApiPath,
	githubIssueCommentsUrl,
	githubOpenIssuesApiPath,
	githubOpenIssuesUrl,
	ISSUE_COMMIT_INSTRUCTION,
	ISSUE_PROMPT_MAX_CHARS,
	mapGhApiError,
	mapGithubFetchError,
	mapGithubIssueItems,
} from "../src/github-issues";

const NOW = 1_700_000_000_000;
const COMMIT = "When you finish, commit locally. Do not push.";

function issueJson(overrides: Record<string, unknown> = {}) {
	return {
		number: 10,
		title: "Fix login",
		html_url: "https://github.com/acme/app/issues/10",
		body: "The button does nothing.",
		updated_at: "2026-01-02T03:04:05Z",
		...overrides,
	};
}

describe("mapGithubIssueItems", () => {
	it("drops pull requests and maps open issues to pending tasks", () => {
		const tasks = mapGithubIssueItems(
			[
				issueJson(),
				issueJson({
					number: 11,
					title: "Add feature",
					html_url: "https://github.com/acme/app/pull/11",
					pull_request: { url: "https://api.github.com/repos/acme/app/pulls/11" },
				}),
			],
			{
				owner: "acme",
				repo: "app",
				now: NOW,
				createId: (() => {
					let n = 0;
					return () => `id-${++n}`;
				})(),
				commitInstruction: COMMIT,
			},
		);

		expect(tasks).toEqual([
			{
				id: "id-1",
				title: "Fix login",
				promptText: expect.stringContaining("Fix login") as unknown as string,
				source: {
					kind: "issue",
					owner: "acme",
					repo: "app",
					issueNumber: 10,
					issueUrl: "https://github.com/acme/app/issues/10",
					issueUpdatedAt: "2026-01-02T03:04:05Z",
					issueState: "open",
				},
				status: "pending",
				createdAt: NOW,
				updatedAt: NOW,
				labels: [],
				assignees: [],
				body: "The button does nothing.",
			},
		]);
		expect(tasks[0]?.promptText).toContain("https://github.com/acme/app/issues/10");
		expect(tasks[0]?.promptText).toContain("The button does nothing.");
		expect(tasks[0]?.promptText).toContain(COMMIT);
	});

	it("keeps title, link and commit instruction when truncating a long description", () => {
		const body = "x".repeat(8000);
		const [task] = mapGithubIssueItems([issueJson({ body })], {
			owner: "acme",
			repo: "app",
			now: NOW,
			createId: () => "id-1",
			commitInstruction: ISSUE_COMMIT_INSTRUCTION,
		});

		expect(task).toBeDefined();
		expect(task?.promptText.length).toBeLessThanOrEqual(ISSUE_PROMPT_MAX_CHARS);
		expect(task?.promptText.startsWith("Fix login")).toBe(true);
		expect(task?.promptText).toContain("https://github.com/acme/app/issues/10");
		expect(task?.promptText).toContain(ISSUE_COMMIT_INSTRUCTION);
		expect(task?.promptText.includes(body)).toBe(false);
	});

	it("maps label names and assignee logins onto the task", () => {
		const [task] = mapGithubIssueItems(
			[
				issueJson({
					labels: [{ name: "bug" }, "docs", { name: "bug" }, { name: "" }, 12],
					assignees: [{ login: "alice" }, { login: "bob" }, { login: "alice" }, { name: "skip" }],
				}),
			],
			{
				owner: "acme",
				repo: "app",
				now: NOW,
				createId: () => "id-1",
				commitInstruction: COMMIT,
			},
		);
		expect(task?.labels).toEqual(["bug", "docs"]);
		expect(task?.assignees).toEqual(["alice", "bob"]);
		expect(task?.body).toBe("The button does nothing.");
	});

	it("does not enqueue a closed issue from the payload", () => {
		const tasks = mapGithubIssueItems([issueJson({ state: "closed" })], {
			owner: "acme",
			repo: "app",
			now: NOW,
			createId: () => "id-1",
			commitInstruction: COMMIT,
		});
		expect(tasks).toEqual([]);
	});
});

describe("mapGithubFetchError", () => {
	it("maps 403 with exhausted rate limit, 404, and non-JSON error bodies", () => {
		expect(
			mapGithubFetchError({
				ok: false,
				status: 403,
				headers: { "x-ratelimit-remaining": "0" },
				body: { message: "API rate limit exceeded" },
			}),
		).toBe("rate-limit");
		expect(
			mapGithubFetchError({
				ok: false,
				status: 404,
				headers: {},
				body: { message: "Not Found" },
			}),
		).toBe("not-found");
		expect(
			mapGithubFetchError({
				ok: false,
				status: 502,
				headers: {},
				body: "<html>Bad Gateway</html>",
			}),
		).toBe("non-json");
	});
});

describe("mapGhApiError", () => {
	it("maps gh HTTP failures, and treats missing login as unavailable", () => {
		expect(mapGhApiError("", "gh: HTTP 404")).toBe("not-found");
		expect(mapGhApiError('{"message":"API rate limit exceeded"}', "")).toBe("rate-limit");
		expect(mapGhApiError("", "gh: To get started with GitHub CLI, please run: `gh auth login`")).toBe(
			"unavailable",
		);
	});
});

describe("fetchOpenGithubIssues", () => {
	const issue = issueJson();

	it("uses the local gh login instead of the unauthenticated API", async () => {
		const network = { request: vi.fn() } as unknown as PluginNetworkApi;
		const command = {
			run: vi.fn(async () => ({
				stdout: JSON.stringify([issue]),
				stderr: "",
				exitCode: 0,
			})),
		} as unknown as PluginCommandApi;

		await expect(fetchOpenGithubIssues(network, "acme", "app", command)).resolves.toEqual({
			items: [issue],
		});
		expect(network.request).not.toHaveBeenCalled();
		expect(command.run).toHaveBeenCalledWith(
			"gh",
			["api", "repos/acme/app/issues?state=open&per_page=100"],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
	});

	it("falls back to the unauthenticated API when gh is missing or not logged in", async () => {
		const network = {
			request: vi.fn(async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				headers: {},
				body: [issue],
			})),
		} as unknown as PluginNetworkApi;
		const missing = {
			run: vi.fn(async () => {
				throw new Error("Command failed to start: gh (ENOENT)");
			}),
		} as unknown as PluginCommandApi;

		await expect(fetchOpenGithubIssues(network, "acme", "app", missing)).resolves.toEqual({
			items: [issue],
		});

		const loggedOut = {
			run: vi.fn(async () => ({
				stdout: "",
				stderr: "gh: To get started with GitHub CLI, please run: `gh auth login`",
				exitCode: 1,
			})),
		} as unknown as PluginCommandApi;
		await expect(fetchOpenGithubIssues(network, "acme", "app", loggedOut)).resolves.toEqual({
			items: [issue],
		});
		expect(network.request).toHaveBeenCalledTimes(2);
	});

	it("returns a structured error when gh exits with an unreadable body", async () => {
		const network = { request: vi.fn() } as unknown as PluginNetworkApi;
		const command = {
			run: vi.fn(async () => ({
				stdout: "unknown shorthand flag: 'F' in -F",
				stderr: "",
				exitCode: 1,
			})),
		} as unknown as PluginCommandApi;

		await expect(fetchOpenGithubIssues(network, "acme", "app", command)).resolves.toEqual({
			error: "non-json",
		});
		expect(network.request).not.toHaveBeenCalled();
	});

	it("requests the second page through gh and the unauthenticated URL", async () => {
		expect(githubOpenIssuesUrl("acme", "app")).toBe(
			"https://api.github.com/repos/acme/app/issues?state=open&per_page=100",
		);
		expect(githubOpenIssuesUrl("acme", "app", 2)).toBe(
			"https://api.github.com/repos/acme/app/issues?state=open&per_page=100&page=2",
		);
		expect(githubOpenIssuesApiPath("acme", "app", 2)).toBe(
			"repos/acme/app/issues?state=open&per_page=100&page=2",
		);

		const network = {
			request: vi.fn(async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				headers: {},
				body: [issue],
			})),
		} as unknown as PluginNetworkApi;
		const command = {
			run: vi.fn(async () => ({
				stdout: JSON.stringify([issue]),
				stderr: "",
				exitCode: 0,
			})),
		} as unknown as PluginCommandApi;

		await expect(fetchOpenGithubIssues(network, "acme", "app", command, 2)).resolves.toEqual({
			items: [issue],
		});
		expect(command.run).toHaveBeenCalledWith(
			"gh",
			["api", "repos/acme/app/issues?state=open&per_page=100&page=2"],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
		expect(network.request).not.toHaveBeenCalled();
	});

	it("puts assignee=@me on the gh api path when fetching assigned issues", async () => {
		const network = { request: vi.fn() } as unknown as PluginNetworkApi;
		const command = {
			run: vi.fn(async () => ({
				stdout: JSON.stringify([issue]),
				stderr: "",
				exitCode: 0,
			})),
		} as unknown as PluginCommandApi;

		await expect(
			fetchOpenGithubIssues(network, "acme", "app", command, 1, { assignee: "me", label: null }),
		).resolves.toEqual({ items: [issue] });
		expect(command.run).toHaveBeenCalledWith(
			"gh",
			["api", "repos/acme/app/issues?state=open&per_page=100&assignee=@me"],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
		expect(githubOpenIssuesApiPath("acme", "app", 1, { assignee: "me", label: null })).toContain("assignee=@me");
		expect(network.request).not.toHaveBeenCalled();
	});

	it("url-encodes a single label on both the gh path and the public URL", async () => {
		const filter = { assignee: "any" as const, label: "needs:help" };
		expect(githubOpenIssuesApiPath("acme", "app", 1, filter)).toBe(
			"repos/acme/app/issues?state=open&per_page=100&labels=needs%3Ahelp",
		);
		expect(githubOpenIssuesUrl("acme", "app", 1, filter)).toBe(
			"https://api.github.com/repos/acme/app/issues?state=open&per_page=100&labels=needs%3Ahelp",
		);

		const network = { request: vi.fn() } as unknown as PluginNetworkApi;
		const command = {
			run: vi.fn(async () => ({
				stdout: JSON.stringify([issue]),
				stderr: "",
				exitCode: 0,
			})),
		} as unknown as PluginCommandApi;
		await fetchOpenGithubIssues(network, "acme", "app", command, 2, filter);
		expect(command.run).toHaveBeenCalledWith(
			"gh",
			["api", "repos/acme/app/issues?state=open&per_page=100&page=2&labels=needs%3Ahelp"],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
	});

	it("returns a structured error and skips api.github.com when unauthenticated fetch is assigned to me", async () => {
		const network = { request: vi.fn() } as unknown as PluginNetworkApi;
		const missing = {
			run: vi.fn(async () => {
				throw new Error("Command failed to start: gh (ENOENT)");
			}),
		} as unknown as PluginCommandApi;
		const loggedOut = {
			run: vi.fn(async () => ({
				stdout: "",
				stderr: "gh: To get started with GitHub CLI, please run: `gh auth login`",
				exitCode: 1,
			})),
		} as unknown as PluginCommandApi;

		await expect(
			fetchOpenGithubIssues(network, "acme", "app", missing, 1, { assignee: "me", label: "bug" }),
		).resolves.toEqual({ error: "assignee-needs-gh" });
		await expect(
			fetchOpenGithubIssues(network, "acme", "app", loggedOut, 1, { assignee: "me", label: null }),
		).resolves.toEqual({ error: "assignee-needs-gh" });
		expect(network.request).not.toHaveBeenCalled();
	});
});

describe("fetchIssueComments", () => {
	const comment = {
		id: 99,
		body: "Looks good.",
		created_at: "2026-01-04T00:00:00Z",
		user: { login: "bob" },
	};

	it("uses the local gh login instead of the unauthenticated API", async () => {
		const network = { request: vi.fn() } as unknown as PluginNetworkApi;
		const command = {
			run: vi.fn(async () => ({
				stdout: JSON.stringify([comment]),
				stderr: "",
				exitCode: 0,
			})),
		} as unknown as PluginCommandApi;

		await expect(fetchIssueComments(network, "acme", "app", 10, command)).resolves.toEqual({
			items: [{ id: 99, login: "bob", body: "Looks good.", createdAt: "2026-01-04T00:00:00Z" }],
		});
		expect(network.request).not.toHaveBeenCalled();
		expect(command.run).toHaveBeenCalledWith("gh", ["api", githubIssueCommentsApiPath("acme", "app", 10)], {
			timeoutMs: 20_000,
			env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
		});
	});

	it("falls back to the unauthenticated comments URL when gh is missing", async () => {
		const network = {
			request: vi.fn(async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				headers: {},
				body: [comment],
			})),
		} as unknown as PluginNetworkApi;
		const missing = {
			run: vi.fn(async () => {
				throw new Error("Command failed to start: gh (ENOENT)");
			}),
		} as unknown as PluginCommandApi;

		await expect(fetchIssueComments(network, "acme", "app", 10, missing)).resolves.toEqual({
			items: [{ id: 99, login: "bob", body: "Looks good.", createdAt: "2026-01-04T00:00:00Z" }],
		});
		expect(network.request).toHaveBeenCalledWith({
			url: githubIssueCommentsUrl("acme", "app", 10),
			method: "GET",
		});
	});
});

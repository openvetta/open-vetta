import { describe, expect, it } from "vitest";
import {
	ISSUE_COMMIT_INSTRUCTION,
	ISSUE_PROMPT_MAX_CHARS,
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
				},
				status: "pending",
				createdAt: NOW,
				updatedAt: NOW,
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

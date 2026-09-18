import type { PluginCommandApi, PluginNetworkApi, PluginNetworkResponse } from "@vetta-org/plugin-sdk";
import type { GithubTask } from "./state";

export const ISSUE_PROMPT_MAX_CHARS = 4000;

export const ISSUE_COMMIT_INSTRUCTION =
	"When you finish, commit the changes locally. Do not push and do not open a pull request.";

export type GithubFetchErrorKind = "rate-limit" | "not-found" | "non-json";

export interface MapGithubIssueItemsInput {
	owner: string;
	repo: string;
	now: number;
	createId: () => string;
	commitInstruction: string;
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
	const needle = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === needle) return value;
	}
	return undefined;
}

function clipPrompt(title: string, url: string, body: string, commitInstruction: string): string {
	const prefix = `${title}\n${url}\n\n`;
	const suffix = `\n\n${commitInstruction}`;
	const budget = ISSUE_PROMPT_MAX_CHARS - prefix.length - suffix.length;
	if (budget <= 0) {
		return `${title}\n${url}\n\n${commitInstruction}`.slice(0, ISSUE_PROMPT_MAX_CHARS);
	}
	const clipped = body.length > budget ? body.slice(0, budget) : body;
	return `${prefix}${clipped}${suffix}`;
}

function parseIssueItem(value: unknown): {
	number: number;
	title: string;
	html_url: string;
	body: string;
	updated_at: string;
	isPullRequest: boolean;
} | null {
	if (typeof value !== "object" || value === null) return null;
	if (!("number" in value) || typeof value.number !== "number") return null;
	if (!("title" in value) || typeof value.title !== "string") return null;
	if (!("html_url" in value) || typeof value.html_url !== "string") return null;
	if (!("updated_at" in value) || typeof value.updated_at !== "string") return null;
	const body = !("body" in value) || value.body == null ? "" : typeof value.body === "string" ? value.body : null;
	if (body === null) return null;
	return {
		number: value.number,
		title: value.title,
		html_url: value.html_url,
		body,
		updated_at: value.updated_at,
		isPullRequest: "pull_request" in value,
	};
}

export function githubOpenIssuesUrl(owner: string, repo: string): string {
	const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	return `https://api.github.com/repos/${repoPath}/issues?state=open&per_page=30`;
}

export function mapGithubFetchError(
	response: Pick<PluginNetworkResponse, "ok" | "status" | "headers" | "body">,
): GithubFetchErrorKind | null {
	if (response.ok) return null;
	if (response.status === 404) return "not-found";
	if (response.status === 403 && headerValue(response.headers, "x-ratelimit-remaining") === "0") {
		return "rate-limit";
	}
	return "non-json";
}

export function mapGithubIssueItems(items: unknown, input: MapGithubIssueItemsInput): GithubTask[] {
	if (!Array.isArray(items)) return [];
	const tasks: GithubTask[] = [];
	for (const item of items) {
		const parsed = parseIssueItem(item);
		if (!parsed || parsed.isPullRequest) continue;
		tasks.push({
			id: input.createId(),
			title: parsed.title,
			promptText: clipPrompt(parsed.title, parsed.html_url, parsed.body, input.commitInstruction),
			source: {
				kind: "issue",
				owner: input.owner,
				repo: input.repo,
				issueNumber: parsed.number,
				issueUrl: parsed.html_url,
				issueUpdatedAt: parsed.updated_at,
			},
			status: "pending",
			createdAt: input.now,
			updatedAt: input.now,
		});
	}
	return tasks;
}

const GITHUB_NAME = /^[A-Za-z0-9._-]+$/;

export function isGithubRepoName(value: string): boolean {
	return GITHUB_NAME.test(value);
}

export function githubFetchError(result: unknown): GithubFetchErrorKind | null {
	if (result === "rate-limit" || result === "not-found" || result === "non-json") return result;
	if (typeof result !== "object" || result === null || !("error" in result)) return null;
	const error = result.error;
	return error === "rate-limit" || error === "not-found" || error === "non-json" ? error : "non-json";
}

export async function fetchOpenGithubIssues(
	network: PluginNetworkApi,
	owner: string,
	repo: string,
	command?: PluginCommandApi,
): Promise<{ items: unknown[] } | { error: GithubFetchErrorKind }> {
	if (!isGithubRepoName(owner) || !isGithubRepoName(repo)) return { error: "not-found" };
	if (command) {
		const viaGh = await fetchOpenGithubIssuesWithGh(command, owner, repo);
		if (viaGh !== "unavailable") return viaGh;
	}
	return fetchOpenGithubIssuesUnauthenticated(network, owner, repo);
}

async function fetchOpenGithubIssuesWithGh(
	command: PluginCommandApi,
	owner: string,
	repo: string,
): Promise<{ items: unknown[] } | { error: GithubFetchErrorKind } | "unavailable"> {
	try {
		const result = await command.run(
			"gh",
			["api", `repos/${owner}/${repo}/issues?state=open&per_page=30`],
			{
				timeoutMs: 20_000,
				env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
			},
		);
		if (result.exitCode === 0) {
			try {
				const body: unknown = JSON.parse(result.stdout);
				return Array.isArray(body) ? { items: body } : { error: "non-json" };
			} catch {
				return { error: "non-json" };
			}
		}
		const mapped = mapGhApiError(result.stdout, result.stderr);
		return mapped === "unavailable" ? "unavailable" : { error: mapped };
	} catch {
		return "unavailable";
	}
}

export function mapGhApiError(stdout: string, stderr: string): GithubFetchErrorKind | "unavailable" {
	const text = `${stdout}\n${stderr}`;
	if (/rate limit/i.test(text)) return "rate-limit";
	if (/HTTP 404|\bNot Found\b/i.test(text)) return "not-found";
	if (/HTTP 401|auth login|not logged|Bad credentials|Requires authentication/i.test(text)) {
		return "unavailable";
	}
	try {
		const body: unknown = JSON.parse(stdout);
		if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
			if (/rate limit/i.test(body.message)) return "rate-limit";
			if (body.message === "Not Found") return "not-found";
			if (/Bad credentials|Requires authentication/i.test(body.message)) return "unavailable";
		}
	} catch {
		// Fall through to the generic mapping below.
	}
	return "non-json";
}

async function fetchOpenGithubIssuesUnauthenticated(
	network: PluginNetworkApi,
	owner: string,
	repo: string,
): Promise<{ items: unknown[] } | { error: GithubFetchErrorKind }> {
	try {
		const response = await network.request<unknown>({
			url: githubOpenIssuesUrl(owner, repo),
			method: "GET",
		});
		const error = mapGithubFetchError(response);
		if (error) return { error };
		if (!Array.isArray(response.body)) return { error: "non-json" };
		return { items: response.body };
	} catch {
		return { error: "non-json" };
	}
}

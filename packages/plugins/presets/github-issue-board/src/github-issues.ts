import type { PluginCommandApi, PluginNetworkApi, PluginNetworkResponse } from "@vetta-org/plugin-sdk";
import type { GithubIssueState, GithubTask } from "./state";

export const ISSUE_PROMPT_MAX_CHARS = 4000;
export const ISSUE_PAGE_SIZE = 100;

export const ISSUE_COMMIT_INSTRUCTION =
	"When you finish, commit the changes locally. Do not push and do not open a pull request.";

export type GithubFetchErrorKind = "rate-limit" | "not-found" | "non-json";

export interface GithubIssueComment {
	id: number;
	login: string;
	body: string;
	createdAt: string;
}

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

function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		if (seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}
	return result;
}

function parseLabelNames(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const names: string[] = [];
	for (const item of value) {
		if (typeof item === "string") {
			const name = item.trim();
			if (name) names.push(name);
			continue;
		}
		if (typeof item === "object" && item !== null && "name" in item && typeof item.name === "string") {
			const name = item.name.trim();
			if (name) names.push(name);
		}
	}
	return uniqueStrings(names);
}

function parseAssigneeLogins(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const logins: string[] = [];
	for (const item of value) {
		if (typeof item !== "object" || item === null) continue;
		if (!("login" in item) || typeof item.login !== "string" || !item.login) continue;
		logins.push(item.login);
	}
	return uniqueStrings(logins);
}

function parseIssueItem(value: unknown): {
	number: number;
	title: string;
	html_url: string;
	body: string;
	updated_at: string;
	labels: string[];
	assignees: string[];
	issueState: GithubIssueState;
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
		labels: "labels" in value ? parseLabelNames(value.labels) : [],
		assignees: "assignees" in value ? parseAssigneeLogins(value.assignees) : [],
		issueState: "state" in value && value.state === "closed" ? "closed" : "open",
		isPullRequest: "pull_request" in value,
	};
}

export function normalizeIssuePage(page: number): number {
	return Number.isInteger(page) && page >= 1 ? page : 1;
}

function githubOpenIssuesQuery(page = 1): string {
	const normalized = normalizeIssuePage(page);
	return normalized <= 1
		? `state=open&per_page=${ISSUE_PAGE_SIZE}`
		: `state=open&per_page=${ISSUE_PAGE_SIZE}&page=${normalized}`;
}

export function githubOpenIssuesUrl(owner: string, repo: string, page = 1): string {
	const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	return `https://api.github.com/repos/${repoPath}/issues?${githubOpenIssuesQuery(page)}`;
}

export function githubOpenIssuesApiPath(owner: string, repo: string, page = 1): string {
	return `repos/${owner}/${repo}/issues?${githubOpenIssuesQuery(page)}`;
}

export function githubIssueCommentsUrl(owner: string, repo: string, issueNumber: number): string {
	const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	return `https://api.github.com/repos/${repoPath}/issues/${issueNumber}/comments?per_page=30`;
}

export function githubIssueCommentsApiPath(owner: string, repo: string, issueNumber: number): string {
	return `repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=30`;
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
		if (!parsed || parsed.isPullRequest || parsed.issueState === "closed") continue;
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
				issueState: parsed.issueState,
			},
			status: "pending",
			createdAt: input.now,
			updatedAt: input.now,
			labels: parsed.labels,
			assignees: parsed.assignees,
			body: parsed.body,
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

async function fetchGithubJsonArrayWithGh(
	command: PluginCommandApi,
	apiPath: string,
): Promise<{ items: unknown[] } | { error: GithubFetchErrorKind } | "unavailable"> {
	try {
		const result = await command.run("gh", ["api", apiPath], {
			timeoutMs: 20_000,
			env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
		});
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

async function fetchGithubJsonArrayUnauthenticated(
	network: PluginNetworkApi,
	url: string,
): Promise<{ items: unknown[] } | { error: GithubFetchErrorKind }> {
	try {
		const response = await network.request<unknown>({
			url,
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

export async function fetchOpenGithubIssues(
	network: PluginNetworkApi,
	owner: string,
	repo: string,
	command?: PluginCommandApi,
	page = 1,
): Promise<{ items: unknown[] } | { error: GithubFetchErrorKind }> {
	if (!isGithubRepoName(owner) || !isGithubRepoName(repo)) return { error: "not-found" };
	const normalizedPage = normalizeIssuePage(page);
	if (command) {
		const viaGh = await fetchGithubJsonArrayWithGh(command, githubOpenIssuesApiPath(owner, repo, normalizedPage));
		if (viaGh !== "unavailable") return viaGh;
	}
	return fetchGithubJsonArrayUnauthenticated(network, githubOpenIssuesUrl(owner, repo, normalizedPage));
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

function parseCommentItem(value: unknown): GithubIssueComment | null {
	if (typeof value !== "object" || value === null) return null;
	if (!("id" in value) || typeof value.id !== "number") return null;
	const body = "body" in value && typeof value.body === "string" ? value.body : "";
	const createdAt = "created_at" in value && typeof value.created_at === "string" ? value.created_at : "";
	let login = "";
	if (
		"user" in value &&
		typeof value.user === "object" &&
		value.user !== null &&
		"login" in value.user &&
		typeof value.user.login === "string"
	) {
		login = value.user.login;
	}
	return { id: value.id, login, body, createdAt };
}

export async function fetchIssueComments(
	network: PluginNetworkApi,
	owner: string,
	repo: string,
	issueNumber: number,
	command?: PluginCommandApi,
): Promise<{ items: GithubIssueComment[] } | { error: GithubFetchErrorKind }> {
	if (!isGithubRepoName(owner) || !isGithubRepoName(repo)) return { error: "not-found" };
	let raw: { items: unknown[] } | { error: GithubFetchErrorKind };
	if (command) {
		const viaGh = await fetchGithubJsonArrayWithGh(command, githubIssueCommentsApiPath(owner, repo, issueNumber));
		if (viaGh !== "unavailable") {
			raw = viaGh;
		} else {
			raw = await fetchGithubJsonArrayUnauthenticated(network, githubIssueCommentsUrl(owner, repo, issueNumber));
		}
	} else {
		raw = await fetchGithubJsonArrayUnauthenticated(network, githubIssueCommentsUrl(owner, repo, issueNumber));
	}
	if ("error" in raw) return raw;
	return {
		items: raw.items.flatMap((item) => {
			const parsed = parseCommentItem(item);
			return parsed ? [parsed] : [];
		}),
	};
}

import type { PluginCommandApi } from "@vetta-org/plugin-sdk";

export interface GithubRepoTarget {
	owner: string;
	repo: string;
}

export type ResolveGithubRepoError = "no-project" | "not-git" | "no-github-remote";

const REMOTE_LINE = /^(\S+)\s+(\S+)/;
const GITHUB_URL =
	/(?:git@|https?:\/\/|git:\/\/|ssh:\/\/(?:[^@/\s]+@)?)(?:www\.)?github\.com[:/]+([^/\s]+)\/([^/\s]+)/i;

export function parseGithubRepoFromGitRemotes(stdout: string): GithubRepoTarget | null {
	const parsed: { name: string; target: GithubRepoTarget }[] = [];
	for (const raw of stdout.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const match = REMOTE_LINE.exec(line);
		if (!match) continue;
		const name = match[1];
		const url = match[2];
		if (!name || !url) continue;
		const target = parseGithubRemoteUrl(url);
		if (target) parsed.push({ name, target });
	}
	const origin = parsed.find((remote) => remote.name === "origin");
	return origin?.target ?? parsed[0]?.target ?? null;
}

export async function resolveGithubRepoFromProject(input: {
	command: PluginCommandApi;
	cwd: string | null | undefined;
}): Promise<{ ok: true; target: GithubRepoTarget } | { ok: false; error: ResolveGithubRepoError }> {
	const cwd = input.cwd?.trim() ?? "";
	if (!cwd) return { ok: false, error: "no-project" };
	try {
		const result = await input.command.run("git", ["remote", "-v"], { cwd, timeoutMs: 8_000 });
		if (result.exitCode !== 0) return { ok: false, error: "not-git" };
		const target = parseGithubRepoFromGitRemotes(result.stdout);
		if (!target) return { ok: false, error: "no-github-remote" };
		return { ok: true, target };
	} catch {
		return { ok: false, error: "not-git" };
	}
}

function parseGithubRemoteUrl(url: string): GithubRepoTarget | null {
	const match = GITHUB_URL.exec(url);
	const owner = match?.[1];
	const repoName = match?.[2]?.replace(/\.git$/i, "").replace(/\/+$/, "");
	if (!owner || !repoName) return null;
	return { owner, repo: repoName };
}

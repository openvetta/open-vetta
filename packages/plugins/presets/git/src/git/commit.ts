import type { PluginAiApi, PluginCommandRunResult } from "@vetta-org/plugin-sdk";
import { buildCommitGenerationRequest, sanitizeCommitMessage } from "./commit-message";
import { getGitCommand } from "./runtime";
import type { ChangeEntry } from "./types";

function git(cwd: string, args: string[], timeoutMs?: number): Promise<PluginCommandRunResult> {
	return getGitCommand().run("git", args, timeoutMs === undefined ? { cwd } : { cwd, timeoutMs });
}

async function runGit(root: string, args: string[]): Promise<void> {
	const res = await git(root, args, 60_000);
	if (res.exitCode !== 0) throw new Error(res.stderr.trim() || `git ${args[0]} failed (exit ${res.exitCode})`);
}

/** Unified diff of uncommitted work: tracked vs HEAD, plus untracked files as additions. */
export async function workingTreeDiff(root: string): Promise<string> {
	const parts: string[] = [];
	const head = await git(root, ["diff", "HEAD"]);
	if (head.exitCode === 0 || head.exitCode === 1) {
		if (head.stdout) parts.push(head.stdout);
	} else {
		const cached = await git(root, ["diff", "--cached"]);
		const unstaged = await git(root, ["diff"]);
		if (cached.stdout) parts.push(cached.stdout);
		if (unstaged.stdout) parts.push(unstaged.stdout);
	}

	const others = await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
	const files = others.stdout.split("\0").filter(Boolean);
	for (const file of files) {
		const res = await git(root, ["diff", "--no-index", "--", "/dev/null", file]);
		if (res.stdout) parts.push(res.stdout);
	}
	return parts.join("\n");
}

async function recentCommitSubjects(root: string): Promise<string[]> {
	const res = await git(root, ["log", "-5", "--pretty=format:%s"]);
	if (res.exitCode !== 0 || !res.stdout.trim()) return [];
	return res.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

export async function generateCommitMessage(input: {
	root: string;
	entries: readonly ChangeEntry[];
	complete: PluginAiApi["complete"];
}): Promise<string | null> {
	const [diff, recentSubjects] = await Promise.all([workingTreeDiff(input.root), recentCommitSubjects(input.root)]);
	const request = buildCommitGenerationRequest({
		entries: input.entries,
		diff,
		recentSubjects,
	});
	const result = await input.complete(request);
	return sanitizeCommitMessage(result.text);
}

/** Stage every shown change (`git add -A`) and create a commit. */
export async function commitAllChanges(root: string, message: string): Promise<void> {
	const text = sanitizeCommitMessage(message);
	if (!text) throw new Error("empty commit message");
	await runGit(root, ["add", "-A"]);
	await runGit(root, ["commit", "-m", text]);
}

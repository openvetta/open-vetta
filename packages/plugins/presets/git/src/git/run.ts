import type { PluginCommandRunResult } from "@vetta/plugin-sdk";
import { getGitCommand } from "./runtime";
import type { ChangeEntry } from "./types";

function git(cwd: string, args: string[]): Promise<PluginCommandRunResult> {
	return getGitCommand().run("git", args, { cwd });
}

/** Resolve the working tree root for a directory, or null when it is not a repo. */
export async function resolveRepoRoot(cwd: string): Promise<string | null> {
	try {
		const res = await git(cwd, ["rev-parse", "--show-toplevel"]);
		if (res.exitCode === 0 && res.stdout.trim().length > 0) return res.stdout.trim();
		return null;
	} catch {
		return null;
	}
}

/** Raw `git status --porcelain=v2 -z` output (working tree + index + untracked). */
export async function statusPorcelain(root: string): Promise<string> {
	const res = await git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]);
	if (res.exitCode !== 0) {
		throw new Error(res.stderr.trim() || `git status failed (exit ${res.exitCode})`);
	}
	return res.stdout;
}

/** Initialize a repository at the given directory. */
export async function initRepo(cwd: string): Promise<void> {
	const res = await git(cwd, ["init"]);
	if (res.exitCode !== 0) {
		throw new Error(res.stderr.trim() || `git init failed (exit ${res.exitCode})`);
	}
}

/**
 * Unified diff text for one changed file: all uncommitted changes vs HEAD.
 * Untracked files are synthesized as an addition via `--no-index`.
 */
export async function fileDiff(root: string, entry: ChangeEntry): Promise<string> {
	if (entry.code === "U") {
		// --no-index: 0 = identical, 1 = differs (the normal case), >1 = real error.
		const res = await git(root, ["diff", "--no-index", "--", "/dev/null", entry.path]);
		if (res.exitCode !== 0 && res.exitCode !== 1) {
			throw new Error(res.stderr.trim() || `git diff failed (exit ${res.exitCode})`);
		}
		return res.stdout;
	}
	const head = await git(root, ["diff", "HEAD", "--", entry.path]);
	if (head.exitCode === 0 || head.exitCode === 1) return head.stdout;
	// No HEAD yet (repo without commits): combine staged + unstaged.
	const staged = await git(root, ["diff", "--cached", "--", entry.path]);
	if (staged.stdout.trim().length > 0) return staged.stdout;
	const unstaged = await git(root, ["diff", "--", entry.path]);
	return unstaged.stdout;
}

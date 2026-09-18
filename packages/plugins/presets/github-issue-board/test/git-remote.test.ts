import { describe, expect, it, vi } from "vitest";
import type { PluginCommandApi } from "@vetta-org/plugin-sdk";
import { parseGithubRepoFromGitRemotes, resolveGithubRepoFromProject } from "../src/git-remote";

describe("parseGithubRepoFromGitRemotes", () => {
	it("reads owner and repo from HTTPS, SSH, and git@ remotes", () => {
		expect(
			parseGithubRepoFromGitRemotes(
				"origin\thttps://github.com/acme/app.git (fetch)\norigin\thttps://github.com/acme/app.git (push)\n",
			),
		).toEqual({ owner: "acme", repo: "app" });
		expect(parseGithubRepoFromGitRemotes("origin\tgit@github.com:acme/app.git (fetch)\n")).toEqual({
			owner: "acme",
			repo: "app",
		});
		expect(parseGithubRepoFromGitRemotes("origin\tssh://git@github.com/acme/app.git (fetch)\n")).toEqual({
			owner: "acme",
			repo: "app",
		});
	});

	it("prefers origin when several remotes include GitHub", () => {
		expect(
			parseGithubRepoFromGitRemotes(
				[
					"upstream\thttps://github.com/openvetta/open-vetta.git (fetch)",
					"origin\tgit@github.com:qqzhangyanhua/open-vetta.git (fetch)",
				].join("\n"),
			),
		).toEqual({ owner: "qqzhangyanhua", repo: "open-vetta" });
	});

	it("returns null when no GitHub remote is present", () => {
		expect(parseGithubRepoFromGitRemotes("origin\tgit@gitlab.com:acme/app.git (fetch)\n")).toBeNull();
		expect(parseGithubRepoFromGitRemotes("")).toBeNull();
	});
});

describe("resolveGithubRepoFromProject", () => {
	it("asks the user to open a project when cwd is missing", async () => {
		const command = { run: vi.fn() } as unknown as PluginCommandApi;
		await expect(resolveGithubRepoFromProject({ command, cwd: null })).resolves.toEqual({
			ok: false,
			error: "no-project",
		});
		expect(command.run).not.toHaveBeenCalled();
	});

	it("reads the GitHub repo from git remote -v in the current project", async () => {
		const command = {
			run: vi.fn(async () => ({
				stdout: "origin\tgit@github.com:acme/app.git (fetch)\n",
				stderr: "",
				exitCode: 0,
			})),
		} as unknown as PluginCommandApi;

		await expect(resolveGithubRepoFromProject({ command, cwd: "/repo" })).resolves.toEqual({
			ok: true,
			target: { owner: "acme", repo: "app" },
		});
		expect(command.run).toHaveBeenCalledWith("git", ["remote", "-v"], { cwd: "/repo", timeoutMs: 8_000 });
	});

	it("reports a missing GitHub remote and a non-git directory", async () => {
		const noGithub = {
			run: vi.fn(async () => ({
				stdout: "origin\tgit@gitlab.com:acme/app.git (fetch)\n",
				stderr: "",
				exitCode: 0,
			})),
		} as unknown as PluginCommandApi;
		await expect(resolveGithubRepoFromProject({ command: noGithub, cwd: "/repo" })).resolves.toEqual({
			ok: false,
			error: "no-github-remote",
		});

		const notGit = {
			run: vi.fn(async () => ({
				stdout: "",
				stderr: "fatal: not a git repository",
				exitCode: 128,
			})),
		} as unknown as PluginCommandApi;
		await expect(resolveGithubRepoFromProject({ command: notGit, cwd: "/repo" })).resolves.toEqual({
			ok: false,
			error: "not-git",
		});
	});
});

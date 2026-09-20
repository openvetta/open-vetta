import type { PluginCommandApi, PluginCommandRunResult } from "@vetta-org/plugin-sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { commitAllChanges, generateCommitMessage, workingTreeDiff } from "../src/git/commit";
import { setGitCommand } from "../src/git/runtime";
import type { ChangeEntry } from "../src/git/types";

function ok(stdout = "", exitCode = 0): PluginCommandRunResult {
	return { stdout, stderr: "", exitCode };
}

function installCommand(handler: (args: string[]) => PluginCommandRunResult): string[][] {
	const calls: string[][] = [];
	const api: PluginCommandApi = {
		run: async (_file, args = []) => {
			calls.push(args);
			return handler(args);
		},
		spawn: async () => {
			throw new Error("spawn is unused");
		},
	};
	setGitCommand(api);
	return calls;
}

beforeEach(() => {
	installCommand(() => ok());
});

describe("workingTreeDiff", () => {
	it("uses git diff HEAD and appends untracked no-index diffs", async () => {
		installCommand((args) => {
			if (args[0] === "diff" && args[1] === "HEAD") return ok("DIFF-HEAD");
			if (args[0] === "ls-files") return ok("new.txt\0");
			if (args[0] === "diff" && args.includes("--no-index")) return ok("DIFF-NEW");
			return ok();
		});

		await expect(workingTreeDiff("/repo")).resolves.toBe("DIFF-HEAD\nDIFF-NEW");
	});

	it("falls back to staged plus unstaged when HEAD is missing", async () => {
		installCommand((args) => {
			if (args[0] === "diff" && args[1] === "HEAD") return ok("", 128);
			if (args[0] === "diff" && args[1] === "--cached") return ok("STAGED");
			if (args[0] === "diff" && args.length === 1) return ok("UNSTAGED");
			if (args[0] === "ls-files") return ok("");
			return ok();
		});

		await expect(workingTreeDiff("/repo")).resolves.toBe("STAGED\nUNSTAGED");
	});
});

describe("commitAllChanges", () => {
	it("stages every change then commits with the sanitized message", async () => {
		const calls = installCommand(() => ok());

		await commitAllChanges("/repo", "  feat: login  \n");

		expect(calls).toEqual([
			["add", "-A"],
			["commit", "-m", "feat: login"],
		]);
	});

	it("does not run git when the message is empty after sanitizing", async () => {
		const calls = installCommand(() => ok());

		await expect(commitAllChanges("/repo", "   ")).rejects.toThrow(/empty/i);
		expect(calls).toEqual([]);
	});

	it("surfaces a failed commit without trying to hide the hook error", async () => {
		installCommand((args) => {
			if (args[0] === "commit") return { stdout: "", stderr: "hook rejected", exitCode: 1 };
			return ok();
		});

		await expect(commitAllChanges("/repo", "feat: login")).rejects.toThrow("hook rejected");
	});
});

describe("generateCommitMessage", () => {
	const entries: ChangeEntry[] = [{ path: "src/login.ts", code: "M", staged: false }];

	it("asks the model with the working tree diff and returns a sanitized message", async () => {
		installCommand((args) => {
			if (args[0] === "diff" && args[1] === "HEAD") return ok("+fix the button");
			if (args[0] === "ls-files") return ok("");
			if (args[0] === "log") return ok("chore: setup");
			return ok();
		});

		const text = await generateCommitMessage({
			root: "/repo",
			entries,
			complete: async (request) => {
				expect(request.prompt).toContain("M src/login.ts");
				expect(request.prompt).toContain("+fix the button");
				expect(request.prompt).toContain("chore: setup");
				return {
					modelKey: "default",
					text: "```\nfix: login button\n```",
					stopReason: "stop",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				};
			},
		});

		expect(text).toBe("fix: login button");
	});

	it("returns null when the model output is not a usable commit message", async () => {
		installCommand(() => ok());

		const text = await generateCommitMessage({
			root: "/repo",
			entries,
			complete: async () => ({
				modelKey: "default",
				text: "```\n```",
				stopReason: "stop",
				usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			}),
		});

		expect(text).toBeNull();
	});
});

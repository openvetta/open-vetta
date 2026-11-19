import type { PluginCommandApi, PluginCommandRunResult, PluginFsApi } from "@vetta-org/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateGitTabProbe, onGitTabProbeChange, peekGitTabProbe, setFsApi, setGitCommand } from "../src/git/runtime";
import { ensureGitTabProbe, isGitAvailable, isInsideGitWorkTree, probeGitTab } from "../src/git/tab-visibility";

function command(result: PluginCommandRunResult | Error): PluginCommandApi {
	return {
		run: async () => {
			if (result instanceof Error) throw result;
			return result;
		},
	};
}

describe("isInsideGitWorkTree", () => {
	it("is true inside a work tree", async () => {
		await expect(
			isInsideGitWorkTree(command({ stdout: "true\n", stderr: "", exitCode: 0 }), "/repo"),
		).resolves.toBe(true);
	});

	it("is false outside a repository (non-zero exit)", async () => {
		await expect(
			isInsideGitWorkTree(
				command({ stdout: "", stderr: "fatal: not a git repository", exitCode: 128 }),
				"/tmp/plain",
			),
		).resolves.toBe(false);
	});

	it("is false in a bare repository (no work tree to show changes for)", async () => {
		await expect(
			isInsideGitWorkTree(command({ stdout: "false\n", stderr: "", exitCode: 0 }), "/repo.git"),
		).resolves.toBe(false);
	});

	it("is false when the command is rejected/unavailable instead of throwing", async () => {
		await expect(isInsideGitWorkTree(command(new Error("command not allowed")), "/repo")).resolves.toBe(false);
	});
});

/** git 命令按子命令返回；null 表示宿主报告「没装 git」（spawn 失败）。 */
function gitHost(results: { revParse: PluginCommandRunResult | null; version: PluginCommandRunResult | null }): PluginCommandApi {
	return {
		run: async (_file, args = []) => {
			const result = args[0] === "--version" ? results.version : results.revParse;
			if (!result) throw new Error("Command failed to start: git (ENOENT)");
			return result;
		},
	};
}

function fsWith(paths: string[]): PluginFsApi {
	return {
		stat: async (path: string) => (paths.includes(path) ? { isDirectory: true } : null),
	} as unknown as PluginFsApi;
}

describe("isGitAvailable", () => {
	it("needs a real git version banner", async () => {
		await expect(
			isGitAvailable(command({ stdout: "git version 2.39.5\n", stderr: "", exitCode: 0 }), "/repo"),
		).resolves.toBe(true);
		await expect(
			isGitAvailable(command({ stdout: "", stderr: "xcrun: error: invalid active developer path", exitCode: 1 })),
		).resolves.toBe(false);
		await expect(isGitAvailable(command(new Error("Command failed to start: git (ENOENT)")))).resolves.toBe(false);
	});
});

describe("probeGitTab", () => {
	const ok = (stdout: string): PluginCommandRunResult => ({ stdout, stderr: "", exitCode: 0 });
	const notRepo: PluginCommandRunResult = { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 };

	it("shows the tab for a repository", async () => {
		const host = gitHost({ revParse: ok("true\n"), version: ok("git version 2.43.0") });
		await expect(probeGitTab(host, fsWith([]), "/repo")).resolves.toBe("repo");
	});

	it("hides the tab outside a repository when git works", async () => {
		const host = gitHost({ revParse: notRepo, version: ok("git version 2.43.0") });
		await expect(probeGitTab(host, fsWith(["/plain/.git"]), "/plain")).resolves.toBe("not-repo");
	});

	it("keeps the tab for a repository folder when git is missing, so the install hint is visible", async () => {
		const host = gitHost({ revParse: null, version: null });
		await expect(probeGitTab(host, fsWith(["/repo/.git"]), "/repo/")).resolves.toBe("no-git");
	});

	it("stays hidden for a plain folder when git is missing", async () => {
		const host = gitHost({ revParse: null, version: null });
		await expect(probeGitTab(host, fsWith([]), "/plain")).resolves.toBe("not-repo");
	});
});

describe("git tab probe cache", () => {
	const ok = (stdout: string, exitCode = 0): PluginCommandRunResult => ({ stdout, stderr: "", exitCode });

	beforeEach(() => {
		invalidateGitTabProbe();
	});

	/** 装一个会数 rev-parse 次数的宿主：探测次数本身就是「有没有重复探测」的可观察结果。 */
	function installHost(revParse: PluginCommandRunResult): { probes: () => number } {
		let probeCount = 0;
		setGitCommand({
			run: async (_file: string, args: string[] = []) => {
				if (args[0] === "--version") return ok("git version 2.43.0");
				probeCount += 1;
				return revParse;
			},
		});
		setFsApi(fsWith([]));
		return { probes: () => probeCount };
	}

	async function ensureProbe(cwd: string): Promise<string | undefined> {
		ensureGitTabProbe(cwd);
		await vi.waitFor(() => expect(peekGitTabProbe(cwd)).toBeDefined());
		return peekGitTabProbe(cwd);
	}

	it("publishes one result per cwd and reuses it instead of probing again", async () => {
		const host = installHost(ok("true\n"));
		let notifications = 0;
		const off = onGitTabProbeChange(() => {
			notifications += 1;
		});

		expect(peekGitTabProbe("/repo")).toBeUndefined();
		ensureGitTabProbe("/repo");
		ensureGitTabProbe("/repo"); // 同一 cwd 的第二次请求必须复用第一次

		await expect(ensureProbe("/repo")).resolves.toBe("repo");
		expect(host.probes()).toBe(1);
		expect(notifications).toBe(1);
		off();
	});

	it("re-probes after invalidation so `git init` can put the tab on the bar", async () => {
		installHost(ok("", 128));
		await expect(ensureProbe("/plain")).resolves.toBe("not-repo");

		installHost(ok("true\n"));
		invalidateGitTabProbe("/plain");
		await expect(ensureProbe("/plain")).resolves.toBe("repo");
	});
});

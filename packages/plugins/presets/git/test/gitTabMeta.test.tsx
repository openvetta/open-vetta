// @vitest-environment jsdom
import type { PluginCommandRunResult } from "@vetta-org/plugin-sdk";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGitTabMeta } from "../src/components/useGitTabMeta";
import { invalidateGitTabProbe, setFsApi, setGitCommand } from "../src/git/runtime";

const ok = (stdout: string, exitCode = 0): PluginCommandRunResult => ({ stdout, stderr: "", exitCode });

/** 模拟宿主：cwd 决定 rev-parse 的结论，与真实的「仓库 / 非仓库」一致。 */
function installHost(repos: readonly string[]): void {
	setGitCommand({
		run: async (_file: string, args: string[] = [], options?: { cwd?: string }) => {
			if (args[0] === "--version") return ok("git version 2.43.0\n");
			return repos.includes(options?.cwd ?? "") ? ok("true\n") : ok("", 128);
		},
	});
	setFsApi({ stat: async () => null } as never);
}

beforeEach(() => {
	invalidateGitTabProbe();
});

afterEach(() => {
	invalidateGitTabProbe();
});

describe("useGitTabMeta", () => {
	it("pins the tab in a repository and keeps it in the addable pool elsewhere", async () => {
		installHost(["/repo"]);

		const repo = renderHook(() => useGitTabMeta({ cwd: "/repo" }));
		await waitFor(() => expect(repo.result.current).toEqual({ pinned: true }));

		const plain = renderHook(() => useGitTabMeta({ cwd: "/plain" }));
		await waitFor(() => expect(plain.result.current).toEqual({ pinned: false }));
	});

	it("claims no frame while the probe is still running", () => {
		installHost(["/repo"]);
		const { result } = renderHook(() => useGitTabMeta({ cwd: "/repo" }));
		// 首帧还没有结论：不进入候选，避免先按错误判断抢占标签栏。
		expect(result.current).toBeNull();
	});

	it("contributes nothing without a workspace cwd", () => {
		installHost([]);
		const { result } = renderHook(() => useGitTabMeta({ cwd: null }));
		expect(result.current).toBeNull();
	});
});

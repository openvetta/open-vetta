import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverClaudeHookHandlers, isClaudeOwnedSource } from "../src/claude-code/hooks/config.js";
import { CLAUDE_CODE_HOOK_PROFILE_ID } from "../src/claude-code/hooks/profile.js";
import { discoverCodexHookHandlers, isCodexOwnedSource } from "../src/codex/hooks/config.js";
import { LATEST_CODEX_HOOK_PROFILE_ID } from "../src/codex/hooks/latest/profile.js";
import { buildDefaultHookConfigLayers } from "../src/default-hook-config-layers.js";

const tempDirs: string[] = [];

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		try {
			const { rm } = await import("node:fs/promises");
			await rm(dir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
});

async function makeTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function sessionStartHooks(command: string): string {
	return JSON.stringify({
		hooks: {
			SessionStart: [
				{
					hooks: [{ type: "command", command }],
				},
			],
		},
	});
}

/** Claude settings.json may carry other keys; hooks stay under "hooks". */
function claudeSettingsWithHooks(command: string): string {
	return JSON.stringify({
		permissions: { allow: ["Bash(*)"] },
		hooks: {
			SessionStart: [
				{
					hooks: [{ type: "command", command }],
				},
			],
		},
	});
}

describe("buildDefaultHookConfigLayers", () => {
	it("includes only official Codex/Claude paths with profile ownership", () => {
		const home = "C:/fake-home";
		const cwd = "C:/projects/demo";
		const layers = buildDefaultHookConfigLayers({
			cwd,
			homeDir: home,
			env: {},
		});

		const paths = layers.flatMap((layer) => (layer.sources ?? []).map((s) => s.path.replace(/\\/g, "/")));
		expect(paths).toEqual([
			"C:/fake-home/.codex/hooks.json",
			"C:/fake-home/.claude/settings.json",
			"C:/projects/demo/.codex/hooks.json",
			"C:/projects/demo/.claude/settings.json",
			"C:/projects/demo/.claude/settings.local.json",
		]);

		const byProfile = layers.flatMap((layer) =>
			(layer.sources ?? []).map((s) => ({ path: s.path.replace(/\\/g, "/"), profileId: s.profileId })),
		);
		expect(
			byProfile
				.filter((s) => s.path.includes("/.codex/"))
				.every((s) => s.profileId === LATEST_CODEX_HOOK_PROFILE_ID),
		).toBe(true);
		expect(
			byProfile
				.filter((s) => s.path.includes("/.claude/"))
				.every((s) => s.profileId === CLAUDE_CODE_HOOK_PROFILE_ID),
		).toBe(true);
	});

	it("honors CODEX_HOME for user Codex hooks", () => {
		const layers = buildDefaultHookConfigLayers({
			cwd: "/p",
			homeDir: "/home/u",
			env: { CODEX_HOME: "/custom/codex" },
		});
		const paths = layers.flatMap((l) => (l.sources ?? []).map((s) => s.path.replace(/\\/g, "/")));
		expect(paths).toContain("/custom/codex/hooks.json");
		expect(paths).not.toContain("/home/u/.codex/hooks.json");
	});
});

describe("source ownership filters", () => {
	it("classifies official paths without profileId", () => {
		expect(isCodexOwnedSource({ path: "/home/u/.codex/hooks.json" })).toBe(true);
		expect(isCodexOwnedSource({ path: "/repo/.codex/hooks.json" })).toBe(true);
		expect(isCodexOwnedSource({ path: "/repo/.vetta/hooks.json" })).toBe(false);
		expect(isCodexOwnedSource({ path: "/home/u/.claude/settings.json" })).toBe(false);
		expect(isCodexOwnedSource({ path: "/plugin/hooks/hooks.json" })).toBe(false);

		expect(isClaudeOwnedSource({ path: "/home/u/.claude/settings.json" })).toBe(true);
		expect(isClaudeOwnedSource({ path: "/repo/.claude/settings.local.json" })).toBe(true);
		expect(isClaudeOwnedSource({ path: "/repo/.vetta/claude-hooks.json" })).toBe(false);
		expect(isClaudeOwnedSource({ path: "/home/u/.codex/hooks.json" })).toBe(false);
	});
});

describe("official path discovery", () => {
	it("loads Codex handlers from .codex/hooks.json and ignores Claude settings", async () => {
		const home = await makeTempDir("vetta-codex-home-");
		const project = await makeTempDir("vetta-codex-proj-");
		await mkdir(join(home, ".codex"), { recursive: true });
		await mkdir(join(project, ".codex"), { recursive: true });
		await mkdir(join(project, ".claude"), { recursive: true });

		await writeFile(join(home, ".codex", "hooks.json"), sessionStartHooks("echo codex-user"), "utf8");
		await writeFile(join(project, ".codex", "hooks.json"), sessionStartHooks("echo codex-project"), "utf8");
		await writeFile(join(project, ".claude", "settings.json"), claudeSettingsWithHooks("echo claude-only"), "utf8");
		// Vetta legacy path must be ignored
		await mkdir(join(project, ".vetta"), { recursive: true });
		await writeFile(join(project, ".vetta", "hooks.json"), sessionStartHooks("echo vetta-legacy"), "utf8");

		const layers = buildDefaultHookConfigLayers({
			cwd: project,
			homeDir: home,
			env: {},
		});
		const result = await discoverCodexHookHandlers(layers);
		expect(result.diagnostics).toEqual([]);
		expect(result.handlers.map((h) => h.command)).toEqual(["echo codex-user", "echo codex-project"]);
	});

	it("loads Claude handlers from official settings.json including extra settings keys", async () => {
		const home = await makeTempDir("vetta-claude-home-");
		const project = await makeTempDir("vetta-claude-proj-");
		await mkdir(join(home, ".claude"), { recursive: true });
		await mkdir(join(project, ".claude"), { recursive: true });

		await writeFile(join(home, ".claude", "settings.json"), claudeSettingsWithHooks("echo claude-user"), "utf8");
		await writeFile(
			join(project, ".claude", "settings.json"),
			claudeSettingsWithHooks("echo claude-project"),
			"utf8",
		);
		await writeFile(
			join(project, ".claude", "settings.local.json"),
			claudeSettingsWithHooks("echo claude-local"),
			"utf8",
		);
		await mkdir(join(project, ".codex"), { recursive: true });
		await writeFile(join(project, ".codex", "hooks.json"), sessionStartHooks("echo codex-only"), "utf8");
		// Vetta legacy path must be ignored
		await mkdir(join(project, ".vetta"), { recursive: true });
		await writeFile(join(project, ".vetta", "claude-hooks.json"), sessionStartHooks("echo vetta-legacy"), "utf8");

		const layers = buildDefaultHookConfigLayers({
			cwd: project,
			homeDir: home,
			env: {},
		});
		const result = await discoverClaudeHookHandlers(layers, { projectDir: project });
		expect(result.diagnostics).toEqual([]);
		expect(result.handlers.map((h) => h.command)).toEqual([
			"echo claude-user",
			"echo claude-project",
			"echo claude-local",
		]);
	});
});

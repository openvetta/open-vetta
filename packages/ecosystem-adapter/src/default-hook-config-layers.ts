import { homedir } from "node:os";
import { join } from "node:path";
import { CLAUDE_CODE_HOOK_PROFILE_ID } from "./claude-code/hooks/profile.js";
import { LATEST_CODEX_HOOK_PROFILE_ID } from "./codex/hooks/latest/profile.js";
import type { HookConfigLayer, HookConfigSource } from "./hooks/types.js";

/** Project / user config directory basename (brand default). */
export const VETTA_HOOK_CONFIG_DIR_NAME = ".vetta";

export interface BuildDefaultHookConfigLayersOptions {
	/** Session project working directory. */
	cwd: string;
	/**
	 * Vetta user data root.
	 * Default: `~/.vetta` (HOME / USERPROFILE / os.homedir()).
	 * Coding Agent should pass `getVettaHomePath()` so `VETTA_HOME` applies.
	 */
	vettaHome?: string;
	/**
	 * Project config directory name under cwd. Default: `.vetta`.
	 * Override only for tests or non-standard layouts.
	 */
	configDirName?: string;
	/**
	 * Override home directory (tests). Default: HOME / USERPROFILE / os.homedir().
	 * Used only when `vettaHome` is omitted.
	 */
	homeDir?: string;
	/** Environment for HOME resolution. Default process.env. */
	env?: NodeJS.ProcessEnv;
}

/**
 * Build host config layers for ecosystem hook discovery under Vetta paths only.
 *
 * Mirrors official Codex/Claude directory layout **inside** Vetta roots:
 *
 * 1. User:
 *    - `<vettaHome>/.codex/hooks.json`
 *    - `<vettaHome>/.claude/settings.json`
 * 2. Project:
 *    - `<cwd>/.vetta/.codex/hooks.json`
 *    - `<cwd>/.vetta/.claude/settings.json`
 *    - `<cwd>/.vetta/.claude/settings.local.json`
 *
 * Does **not** read top-level official homes (`~/.codex`, `~/.claude`, project
 * `.codex` / `.claude` at cwd root). Hosts that need those must pass explicit layers.
 *
 * Each source carries `profileId` so Codex and Claude adapters never claim each other's files.
 * Missing files are ignored at discovery time (ENOENT).
 *
 * File formats match the original ecosystems (Codex `hooks.json`; Claude settings with `"hooks"`).
 */
export function buildDefaultHookConfigLayers(options: BuildDefaultHookConfigLayersOptions): HookConfigLayer[] {
	const env = options.env ?? process.env;
	const homeDir = options.homeDir ?? resolveHomeDir(env);
	const vettaHome = options.vettaHome ?? join(homeDir, VETTA_HOOK_CONFIG_DIR_NAME);
	const configDirName = options.configDirName ?? VETTA_HOOK_CONFIG_DIR_NAME;
	const projectVettaDir = join(options.cwd, configDirName);

	const userCodexDir = join(vettaHome, ".codex");
	const userClaudeDir = join(vettaHome, ".claude");
	const projectCodexDir = join(projectVettaDir, ".codex");
	const projectClaudeDir = join(projectVettaDir, ".claude");

	return [
		{
			directory: userCodexDir,
			enabled: true,
			label: "vetta-user-codex",
			sources: [codexSource(join(userCodexDir, "hooks.json"))],
		},
		{
			directory: userClaudeDir,
			enabled: true,
			label: "vetta-user-claude",
			sources: [claudeSource(join(userClaudeDir, "settings.json"))],
		},
		{
			directory: projectCodexDir,
			enabled: true,
			label: "vetta-project-codex",
			sources: [codexSource(join(projectCodexDir, "hooks.json"))],
		},
		{
			directory: projectClaudeDir,
			enabled: true,
			label: "vetta-project-claude",
			sources: [
				claudeSource(join(projectClaudeDir, "settings.json")),
				claudeSource(join(projectClaudeDir, "settings.local.json")),
			],
		},
	];
}

function codexSource(path: string): HookConfigSource {
	return { path, profileId: LATEST_CODEX_HOOK_PROFILE_ID };
}

function claudeSource(path: string): HookConfigSource {
	return { path, profileId: CLAUDE_CODE_HOOK_PROFILE_ID };
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
	const fromEnv = env.HOME || env.USERPROFILE;
	if (fromEnv && fromEnv.length > 0) return fromEnv;
	return homedir();
}

import { homedir } from "node:os";
import { join } from "node:path";
import { CLAUDE_CODE_HOOK_PROFILE_ID } from "./claude-code/hooks/profile.js";
import { LATEST_CODEX_HOOK_PROFILE_ID } from "./codex/hooks/latest/profile.js";
import type { HookConfigLayer, HookConfigSource } from "./hooks/types.js";

export interface BuildDefaultHookConfigLayersOptions {
	/** Session project working directory. */
	cwd: string;
	/**
	 * Override home directory (tests). Default: HOME / USERPROFILE / os.homedir().
	 * Used to resolve `~/.codex` and `~/.claude` when dedicated overrides are omitted.
	 */
	homeDir?: string;
	/** Override Codex user config directory. Default: `$CODEX_HOME` or `~/.codex`. */
	codexHome?: string;
	/** Override Claude Code user config directory. Default: `~/.claude`. */
	claudeConfigDir?: string;
	/** Environment for CODEX_HOME / HOME resolution. Default process.env. */
	env?: NodeJS.ProcessEnv;
}

/**
 * Build host config layers for ecosystem hook discovery using official paths only.
 *
 * Load order (additive, matching Codex/Claude multi-source behavior):
 * 1. User: `~/.codex/hooks.json`, `~/.claude/settings.json`
 * 2. Project: `<cwd>/.codex/hooks.json`, `<cwd>/.claude/settings.json`, `settings.local.json`
 *
 * Each source carries `profileId` so Codex and Claude adapters never claim each other's files.
 * Missing files are ignored at discovery time (ENOENT).
 *
 * Official references:
 * - Codex: ~/.codex/hooks.json, <repo>/.codex/hooks.json
 * - Claude Code: ~/.claude/settings.json, .claude/settings.json, .claude/settings.local.json
 *   (hooks live under the `"hooks"` key; plugins still use hooks/hooks.json via explicit sources)
 */
export function buildDefaultHookConfigLayers(options: BuildDefaultHookConfigLayersOptions): HookConfigLayer[] {
	const env = options.env ?? process.env;
	const homeDir = options.homeDir ?? resolveHomeDir(env);
	const codexHome = options.codexHome ?? resolveCodexHome(env, homeDir);
	const claudeConfigDir = options.claudeConfigDir ?? join(homeDir, ".claude");
	const codexProjectDir = join(options.cwd, ".codex");
	const claudeProjectDir = join(options.cwd, ".claude");

	return [
		{
			directory: codexHome,
			enabled: true,
			label: "codex-user",
			sources: [codexSource(join(codexHome, "hooks.json"))],
		},
		{
			directory: claudeConfigDir,
			enabled: true,
			label: "claude-user",
			sources: [claudeSource(join(claudeConfigDir, "settings.json"))],
		},
		{
			directory: codexProjectDir,
			enabled: true,
			label: "codex-project",
			sources: [codexSource(join(codexProjectDir, "hooks.json"))],
		},
		{
			directory: claudeProjectDir,
			enabled: true,
			label: "claude-project",
			sources: [
				claudeSource(join(claudeProjectDir, "settings.json")),
				claudeSource(join(claudeProjectDir, "settings.local.json")),
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

function resolveCodexHome(env: NodeJS.ProcessEnv, homeDir: string): string {
	const codexHome = env.CODEX_HOME;
	if (codexHome && codexHome.trim().length > 0) return codexHome.trim();
	return join(homeDir, ".codex");
}

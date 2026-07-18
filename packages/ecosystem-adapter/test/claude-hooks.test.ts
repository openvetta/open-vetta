import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createClaudeHookAdapter } from "../src/claude-code/hooks/adapter.js";
import { discoverClaudeHookHandlers } from "../src/claude-code/hooks/config.js";
import { expandClaudePlaceholders } from "../src/claude-code/hooks/placeholders.js";
import { CLAUDE_CODE_HOOK_PROFILE_ID } from "../src/claude-code/hooks/profile.js";
import { mapToolToClaude } from "../src/claude-code/hooks/tool-mapper.js";
import { createEcosystemHookRuntime } from "../src/runtime.js";

const tempDirs: string[] = [];

afterEach(async () => {
	// Best-effort cleanup; Windows may lock briefly.
	for (const dir of tempDirs.splice(0)) {
		try {
			const { rm } = await import("node:fs/promises");
			await rm(dir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "vetta-claude-hooks-"));
	tempDirs.push(dir);
	return dir;
}

describe("claude path placeholders", () => {
	it("expands CLAUDE_PLUGIN_ROOT and CLAUDE_PROJECT_DIR including paths with spaces", () => {
		const command = [
			'"',
			"$",
			"{CLAUDE_PLUGIN_ROOT}/scripts/preflight.sh",
			'" && echo ',
			"$",
			"{CLAUDE_PROJECT_DIR}",
		].join("");
		const expanded = expandClaudePlaceholders(command, {
			pluginRoot: "C:\\Plugins\\My Plugin",
			projectDir: "D:\\Work\\demo project",
		});
		expect(expanded).toContain("C:\\Plugins\\My Plugin/scripts/preflight.sh");
		expect(expanded).toContain("D:\\Work\\demo project");
	});
});

describe("claude tool mapper", () => {
	it("maps host tools to Claude canonical names", () => {
		expect(mapToolToClaude({ hostName: "bash", kind: "shell" }).name).toBe("Bash");
		expect(mapToolToClaude({ hostName: "write", kind: "file-edit" }).name).toBe("Write");
		expect(mapToolToClaude({ hostName: "edit", kind: "file-edit" }).name).toBe("Edit");
		expect(mapToolToClaude({ hostName: "spawn_agent", kind: "agent" }).name).toBe("Agent");
		expect(mapToolToClaude({ hostName: "TeamCreate", kind: "custom" }).name).toBe("TeamCreate");
	});
});

describe("discoverClaudeHookHandlers", () => {
	it("loads SessionStart command handlers from claude-hooks.json", async () => {
		const root = await makeTempDir();
		const vettaDir = join(root, ".vetta");
		await mkdir(vettaDir, { recursive: true });
		await writeFile(
			join(vettaDir, "claude-hooks.json"),
			JSON.stringify({
				hooks: {
					SessionStart: [
						{
							hooks: [
								{
									type: "command",
									command: `node -e ${JSON.stringify(`process.stdout.write("preflight")`)}`,
								},
							],
						},
					],
				},
			}),
			"utf8",
		);

		const result = await discoverClaudeHookHandlers([{ directory: vettaDir, enabled: true }], {
			projectDir: root,
		});
		expect(result.diagnostics).toEqual([]);
		expect(result.handlers).toHaveLength(1);
		expect(result.handlers[0]?.eventName).toBe("SessionStart");
		expect(result.handlers[0]?.command).toContain("node -e");
	});

	it("loads original cc-skills council hooks.json with CLAUDE_PLUGIN_ROOT expansion", async () => {
		const pluginRoot = await makeTempDir();
		const hooksDir = join(pluginRoot, "hooks");
		const scriptsDir = join(pluginRoot, "scripts");
		await mkdir(hooksDir, { recursive: true });
		await mkdir(scriptsDir, { recursive: true });
		await writeFile(
			join(scriptsDir, "preflight.sh"),
			"#!/bin/bash\necho 'Council plugin: missing CLIs: codex (fixture)'\n",
			"utf8",
		);
		await writeFile(
			join(hooksDir, "hooks.json"),
			JSON.stringify({
				hooks: {
					SessionStart: [
						{
							hooks: [
								{
									type: "command",
									command: ["$", "{CLAUDE_PLUGIN_ROOT}/scripts/preflight.sh"].join(""),
								},
							],
						},
					],
				},
			}),
			"utf8",
		);

		const result = await discoverClaudeHookHandlers(
			[
				{
					directory: pluginRoot,
					enabled: true,
					sources: [
						{
							path: join(hooksDir, "hooks.json"),
							env: { CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: pluginRoot },
							pluginId: "council",
							profileId: CLAUDE_CODE_HOOK_PROFILE_ID,
						},
					],
				},
			],
			{ projectDir: pluginRoot },
		);
		expect(result.diagnostics).toEqual([]);
		expect(result.handlers).toHaveLength(1);
		expect(result.handlers[0]?.command.replace(/\\/g, "/")).toContain(
			`${pluginRoot.replace(/\\/g, "/")}/scripts/preflight.sh`,
		);
		expect(result.handlers[0]?.env?.CLAUDE_PLUGIN_ROOT).toBe(pluginRoot);
	});

	it("reports unsupported handler types and events", async () => {
		const root = await makeTempDir();
		const vettaDir = join(root, ".vetta");
		await mkdir(vettaDir, { recursive: true });
		await writeFile(
			join(vettaDir, "claude-hooks.json"),
			JSON.stringify({
				hooks: {
					Notification: [{ hooks: [{ type: "command", command: "echo hi" }] }],
					SessionStart: [
						{
							hooks: [
								{ type: "http", url: "http://example.com" },
								{ type: "prompt", prompt: "yes?" },
							],
						},
					],
				},
			}),
			"utf8",
		);
		const result = await discoverClaudeHookHandlers([{ directory: vettaDir, enabled: true }], {
			projectDir: root,
		});
		expect(result.handlers).toHaveLength(0);
		expect(result.diagnostics.some((d) => d.code === "unsupported_event")).toBe(true);
		expect(result.diagnostics.filter((d) => d.code === "unsupported_handler_type")).toHaveLength(2);
	});
});

async function writeHookProject(files: Record<string, string>): Promise<{ root: string; vettaDir: string }> {
	const root = await makeTempDir();
	const vettaDir = join(root, ".vetta");
	await mkdir(vettaDir, { recursive: true });
	for (const [relative, content] of Object.entries(files)) {
		const absolute = join(root, relative);
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, content, "utf8");
	}
	return { root, vettaDir };
}

describe("createClaudeHookAdapter runtime", () => {
	it("SessionStart plain stdout becomes additional context", async () => {
		const { root, vettaDir } = await writeHookProject({
			"session-start.cjs": `process.stdout.write("preflight context from fixture");\n`,
			".vetta/claude-hooks.json": JSON.stringify({
				hooks: {
					SessionStart: [{ hooks: [{ type: "command", command: "node session-start.cjs" }] }],
				},
			}),
		});

		const runtime = createEcosystemHookRuntime({
			host: {
				cwd: root,
				getSessionId: () => "session-1",
				getTranscriptPath: () => null,
				getModelId: () => "test-model",
				abortCurrentRun: () => {},
			},
			initialSessionStartSource: "startup",
			configLayers: [{ directory: vettaDir, enabled: true, label: "fixture" }],
		});

		const outcome = await runtime.runPendingSessionStart();
		expect(outcome?.shouldBlock).toBe(false);
		expect(outcome?.shouldStop).toBe(false);
		expect(outcome?.additionalContexts.some((c) => c.includes("preflight context"))).toBe(true);
		expect(outcome?.runs.some((run) => run.profileId === CLAUDE_CODE_HOOK_PROFILE_ID)).toBe(true);
	});

	it("UserPromptSubmit decision:block stops the prompt", async () => {
		const { root, vettaDir } = await writeHookProject({
			"block-prompt.cjs": `
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const prompt = JSON.parse(data).prompt || "";
  if (/^\\s*\\/cdt(\\s|:|$)/.test(prompt)) {
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: "CDT requires Agent Teams (fixture)"
    }));
  }
});
`,
			".vetta/claude-hooks.json": JSON.stringify({
				hooks: {
					UserPromptSubmit: [{ hooks: [{ type: "command", command: "node block-prompt.cjs" }] }],
				},
			}),
		});

		const runtime = createEcosystemHookRuntime({
			host: {
				cwd: root,
				getSessionId: () => "session-2",
				getTranscriptPath: () => null,
				getModelId: () => "test-model",
				abortCurrentRun: () => {},
			},
			initialSessionStartSource: "startup",
			configLayers: [{ directory: vettaDir, enabled: true }],
		});
		await runtime.runPendingSessionStart();
		const blocked = await runtime.runUserPromptSubmit("/cdt plan something");
		expect(blocked.shouldStop || blocked.shouldBlock).toBe(true);
		expect(blocked.stopReason ?? blocked.blockReason).toContain("Agent Teams");

		const allowed = await runtime.runUserPromptSubmit("hello without slash command");
		expect(allowed.shouldStop).toBe(false);
		expect(allowed.shouldBlock).toBe(false);
	});

	it("PreToolUse permissionDecision:deny blocks tool", async () => {
		const { root, vettaDir } = await writeHookProject({
			"deny-write.cjs": `
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const body = JSON.parse(data);
  if (body.tool_name === "Write") {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Write blocked by fixture hook"
      }
    }));
  }
});
`,
			".vetta/claude-hooks.json": JSON.stringify({
				hooks: {
					PreToolUse: [
						{
							matcher: "Write|Edit",
							hooks: [{ type: "command", command: "node deny-write.cjs" }],
						},
					],
				},
			}),
		});

		const runtime = createEcosystemHookRuntime({
			host: {
				cwd: root,
				getSessionId: () => "session-3",
				getTranscriptPath: () => null,
				getModelId: () => "test-model",
				abortCurrentRun: () => {},
			},
			initialSessionStartSource: "startup",
			configLayers: [{ directory: vettaDir, enabled: true }],
		});
		await runtime.runPendingSessionStart();
		await runtime.runUserPromptSubmit("touch files");
		const denied = await runtime.runPreToolUse(
			"call-1",
			{ hostName: "write", kind: "file-edit" },
			{
				path: "a.txt",
				content: "x",
			},
		);
		expect(denied.shouldBlock).toBe(true);
		expect(denied.blockReason).toContain("Write blocked");

		const bashOk = await runtime.runPreToolUse(
			"call-2",
			{ hostName: "bash", kind: "shell" },
			{
				command: "echo hi",
			},
		);
		expect(bashOk.shouldBlock).toBe(false);
	});

	it("Stop decision:block produces continuation fragments and stop_hook_active on reentry", async () => {
		const { root, vettaDir } = await writeHookProject({
			"stop-gate.cjs": `
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const body = JSON.parse(data);
  if (!body.stop_hook_active) {
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: "check unfinished tasks (fixture)"
    }));
  }
});
`,
			".vetta/claude-hooks.json": JSON.stringify({
				hooks: {
					Stop: [{ hooks: [{ type: "command", command: "node stop-gate.cjs" }] }],
				},
			}),
		});

		const runtime = createEcosystemHookRuntime({
			host: {
				cwd: root,
				getSessionId: () => "session-4",
				getTranscriptPath: () => null,
				getModelId: () => "test-model",
				abortCurrentRun: () => {},
			},
			initialSessionStartSource: "startup",
			configLayers: [{ directory: vettaDir, enabled: true }],
		});
		await runtime.runPendingSessionStart();
		await runtime.runUserPromptSubmit("do work");
		const fragments = await runtime.runStop("assistant done");
		expect(fragments.some((f) => f.includes("unfinished tasks"))).toBe(true);

		const second = await runtime.runStop("assistant after continuation");
		expect(second).toEqual([]);
	});
});

describe("createClaudeHookAdapter presence", () => {
	it("returns undefined when no Claude sources exist", async () => {
		const root = await makeTempDir();
		const adapter = await createClaudeHookAdapter({
			configLayers: [{ directory: join(root, "missing"), enabled: true }],
			projectDir: root,
		});
		expect(adapter).toBeUndefined();
	});
});

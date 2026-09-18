import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GROK_CONVERSATION_BODY_NAME,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_TOOL_ID,
} from "@vetta/coding-agent/external-sessions";
import { createDesktopExternalSessionFormat } from "@vetta/runtime-desktop";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationCacheService } from "../cache/application-cache-service.js";
import { onConversationListChanged } from "../conversations/conversation-list-events.js";
import {
	createApplicationExternalBriefingCache,
	createDesktopExternalSessionContinueFrom,
	persistDesktopExternalSessionContinueSeed,
} from "./desktop-external-session-continue-from.js";

const MODEL_KEY = "xai/grok-code";
const MODEL_BRIEFING = "The login redirect still fails; inspect the session cookie next.";
const IMPORTED_AT = Date.parse("2026-09-18T12:00:00.000Z");

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("desktop external session continue-from host", () => {
	it("uses the default model, seeds a native session, and leaves the Grok files unchanged", async () => {
		const { sidecarPath, cwd, originalSidecar, originalBody, sessionDir } = createGrokWorkspace();
		const cacheRoot = createTemporaryDirectory("vetta-continue-cache-");
		const openedProjects: string[] = [];
		const modelCalls: Array<{ modelKey: string; prompt: string }> = [];
		const listEvents: Array<{ cwd: string; sessionPath: string }> = [];
		const unsubscribe = onConversationListChanged((event) => {
			listEvents.push({ cwd: event.cwd, sessionPath: event.sessionPath });
		});

		const continueFrom = createDesktopExternalSessionContinueFrom({
			files: createDesktopExternalSessionFormat({ resolveSessionsDirectory: () => undefined }).host,
			cache: createApplicationExternalBriefingCache(new ApplicationCacheService(cacheRoot)),
			async generateBriefing(request) {
				modelCalls.push({ modelKey: request.modelKey, prompt: request.prompt });
				return MODEL_BRIEFING;
			},
			persistSeededSession: (input) =>
				persistDesktopExternalSessionContinueSeed(input, {
					resolveSessionDir: () => sessionDir,
					ensureProject: async (projectCwd) => {
						openedProjects.push(projectCwd);
					},
					createSessionId: () => "continued-from-grok",
					now: () => IMPORTED_AT,
				}),
			resolveDefaultModelKey: async () => MODEL_KEY,
			now: () => IMPORTED_AT,
			createEntryId: (() => {
				let sequence = 0;
				return () => {
					sequence += 1;
					return `entry-${sequence}`;
				};
			})(),
		});

		const result = await continueFrom({ sessionPath: sidecarPath });
		unsubscribe();

		expect(result).toMatchObject({
			kind: "created",
			sessionId: "continued-from-grok",
			cwd,
			usedCache: false,
			importedFrom: {
				tool: GROK_TOOL_ID,
				path: sidecarPath,
				importedAt: IMPORTED_AT,
			},
		});
		if (result.kind !== "created") return;
		expect(modelCalls).toEqual([
			expect.objectContaining({
				modelKey: MODEL_KEY,
				prompt: expect.stringContaining("Fix the login redirect."),
			}),
		]);
		expect(openedProjects).toEqual([cwd]);
		expect(listEvents).toEqual([{ cwd, sessionPath: result.sessionPath }]);

		const created = readFileSync(result.sessionPath, "utf8");
		expect(created).toContain('"type":"compaction"');
		expect(created).toContain(MODEL_BRIEFING);
		expect(created).toContain('"customType":"external_import_source"');
		expect(created).not.toContain('"origin"');
		expect(readFileSync(sidecarPath, "utf8")).toBe(originalSidecar);
		expect(readFileSync(join(sidecarPath, "..", GROK_CONVERSATION_BODY_NAME), "utf8")).toBe(originalBody);
	});

	it("reuses a briefing cache entry keyed by path, mtime, and size", async () => {
		const { sidecarPath, sessionDir } = createGrokWorkspace();
		const cacheRoot = createTemporaryDirectory("vetta-continue-cache-");
		const modelCalls: unknown[] = [];
		const continueFrom = createDesktopExternalSessionContinueFrom({
			files: createDesktopExternalSessionFormat({ resolveSessionsDirectory: () => undefined }).host,
			cache: createApplicationExternalBriefingCache(new ApplicationCacheService(cacheRoot)),
			async generateBriefing(request) {
				modelCalls.push(request);
				return MODEL_BRIEFING;
			},
			persistSeededSession: (input) =>
				persistDesktopExternalSessionContinueSeed(input, {
					resolveSessionDir: () => sessionDir,
					ensureProject: async () => undefined,
					createSessionId: () => `continued-${modelCalls.length}-${Date.now()}`,
				}),
			resolveDefaultModelKey: async () => MODEL_KEY,
		});

		const first = await continueFrom({ sessionPath: sidecarPath });
		const second = await continueFrom({ sessionPath: sidecarPath });
		expect(first).toMatchObject({ kind: "created", usedCache: false });
		expect(second).toMatchObject({ kind: "created", usedCache: true });
		expect(modelCalls).toHaveLength(1);
		expect(existsSync(join(cacheRoot, "external-briefing"))).toBe(true);
	});
});

function createGrokWorkspace(): {
	sidecarPath: string;
	cwd: string;
	originalSidecar: string;
	originalBody: string;
	sessionDir: string;
} {
	const root = createTemporaryDirectory("vetta-continue-desktop-");
	const cwd = join(root, "workspace");
	mkdirSync(cwd, { recursive: true });
	const grokDir = join(root, "sessions", "demo", "continue");
	mkdirSync(grokDir, { recursive: true });
	const sessionDir = join(root, "vetta-sessions");
	mkdirSync(sessionDir, { recursive: true });
	const sidecarPath = join(grokDir, GROK_SUMMARY_SIDECAR_NAME);
	const sidecar = `${JSON.stringify(
		{
			info: { id: "continue-session", cwd },
			chat_format_version: 1,
			generated_title: "Fix the login bug",
			git_root_dir: cwd,
			last_active_at: "2026-09-10T12:00:00.000Z",
		},
		null,
		2,
	)}\n`;
	const body = `${[
		JSON.stringify({
			type: "user",
			prompt_index: 0,
			content: [{ type: "text", text: "<user_query>\nFix the login redirect.\n</user_query>" }],
		}),
		JSON.stringify({
			type: "assistant",
			content: "Looking at the auth router.",
			model_id: "grok-code",
		}),
	].join("\n")}\n`;
	writeFileSync(sidecarPath, sidecar);
	writeFileSync(join(grokDir, GROK_CONVERSATION_BODY_NAME), body);
	return { sidecarPath, cwd, originalSidecar: sidecar, originalBody: body, sessionDir };
}

function createTemporaryDirectory(prefix: string): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	temporaryDirectories.push(directory);
	return directory;
}

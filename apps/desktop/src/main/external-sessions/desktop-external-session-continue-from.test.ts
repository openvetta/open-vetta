import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GROK_CONVERSATION_BODY_NAME,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_TOOL_ID,
} from "@vetta/coding-agent/external-sessions";
import { createDesktopExternalSessionFormat } from "@vetta/runtime-desktop";
import { createNodeResultArtifactStorage, resolveNodeSessionArtifactDirectory } from "@vetta/runtime-node/host";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationCacheService } from "../cache/application-cache-service.js";
import { onConversationListChanged } from "../conversations/conversation-list-events.js";
import {
	createApplicationExternalBriefingCache,
	createDesktopExternalOriginSnapshotPorts,
	createDesktopExternalSessionContinueFrom,
	DESKTOP_CONTINUE_FROM_ERROR,
	EXTERNAL_ORIGIN_SNAPSHOT_DIR,
	findDesktopImportedExternalSessions,
	persistDesktopExternalSessionContinueSeed,
	pickContinueFromModelKey,
	resolveContinueFromModelKey,
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

describe("pickContinueFromModelKey", () => {
	const grok = { key: "grok/grok-4.6", hasCredentials: true };
	const local = { key: "openai/gpt-5", hasCredentials: true };
	const stale = { key: "vetta-go/stale", hasCredentials: false };

	it("prefers the viewer-selected model when it is usable", () => {
		expect(
			pickContinueFromModelKey({
				preferred: grok.key,
				defaultModel: local.key,
				candidates: [local, grok],
			}),
		).toBe(grok.key);
	});

	it("falls back to the configured default when no preferred model is usable", () => {
		expect(
			pickContinueFromModelKey({
				preferred: stale.key,
				defaultModel: local.key,
				candidates: [stale, local],
			}),
		).toBe(local.key);
	});

	it("uses the first credentialed model when defaultModel is unset", () => {
		expect(
			pickContinueFromModelKey({
				preferred: undefined,
				defaultModel: null,
				candidates: [stale, grok, local],
			}),
		).toBe(grok.key);
	});

	it("returns undefined when no candidate has credentials", () => {
		expect(
			pickContinueFromModelKey({
				preferred: grok.key,
				defaultModel: local.key,
				candidates: [stale],
			}),
		).toBeUndefined();
	});
});

describe("resolveContinueFromModelKey", () => {
	it("throws NO_DEFAULT_MODEL when nothing usable is configured", async () => {
		await expect(
			resolveContinueFromModelKey(undefined, {
				listDefaultModel: async () => null,
				listCandidates: async () => [{ key: "grok/grok-4.6", hasCredentials: false }],
			}),
		).rejects.toThrow(DESKTOP_CONTINUE_FROM_ERROR.NO_DEFAULT_MODEL);
	});

	it("uses a logged-in Grok model when models.json has no defaultModel", async () => {
		await expect(
			resolveContinueFromModelKey(undefined, {
				listDefaultModel: async () => null,
				listCandidates: async () => [{ key: "grok/grok-4.6", hasCredentials: true }],
			}),
		).resolves.toBe("grok/grok-4.6");
	});
});

describe("desktop external session continue-from host", () => {
	it("uses the default model, seeds a native session, and leaves the Grok files unchanged", async () => {
		const { sidecarPath, cwd, originalSidecar, originalBody, sessionDir, sessionsRoot } = createGrokWorkspace();
		const cacheRoot = createTemporaryDirectory("vetta-continue-cache-");
		const openedProjects: string[] = [];
		const modelCalls: Array<{ modelKey: string; prompt: string }> = [];
		const listEvents: Array<{ cwd: string; sessionPath: string }> = [];
		const unsubscribe = onConversationListChanged((event) => {
			listEvents.push({ cwd: event.cwd, sessionPath: event.sessionPath });
		});

		const continueFrom = createDesktopExternalSessionContinueFrom({
			files: createDesktopExternalSessionFormat({ resolveSessionsDirectory: () => sessionsRoot }).host,
			cache: createApplicationExternalBriefingCache(new ApplicationCacheService(cacheRoot)),
			findImportedSessions: async () => [],
			...createDesktopExternalOriginSnapshotPorts(createTemporaryDirectory("vetta-continue-artifacts-")),
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
					now: () => IMPORTED_AT,
				}),
			resolveDefaultModelKey: async () => MODEL_KEY,
			now: () => IMPORTED_AT,
			createSessionId: () => "continued-from-grok",
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

	it("forwards the viewer-selected model into briefing model resolution", async () => {
		const { sidecarPath, sessionDir, sessionsRoot } = createGrokWorkspace();
		let preferred: string | undefined;
		const continueFrom = createDesktopExternalSessionContinueFrom({
			files: createDesktopExternalSessionFormat({ resolveSessionsDirectory: () => sessionsRoot }).host,
			cache: createApplicationExternalBriefingCache(
				new ApplicationCacheService(createTemporaryDirectory("vetta-continue-cache-")),
			),
			findImportedSessions: async () => [],
			...createDesktopExternalOriginSnapshotPorts(createTemporaryDirectory("vetta-continue-artifacts-")),
			async generateBriefing() {
				return MODEL_BRIEFING;
			},
			persistSeededSession: (input) =>
				persistDesktopExternalSessionContinueSeed(input, {
					resolveSessionDir: () => sessionDir,
					ensureProject: async () => undefined,
				}),
			resolveDefaultModelKey: async (modelKey) => {
				preferred = modelKey;
				return modelKey ?? MODEL_KEY;
			},
			createSessionId: () => "continued-from-selected",
		});

		await continueFrom({ sessionPath: sidecarPath, modelKey: "grok/grok-4.6" });
		expect(preferred).toBe("grok/grok-4.6");
	});

	it("reuses a briefing cache entry keyed by path, mtime, and size", async () => {
		const { sidecarPath, sessionDir, sessionsRoot } = createGrokWorkspace();
		const cacheRoot = createTemporaryDirectory("vetta-continue-cache-");
		const modelCalls: unknown[] = [];
		const continueFrom = createDesktopExternalSessionContinueFrom({
			files: createDesktopExternalSessionFormat({ resolveSessionsDirectory: () => sessionsRoot }).host,
			cache: createApplicationExternalBriefingCache(new ApplicationCacheService(cacheRoot)),
			findImportedSessions: async () => [],
			...createDesktopExternalOriginSnapshotPorts(createTemporaryDirectory("vetta-continue-artifacts-")),
			async generateBriefing(request) {
				modelCalls.push(request);
				return MODEL_BRIEFING;
			},
			persistSeededSession: (input) =>
				persistDesktopExternalSessionContinueSeed(input, {
					resolveSessionDir: () => sessionDir,
					ensureProject: async () => undefined,
				}),
			resolveDefaultModelKey: async () => MODEL_KEY,
			createSessionId: () => `continued-${modelCalls.length}-${Date.now()}`,
		});

		const first = await continueFrom({ sessionPath: sidecarPath });
		const second = await continueFrom({ sessionPath: sidecarPath });
		expect(first).toMatchObject({ kind: "created", usedCache: false });
		expect(second).toMatchObject({ kind: "created", usedCache: true });
		expect(modelCalls).toHaveLength(1);
		expect(existsSync(join(cacheRoot, "external-briefing"))).toBe(true);
	});

	it("returns an existing import instead of creating another session", async () => {
		const { sidecarPath, sessionDir, sessionsRoot } = createGrokWorkspace();
		const existing = {
			sessionId: "already-1",
			sessionPath: "/tmp/vetta/already.conversation.jsonl",
			cwd: "/workspace",
			importedAt: IMPORTED_AT,
		};
		const modelCalls: unknown[] = [];
		const continueFrom = createDesktopExternalSessionContinueFrom({
			files: createDesktopExternalSessionFormat({ resolveSessionsDirectory: () => sessionsRoot }).host,
			cache: createApplicationExternalBriefingCache(
				new ApplicationCacheService(createTemporaryDirectory("vetta-continue-cache-")),
			),
			findImportedSessions: async () => [existing],
			...createDesktopExternalOriginSnapshotPorts(createTemporaryDirectory("vetta-continue-artifacts-")),
			async generateBriefing(request) {
				modelCalls.push(request);
				return MODEL_BRIEFING;
			},
			persistSeededSession: (input) =>
				persistDesktopExternalSessionContinueSeed(input, {
					resolveSessionDir: () => sessionDir,
					ensureProject: async () => undefined,
				}),
			resolveDefaultModelKey: async () => MODEL_KEY,
		});

		await expect(continueFrom({ sessionPath: sidecarPath })).resolves.toEqual({
			kind: "already_imported",
			existing,
		});
		expect(modelCalls).toEqual([]);
	});

	it("stores the origin snapshot in the session artifact directory and reclaims it with the existing cleaner", async () => {
		const { sidecarPath, originalSidecar, originalBody, sessionDir, sessionsRoot } = createGrokWorkspace();
		const agentDir = createTemporaryDirectory("vetta-continue-artifacts-");
		const continueFrom = createDesktopExternalSessionContinueFrom({
			files: createDesktopExternalSessionFormat({ resolveSessionsDirectory: () => sessionsRoot }).host,
			cache: createApplicationExternalBriefingCache(
				new ApplicationCacheService(createTemporaryDirectory("vetta-continue-cache-")),
			),
			findImportedSessions: async () => [],
			...createDesktopExternalOriginSnapshotPorts(agentDir),
			async generateBriefing() {
				return MODEL_BRIEFING;
			},
			persistSeededSession: (input) =>
				persistDesktopExternalSessionContinueSeed(input, {
					resolveSessionDir: () => sessionDir,
					ensureProject: async () => undefined,
				}),
			resolveDefaultModelKey: async () => MODEL_KEY,
			createSessionId: () => "continued-from-grok",
		});

		const result = await continueFrom({ sessionPath: sidecarPath });
		expect(result.kind).toBe("created");
		const snapshotSidecar = join(
			resolveNodeSessionArtifactDirectory(join(agentDir, "tool-results"), "continued-from-grok"),
			EXTERNAL_ORIGIN_SNAPSHOT_DIR,
			GROK_SUMMARY_SIDECAR_NAME,
		);
		const snapshotBody = join(
			resolveNodeSessionArtifactDirectory(join(agentDir, "tool-results"), "continued-from-grok"),
			EXTERNAL_ORIGIN_SNAPSHOT_DIR,
			GROK_CONVERSATION_BODY_NAME,
		);
		expect(readFileSync(snapshotSidecar, "utf8")).toBe(originalSidecar);
		expect(readFileSync(snapshotBody, "utf8")).toBe(originalBody);
		if (result.kind === "created") {
			expect(readFileSync(result.sessionPath, "utf8")).not.toContain(snapshotSidecar);
		}

		const storage = createNodeResultArtifactStorage({
			codingRoot: join(agentDir, "tool-results"),
			mcpRoot: join(agentDir, "mcp-results"),
		});
		await storage.cleaner.deleteSessionArtifacts("continued-from-grok");
		expect(existsSync(snapshotSidecar)).toBe(false);
		expect(existsSync(snapshotBody)).toBe(false);
	});

	it("finds imported Vetta sessions by import source path", async () => {
		const sourcePath = "/tmp/grok/sessions/demo/summary.json";
		const matches = await findDesktopImportedExternalSessions(
			{ tool: GROK_TOOL_ID, path: sourcePath },
			{
				listProjects: async () => [{ cwd: "/workspace-a" }, { cwd: "/workspace-b" }],
				listSessions: async (cwd) =>
					cwd === "/workspace-a"
						? [
								{
									id: "native",
									path: "/tmp/vetta/native.conversation.jsonl",
									cwd,
								},
								{
									id: "imported",
									path: "/tmp/vetta/imported.conversation.jsonl",
									cwd,
									name: "Fix the login bug",
									importedFrom: { tool: GROK_TOOL_ID, path: sourcePath, importedAt: IMPORTED_AT },
								},
							]
						: [
								{
									id: "other-tool",
									path: "/tmp/vetta/other.conversation.jsonl",
									cwd,
									importedFrom: { tool: "codex", path: sourcePath, importedAt: IMPORTED_AT },
								},
							],
				samePath: (left, right) => left === right,
			},
		);

		expect(matches).toEqual([
			{
				sessionId: "imported",
				sessionPath: "/tmp/vetta/imported.conversation.jsonl",
				cwd: "/workspace-a",
				importedAt: IMPORTED_AT,
				name: "Fix the login bug",
			},
		]);
	});
});

function createGrokWorkspace(): {
	sidecarPath: string;
	cwd: string;
	originalSidecar: string;
	originalBody: string;
	sessionDir: string;
	sessionsRoot: string;
} {
	const root = createTemporaryDirectory("vetta-continue-desktop-");
	const cwd = join(root, "workspace");
	mkdirSync(cwd, { recursive: true });
	const sessionsRoot = join(root, "sessions");
	const grokDir = join(sessionsRoot, "demo", "continue");
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
	return { sidecarPath, cwd, originalSidecar: sidecar, originalBody: body, sessionDir, sessionsRoot };
}

function createTemporaryDirectory(prefix: string): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	temporaryDirectories.push(directory);
	return directory;
}

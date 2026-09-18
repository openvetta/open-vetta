import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { publishConversationSeed } from "@vetta/runtime-node/conversation";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCodingAgentExternalSessionContinueFrom,
	type ExternalSessionFileHost,
	GROK_CONVERSATION_BODY_NAME,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_TOOL_ID,
} from "../../../src/public-api/external-sessions.js";

const RECENT = "2026-09-10T12:00:00.000Z";
const IMPORTED_AT = Date.parse("2026-09-18T12:00:00.000Z");
const MODEL_KEY = "xai/grok-code";
const MODEL_BRIEFING = "The login redirect still fails after the auth router change; next, inspect the session cookie.";

const temporaryDirectories: string[] = [];

describe("external session continue-from public entry", () => {
	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("creates a new Vetta session with a compaction briefing and import source", async () => {
		const { sidecarPath, cwd, originalSidecar, originalBody } = createGrokWorkspace();
		const modelCalls: Array<{ modelKey: string; prompt: string; supplement: string }> = [];
		const continueFrom = createContinueFrom({
			files: createTestHost(),
			modelCalls,
		});

		const result = await continueFrom({ sessionPath: sidecarPath, modelKey: MODEL_KEY });

		expect(result.kind).toBe("created");
		if (result.kind !== "created") return;
		expect(result.usedCache).toBe(false);
		expect(result.cwd).toBe(cwd);
		expect(result.importedFrom).toEqual({
			tool: GROK_TOOL_ID,
			path: sidecarPath,
			importedAt: IMPORTED_AT,
		});
		expect(modelCalls).toEqual([
			expect.objectContaining({
				modelKey: MODEL_KEY,
				supplement: "Fix the login bug",
			}),
		]);
		expect(modelCalls[0]?.prompt).toContain("Fix the login redirect.");
		expect(modelCalls[0]?.prompt).toContain("Looking at the auth router.");
		expect(modelCalls[0]?.prompt).not.toContain(MODEL_BRIEFING);

		const created = readFileSync(result.sessionPath, "utf8");
		expect(created).toContain('"type":"compaction"');
		expect(created).toContain(MODEL_BRIEFING);
		expect(created).toContain('"customType":"external_import_source"');
		expect(created).toContain(sidecarPath);
		expect(created).not.toContain("Fix the login bug is the finished briefing");
		expect(created).not.toContain('"origin"');

		expect(readFileSync(sidecarPath, "utf8")).toBe(originalSidecar);
		expect(readFileSync(join(sidecarPath, "..", GROK_CONVERSATION_BODY_NAME), "utf8")).toBe(originalBody);
	});

	it("does not use the Grok sidecar title as the finished briefing", async () => {
		const { sidecarPath } = createGrokWorkspace({ title: "Grok wrote this title for itself" });
		const modelCalls: Array<{ supplement: string }> = [];
		const continueFrom = createContinueFrom({
			files: createTestHost(),
			modelCalls,
		});

		const result = await continueFrom({ sessionPath: sidecarPath, modelKey: MODEL_KEY });
		if (result.kind !== "created") throw new Error("expected created session");

		expect(modelCalls[0]?.supplement).toBe("Grok wrote this title for itself");
		expect(readFileSync(result.sessionPath, "utf8")).toContain(MODEL_BRIEFING);
		expect(readFileSync(result.sessionPath, "utf8")).not.toMatch(/"summary":"Grok wrote this title for itself"/);
	});

	it("truncates briefing input to head, tail, and middle samples", async () => {
		const huge = "HUGE_MIDDLE_PAYLOAD_".repeat(80_000);
		expect(huge.length).toBeGreaterThan(1_000_000);
		const rounds = Array.from({ length: 40 }, (_, index) => ({
			user: `User turn ${index + 1}${index === 19 ? ` ${huge}` : ""}`,
			assistant: `Assistant turn ${index + 1}`,
		}));
		const { sidecarPath } = createGrokWorkspace({ rounds });
		const modelCalls: Array<{ prompt: string }> = [];
		const continueFrom = createContinueFrom({
			files: createTestHost(),
			modelCalls,
		});

		await continueFrom({ sessionPath: sidecarPath, modelKey: MODEL_KEY });

		const prompt = modelCalls[0]?.prompt ?? "";
		expect(prompt).toContain("User turn 1");
		expect(prompt).toContain("User turn 8");
		expect(prompt).toContain("User turn 33");
		expect(prompt).toContain("User turn 40");
		expect(prompt).not.toContain(huge);
		expect(prompt).toContain('"omittedRoundCount":16');
	});

	it("reuses a briefing until the external file path, mtime, or size changes", async () => {
		const { sidecarPath } = createGrokWorkspace();
		const modelCalls: unknown[] = [];
		const continueFrom = createContinueFrom({
			files: createTestHost(),
			modelCalls,
		});

		const first = await continueFrom({ sessionPath: sidecarPath, modelKey: MODEL_KEY });
		const second = await continueFrom({ sessionPath: sidecarPath, modelKey: MODEL_KEY });
		expect(first).toMatchObject({ kind: "created", usedCache: false });
		expect(second).toMatchObject({ kind: "created", usedCache: true });
		expect(modelCalls).toHaveLength(1);

		const next = `${readFileSync(sidecarPath, "utf8")}\n`;
		writeFileSync(sidecarPath, next);
		const later = Math.floor(Date.now() / 1000) + 60;
		utimesSync(sidecarPath, later, later);

		const third = await continueFrom({ sessionPath: sidecarPath, modelKey: MODEL_KEY });
		expect(third).toMatchObject({ kind: "created", usedCache: false });
		expect(modelCalls).toHaveLength(2);
	});

	it("asks the user to reselect a trusted cwd that no longer exists", async () => {
		const { sidecarPath } = createGrokWorkspace({ cwd: "/missing/trusted/project" });
		const overrideCwd = join(sidecarPath, "..", "..", "..", "reselected-workspace");
		mkdirSync(overrideCwd, { recursive: true });
		const modelCalls: unknown[] = [];
		const continueFrom = createContinueFrom({
			files: createTestHost(),
			modelCalls,
		});

		await expect(continueFrom({ sessionPath: sidecarPath, modelKey: MODEL_KEY })).resolves.toEqual({
			kind: "cwd_missing",
			suggestedCwd: "/missing/trusted/project",
		});
		expect(modelCalls).toEqual([]);

		const created = await continueFrom({
			sessionPath: sidecarPath,
			modelKey: MODEL_KEY,
			cwdOverride: overrideCwd,
		});
		expect(created).toMatchObject({ kind: "created", cwd: overrideCwd });
	});
});

function createContinueFrom(input: { readonly files: ExternalSessionFileHost; readonly modelCalls: unknown[] }) {
	const cache = new Map<string, string>();
	let sessionSequence = 0;
	return createCodingAgentExternalSessionContinueFrom({
		files: input.files,
		cache: {
			async get(key) {
				return cache.get(key);
			},
			async set(key, briefing) {
				cache.set(key, briefing);
			},
		},
		async generateBriefing(request) {
			input.modelCalls.push(request);
			return MODEL_BRIEFING;
		},
		async persistSeededSession(seed) {
			const targetRootDir = mkdtempSync(join(tmpdir(), "vetta-continue-session-"));
			temporaryDirectories.push(targetRootDir);
			sessionSequence += 1;
			const published = await publishConversationSeed({
				targetRootDir,
				targetSessionId: `continued-${sessionSequence}`,
				createdAt: IMPORTED_AT,
				cwd: seed.cwd,
				entries: seed.entries,
				activeLeafId: seed.activeLeafId,
				name: seed.name,
			});
			return { sessionId: published.targetSessionId, sessionPath: published.targetPath };
		},
		now: () => IMPORTED_AT,
		createEntryId: (() => {
			let sequence = 0;
			return () => {
				sequence += 1;
				return `entry-${sequence}`;
			};
		})(),
	});
}

function createGrokWorkspace(input?: {
	readonly title?: string;
	readonly cwd?: string;
	readonly rounds?: readonly { readonly user: string; readonly assistant: string }[];
}): { sidecarPath: string; cwd: string; originalSidecar: string; originalBody: string } {
	const root = mkdtempSync(join(tmpdir(), "vetta-continue-grok-"));
	temporaryDirectories.push(root);
	const cwd = input?.cwd ?? join(root, "workspace");
	if (!input?.cwd) mkdirSync(cwd, { recursive: true });
	const sessionDir = join(root, "sessions", "demo", "continue");
	mkdirSync(sessionDir, { recursive: true });
	const sidecarPath = join(sessionDir, GROK_SUMMARY_SIDECAR_NAME);
	const sidecar = `${JSON.stringify(
		{
			info: { id: "continue-session", cwd },
			chat_format_version: 1,
			generated_title: input?.title ?? "Fix the login bug",
			git_root_dir: cwd,
			last_active_at: RECENT,
		},
		null,
		2,
	)}\n`;
	const body = `${(input?.rounds ?? defaultRounds())
		.flatMap((round, index) => [
			JSON.stringify({
				type: "user",
				prompt_index: index,
				content: [{ type: "text", text: `<user_query>\n${round.user}\n</user_query>` }],
			}),
			JSON.stringify({
				type: "assistant",
				content: round.assistant,
				model_id: "grok-code",
			}),
		])
		.join("\n")}\n`;
	writeFileSync(sidecarPath, sidecar);
	writeFileSync(join(sessionDir, GROK_CONVERSATION_BODY_NAME), body);
	return { sidecarPath, cwd, originalSidecar: sidecar, originalBody: body };
}

function defaultRounds(): readonly { readonly user: string; readonly assistant: string }[] {
	return [
		{ user: "Fix the login redirect.", assistant: "Looking at the auth router." },
		{ user: "The cookie still drops.", assistant: "Check the session store next." },
	];
}

function createTestHost(): ExternalSessionFileHost {
	return {
		resolveSessionsDirectory: () => undefined,
		join: (...parts) => join(...parts),
		basename,
		exists: existsSync,
		readText: (path) => readFileSync(path, "utf8"),
		readPrefixLines(path, maxLines) {
			return readFileSync(path, "utf8").split(/\r?\n/).slice(0, maxLines).join("\n");
		},
		async readDirectory(path) {
			return (await readdir(path, { withFileTypes: true })).map((entry) => ({
				name: entry.name,
				kind: entry.isFile()
					? ("file" as const)
					: entry.isDirectory()
						? ("directory" as const)
						: ("other" as const),
			}));
		},
		statModifiedAt: async (path) => (await stat(path)).mtimeMs,
		statFile: async (path) => {
			const info = statSync(path);
			return { mtimeMs: info.mtimeMs, size: info.size };
		},
		samePath: (left, right) => left === right,
	};
}

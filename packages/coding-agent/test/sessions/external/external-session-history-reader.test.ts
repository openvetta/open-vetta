import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCodingAgentExternalSessionFileHistoryReader,
	EXTERNAL_ORIGIN_MARKER_TYPE,
	EXTERNAL_SESSION_HISTORY_UNAVAILABLE,
	type ExternalSessionFileHost,
	GROK_CONVERSATION_BODY_NAME,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_TOOL_ID,
	OMITTED_REASONING_MARKER_TYPE,
	SKIPPED_TRUNCATED_LINES_MARKER_TYPE,
} from "../../../src/public-api/external-sessions.js";

const RECENT = "2026-09-10T12:00:00.000Z";

describe("external session history reader public entry", () => {
	const temporaryDirectories: string[] = [];
	const reads: string[] = [];

	afterEach(() => {
		reads.length = 0;
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("keeps display markers and IPC error codes stable for the desktop viewer", () => {
		expect(EXTERNAL_ORIGIN_MARKER_TYPE).toBe("external_origin");
		expect(OMITTED_REASONING_MARKER_TYPE).toBe("omitted_reasoning");
		expect(SKIPPED_TRUNCATED_LINES_MARKER_TYPE).toBe("skipped_truncated_lines");
		expect(GROK_TOOL_ID).toBe("grok");
		expect(EXTERNAL_SESSION_HISTORY_UNAVAILABLE).toEqual({
			corrupted_header: "EXTERNAL_SESSION_CORRUPTED_HEADER",
			unsupported_version: "EXTERNAL_SESSION_UNSUPPORTED_VERSION",
		});
	});

	it("projects a Grok conversation with hidden reasoning, folded tools, and origin", () => {
		const root = createSessionsRoot();
		const sidecarPath = writeGrokSession(root, "demo-session", {
			id: "demo-session",
			title: "Fix the login bug",
			body: [
				JSON.stringify({
					type: "system",
					content: "You are Grok.",
				}),
				JSON.stringify({
					type: "user",
					synthetic_reason: "project_instructions",
					content: [{ type: "text", text: "injected context" }],
				}),
				JSON.stringify({
					type: "user",
					prompt_index: 0,
					content: [{ type: "text", text: "<user_query>\nFix the login redirect.\n</user_query>" }],
				}),
				JSON.stringify({
					type: "reasoning",
					summary: [{ type: "summary_text", text: "I should inspect the auth router first." }],
				}),
				JSON.stringify({
					type: "reasoning",
					summary: [{ type: "summary_text", text: "Then check the session cookie." }],
				}),
				JSON.stringify({
					type: "assistant",
					content: "Looking at the auth router.",
					model_id: "grok-code",
					tool_calls: [
						{
							id: "call_bash_1",
							name: "bash",
							arguments: JSON.stringify({ command: "rg 'login' src/auth" }),
						},
					],
				}),
				JSON.stringify({
					type: "tool_result",
					tool_call_id: "call_bash_1",
					content: "exit: 0\nsrc/auth/router.ts:12: login()",
				}),
				JSON.stringify({
					type: "assistant",
					content: "The redirect lives in the auth router.",
					model_id: "grok-code",
				}),
			].join("\n"),
		});
		writeFileSync(join(sidecarPath, "..", "updates.jsonl"), '{"type":"should-be-ignored"}\n');
		writeFileSync(join(sidecarPath, "..", "events.jsonl"), '{"type":"should-be-ignored"}\n');

		const reader = createReader(root);
		expect(reader.canRead(sidecarPath)).toBe(true);
		expect(reader.canRead(join(sidecarPath, "..", GROK_CONVERSATION_BODY_NAME))).toBe(false);

		const { history } = reader.read(sidecarPath);
		expect(history[0]).toMatchObject({
			type: "custom_marker",
			customType: EXTERNAL_ORIGIN_MARKER_TYPE,
			details: { tool: GROK_TOOL_ID },
		});
		expect(history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "user",
						content: "Fix the login redirect.",
					}),
				}),
				expect.objectContaining({
					type: "custom_marker",
					customType: OMITTED_REASONING_MARKER_TYPE,
					details: { count: 2 },
				}),
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "assistant",
						content: expect.arrayContaining([
							expect.objectContaining({ type: "text", text: "Looking at the auth router." }),
						]),
					}),
				}),
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "assistant",
						content: [
							expect.objectContaining({
								type: "toolCall",
								name: "bash",
								arguments: { command: "rg 'login' src/auth" },
							}),
						],
					}),
				}),
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "toolResult",
						toolCallId: "call_bash_1",
						toolName: "bash",
						isError: false,
						content: [],
					}),
				}),
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "assistant",
						content: expect.arrayContaining([
							expect.objectContaining({ type: "text", text: "The redirect lives in the auth router." }),
						]),
					}),
				}),
			]),
		);
		expect(JSON.stringify(history)).not.toContain("I should inspect the auth router");
		expect(JSON.stringify(history)).not.toContain("src/auth/router.ts:12");
		expect(JSON.stringify(history)).not.toContain("injected context");
		expect(JSON.stringify(history)).not.toContain("You are Grok.");
		expect(
			reads.every((path) => [GROK_SUMMARY_SIDECAR_NAME, GROK_CONVERSATION_BODY_NAME].includes(basename(path))),
		).toBe(true);
		expect(readFileSync(sidecarPath, "utf8")).toContain("Fix the login bug");
	});

	it("skips a truncated last line and keeps the rest readable", () => {
		const root = createSessionsRoot();
		const sidecarPath = writeGrokSession(root, "truncated", {
			id: "truncated-session",
			title: "Partial write",
			body: [
				JSON.stringify({
					type: "user",
					prompt_index: 0,
					content: [{ type: "text", text: "<user_query>\nKeep this turn.\n</user_query>" }],
				}),
				JSON.stringify({
					type: "assistant",
					content: "Still readable.",
					model_id: "grok-code",
				}),
				'{"type":"assistant","content":"cut off mid',
			].join("\n"),
		});

		const { history } = createReader(root).read(sidecarPath);
		expect(history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({ role: "user", content: "Keep this turn." }),
				}),
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "assistant",
						content: expect.arrayContaining([expect.objectContaining({ text: "Still readable." })]),
					}),
				}),
				expect.objectContaining({
					type: "custom_marker",
					customType: SKIPPED_TRUNCATED_LINES_MARKER_TYPE,
					details: { count: 1 },
				}),
			]),
		);
		expect(JSON.stringify(history)).not.toContain("cut off mid");
	});

	it("marks a folded tool as failed from the tool result", () => {
		const root = createSessionsRoot();
		const sidecarPath = writeGrokSession(root, "failed-tool", {
			id: "failed-tool",
			title: "Failed search",
			body: [
				JSON.stringify({
					type: "user",
					prompt_index: 0,
					content: [{ type: "text", text: "<user_query>\nSearch tests.\n</user_query>" }],
				}),
				JSON.stringify({
					type: "assistant",
					content: "",
					tool_calls: [
						{
							id: "call_read_1",
							name: "Read",
							arguments: JSON.stringify({ path: "/tmp/missing.test.ts" }),
						},
					],
				}),
				JSON.stringify({
					type: "tool_result",
					tool_call_id: "call_read_1",
					content: "exit: 2\nNo such file",
				}),
			].join("\n"),
		});

		const { history } = createReader(root).read(sidecarPath);
		expect(history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "assistant",
						content: [
							expect.objectContaining({
								type: "toolCall",
								name: "Read",
								arguments: { path: "/tmp/missing.test.ts" },
							}),
						],
					}),
				}),
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "toolResult",
						toolCallId: "call_read_1",
						isError: true,
						content: [],
					}),
				}),
			]),
		);
		expect(JSON.stringify(history)).not.toContain("No such file");
	});

	it("leaves a tool without a result pending instead of inventing success", () => {
		const root = createSessionsRoot();
		const sidecarPath = writeGrokSession(root, "pending-tool", {
			id: "pending-tool",
			title: "Still running",
			body: [
				JSON.stringify({
					type: "user",
					prompt_index: 0,
					content: [{ type: "text", text: "<user_query>\nSearch tests.\n</user_query>" }],
				}),
				JSON.stringify({
					type: "assistant",
					content: "",
					tool_calls: [
						{
							id: "call_pending_1",
							name: "bash",
							arguments: JSON.stringify({ command: "rg pending" }),
						},
					],
				}),
			].join("\n"),
		});

		const { history } = createReader(root).read(sidecarPath);
		expect(history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "assistant",
						content: [
							expect.objectContaining({
								type: "toolCall",
								name: "bash",
								arguments: { command: "rg pending" },
							}),
						],
					}),
				}),
			]),
		);
		expect(history.some((entry) => entry.type === "message" && entry.message.role === "toolResult")).toBe(false);
	});

	it("refuses to guess when the sidecar header is corrupted", () => {
		const root = createSessionsRoot();
		const sidecarPath = writeRawSidecar(root, "broken", '{\n  "info": {\n    "id": "broken"');
		writeFileSync(
			join(sidecarPath, "..", GROK_CONVERSATION_BODY_NAME),
			`${JSON.stringify({
				type: "user",
				prompt_index: 0,
				content: [{ type: "text", text: "Should not be recovered." }],
			})}\n`,
		);

		const reader = createReader(root);
		expect(reader.canRead(sidecarPath)).toBe(true);
		expect(() => reader.read(sidecarPath)).toThrow(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.corrupted_header);
		expect(reads.filter((path) => basename(path) === GROK_CONVERSATION_BODY_NAME)).toEqual([]);
	});

	it("refuses unsupported sidecar versions without reading the body", () => {
		const root = createSessionsRoot();
		const sidecarPath = writeGrokSession(root, "future", {
			id: "future-session",
			title: "New format",
			version: 99,
			body: `${JSON.stringify({ type: "user", content: "hidden" })}\n`,
		});

		const reader = createReader(root);
		expect(reader.canRead(sidecarPath)).toBe(true);
		expect(() => reader.read(sidecarPath)).toThrow(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.unsupported_version);
		expect(reads.filter((path) => basename(path) === GROK_CONVERSATION_BODY_NAME)).toEqual([]);
	});

	function createReader(root: string) {
		return createCodingAgentExternalSessionFileHistoryReader(createTestHost(root, reads));
	}

	function createSessionsRoot(): string {
		const directory = mkdtempSync(join(tmpdir(), "vetta-external-history-"));
		temporaryDirectories.push(directory);
		mkdirSync(join(directory, "demo"));
		return directory;
	}
});

function writeGrokSession(
	root: string,
	name: string,
	input: { id: string; title: string; version?: number; body?: string },
): string {
	const sidecarPath = writeRawSidecar(
		root,
		name,
		`${JSON.stringify(
			{
				info: { id: input.id, cwd: "/workspace/demo" },
				chat_format_version: input.version ?? 1,
				generated_title: input.title,
				git_root_dir: "/workspace/demo",
				last_active_at: RECENT,
			},
			null,
			2,
		)}\n`,
	);
	if (input.body !== undefined) {
		writeFileSync(
			join(sidecarPath, "..", GROK_CONVERSATION_BODY_NAME),
			input.body.endsWith("\n") ? input.body : `${input.body}\n`,
		);
	}
	return sidecarPath;
}

function writeRawSidecar(root: string, name: string, contents: string): string {
	const sessionDir = join(root, "demo", name);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(join(sessionDir, GROK_CONVERSATION_BODY_NAME), '{"type":"user","content":""}\n');
	const sidecarPath = join(sessionDir, GROK_SUMMARY_SIDECAR_NAME);
	writeFileSync(sidecarPath, contents);
	return sidecarPath;
}

function createTestHost(sessionsDirectory: string, reads: string[]): ExternalSessionFileHost {
	return {
		resolveSessionRoots: () => (sessionsDirectory ? [{ tool: GROK_TOOL_ID, path: sessionsDirectory }] : []),
		join: (...parts) => join(...parts),
		basename,
		exists: existsSync,
		readText(path) {
			reads.push(path);
			return readFileSync(path, "utf8");
		},
		readPrefixLines(path, maxLines) {
			reads.push(path);
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
			const info = await stat(path);
			return { mtimeMs: info.mtimeMs, size: info.size };
		},
		samePath: (left, right) => left === right,
	};
}

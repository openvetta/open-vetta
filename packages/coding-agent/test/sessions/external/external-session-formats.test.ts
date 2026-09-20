import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	CLAUDE_CODE_TOOL_ID,
	CODEX_TOOL_ID,
	CURSOR_AGENT_TOOL_ID,
	createCodingAgentExternalSessionCatalog,
	createCodingAgentExternalSessionFileHistoryReader,
	EXTERNAL_ORIGIN_MARKER_TYPE,
	type ExternalSessionFileHost,
	GROK_TOOL_ID,
	OMP_TOOL_ID,
	PI_TOOL_ID,
} from "../../../src/public-api/external-sessions.js";
import { EXTERNAL_SESSION_LIST_CONCURRENCY } from "../../../src/sessions/external/catalog.js";

const NOW = Date.parse("2026-09-18T00:00:00.000Z");
const RECENT = "2026-09-10T12:00:00.000Z";

describe("external session formats", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("lists Claude Code, Codex, Cursor Agent, Pi, and omp sessions with origin", async () => {
		const root = createRoot();
		const claudePath = writeClaudeSession(join(root, "claude"));
		const codexPath = writeCodexSession(join(root, "codex"));
		const cursorPath = writeCursorSession(join(root, "cursor"));
		const piPath = writePiSession(join(root, "pi"));
		const ompPath = writeOmpSession(join(root, "omp"));
		const catalog = createCodingAgentExternalSessionCatalog(
			createTestHost([
				{ tool: CLAUDE_CODE_TOOL_ID, path: join(root, "claude") },
				{ tool: CODEX_TOOL_ID, path: join(root, "codex") },
				{ tool: CURSOR_AGENT_TOOL_ID, path: join(root, "cursor") },
				{ tool: PI_TOOL_ID, path: join(root, "pi") },
				{ tool: OMP_TOOL_ID, path: join(root, "omp") },
			]),
			{ now: () => NOW },
		);

		const sessions = await catalog.listSessions(join(root, "claude"));
		expect(sessions.map((session) => session.origin)).toEqual(
			expect.arrayContaining([
				{ tool: CLAUDE_CODE_TOOL_ID, path: claudePath },
				{ tool: CODEX_TOOL_ID, path: codexPath },
				{ tool: CURSOR_AGENT_TOOL_ID, path: cursorPath },
				{ tool: PI_TOOL_ID, path: piPath },
				{ tool: OMP_TOOL_ID, path: ompPath },
			]),
		);
	});

	it("does not list an unrelated jsonl in a Claude Code root as an available session", async () => {
		const root = createRoot();
		const claudeRoot = join(root, "claude");
		const claudePath = writeClaudeSession(claudeRoot);
		const junkPath = join(claudeRoot, "notes.jsonl");
		writeFileSync(junkPath, `${JSON.stringify({ note: "not a Claude session" })}\n`);
		const catalog = createCodingAgentExternalSessionCatalog(
			createTestHost([{ tool: CLAUDE_CODE_TOOL_ID, path: claudeRoot }]),
			{ now: () => NOW },
		);

		const sessions = await catalog.listSessions(claudeRoot);
		expect(sessions.map((session) => session.path)).toEqual([claudePath]);
		expect(sessions.every((session) => session.unavailableReason === undefined)).toBe(true);
	});

	it("lists a Cursor Agent session with the decoded project cwd", async () => {
		const root = createRoot();
		const projectCwd = join(root, "workspace", "open-vetta");
		mkdirSync(projectCwd, { recursive: true });
		const cursorRoot = join(root, "cursor");
		const encoded = projectCwd.replace(/^\//, "").replaceAll("/", "-");
		const transcriptDir = join(cursorRoot, encoded, "agent-transcripts");
		mkdirSync(transcriptDir, { recursive: true });
		const path = join(transcriptDir, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jsonl");
		writeFileSync(
			path,
			[
				JSON.stringify({
					role: "user",
					message: { content: [{ type: "text", text: "<user_query>\nHello from cursor-agent.\n</user_query>" }] },
				}),
				JSON.stringify({
					role: "assistant",
					message: { content: [{ type: "text", text: "Hi." }] },
				}),
			].join("\n"),
		);
		const catalog = createCodingAgentExternalSessionCatalog(
			createTestHost([{ tool: CURSOR_AGENT_TOOL_ID, path: cursorRoot }]),
			{ now: () => NOW },
		);

		const sessions = await catalog.listSessions(cursorRoot);
		expect(sessions).toEqual([
			expect.objectContaining({
				path,
				cwd: projectCwd,
				origin: { tool: CURSOR_AGENT_TOOL_ID, path },
			}),
		]);
	});

	it("does not stat every Claude Code transcript at once when listing", async () => {
		const root = createRoot();
		const claudeRoot = join(root, "claude");
		const project = join(claudeRoot, "demo-project");
		mkdirSync(project, { recursive: true });
		const count = EXTERNAL_SESSION_LIST_CONCURRENCY + 8;
		for (let index = 0; index < count; index += 1) {
			const sessionId = `11111111-1111-1111-1111-${String(index).padStart(12, "0")}`;
			writeFileSync(
				join(project, `${sessionId}.jsonl`),
				`${JSON.stringify({
					type: "user",
					sessionId,
					timestamp: RECENT,
					message: { role: "user", content: "Hi" },
				})}\n`,
			);
		}
		let inFlight = 0;
		let maxInFlight = 0;
		const base = createTestHost([{ tool: CLAUDE_CODE_TOOL_ID, path: claudeRoot }]);
		const host: ExternalSessionFileHost = {
			...base,
			statModifiedAt: async (path) => {
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				try {
					await Promise.resolve();
					return await base.statModifiedAt(path);
				} finally {
					inFlight -= 1;
				}
			},
		};
		const catalog = createCodingAgentExternalSessionCatalog(host, { now: () => NOW });
		const sessions = await catalog.listSessions(claudeRoot);
		expect(sessions).toHaveLength(count);
		expect(maxInFlight).toBeGreaterThan(0);
		expect(maxInFlight).toBeLessThanOrEqual(EXTERNAL_SESSION_LIST_CONCURRENCY);
	});

	it("lists a Cursor Agent session with a Windows drive-letter cwd", async () => {
		const root = createRoot();
		const windowsCwd = "C:\\Users\\ada\\src\\app";
		const cursorRoot = join(root, "cursor");
		const transcriptDir = join(cursorRoot, "C-Users-ada-src-app", "agent-transcripts");
		mkdirSync(transcriptDir, { recursive: true });
		const path = join(transcriptDir, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jsonl");
		writeFileSync(
			path,
			[
				JSON.stringify({
					role: "user",
					message: { content: [{ type: "text", text: "<user_query>\nHello from cursor-agent.\n</user_query>" }] },
				}),
				JSON.stringify({
					role: "assistant",
					message: { content: [{ type: "text", text: "Hi." }] },
				}),
			].join("\n"),
		);
		const windowsPrefixes = new Set([
			"C:",
			"C:\\Users",
			"C:\\Users\\ada",
			"C:\\Users\\ada\\src",
			"C:\\Users\\ada\\src\\app",
		]);
		const base = createTestHost([{ tool: CURSOR_AGENT_TOOL_ID, path: cursorRoot }]);
		const host: ExternalSessionFileHost = {
			...base,
			exists: (candidate) => windowsPrefixes.has(candidate) || base.exists(candidate),
		};
		const catalog = createCodingAgentExternalSessionCatalog(host, { now: () => NOW });
		const sessions = await catalog.listSessions(cursorRoot);
		expect(sessions).toEqual([
			expect.objectContaining({
				path,
				cwd: windowsCwd,
				origin: { tool: CURSOR_AGENT_TOOL_ID, path },
			}),
		]);
	});

	it("projects Claude Code user text, omitted thinking, and folded tools", () => {
		const root = createRoot();
		const path = writeClaudeSession(join(root, "claude"));
		const reader = createCodingAgentExternalSessionFileHistoryReader(
			createTestHost([{ tool: CLAUDE_CODE_TOOL_ID, path: join(root, "claude") }]),
		);
		const { history } = reader.read(path);
		expect(history[0]).toMatchObject({
			type: "custom_marker",
			customType: EXTERNAL_ORIGIN_MARKER_TYPE,
			details: { tool: CLAUDE_CODE_TOOL_ID },
		});
		expect(history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({ role: "user", content: "Fix the login bug." }),
				}),
				expect.objectContaining({
					type: "custom_marker",
					customType: "omitted_reasoning",
					details: { count: 1 },
				}),
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({
						role: "assistant",
						content: expect.arrayContaining([expect.objectContaining({ type: "toolCall", name: "Read" })]),
					}),
				}),
			]),
		);
		expect(JSON.stringify(history)).not.toContain("secret reasoning");
		expect(JSON.stringify(history)).not.toContain("file contents");
	});

	it("does not treat a Grok-only host as owning Claude files", async () => {
		const root = createRoot();
		writeClaudeSession(join(root, "claude"));
		const catalog = createCodingAgentExternalSessionCatalog(
			createTestHost([{ tool: GROK_TOOL_ID, path: join(root, "grok") }]),
			{ now: () => NOW },
		);
		expect(await catalog.listSessions(join(root, "claude"))).toEqual([]);
	});

	function createRoot(): string {
		const root = mkdtempSync(join(tmpdir(), "vetta-external-formats-"));
		temporaryDirectories.push(root);
		return root;
	}
});

function writeClaudeSession(root: string): string {
	const project = join(root, "demo-project");
	mkdirSync(project, { recursive: true });
	const path = join(project, "11111111-1111-1111-1111-111111111111.jsonl");
	writeFileSync(
		path,
		[
			JSON.stringify({
				type: "user",
				sessionId: "11111111-1111-1111-1111-111111111111",
				cwd: "/workspace/demo",
				timestamp: RECENT,
				message: { role: "user", content: "Fix the login bug." },
			}),
			JSON.stringify({
				type: "assistant",
				sessionId: "11111111-1111-1111-1111-111111111111",
				timestamp: RECENT,
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "secret reasoning" },
						{ type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "src/auth.ts" } },
					],
				},
			}),
			JSON.stringify({
				type: "user",
				sessionId: "11111111-1111-1111-1111-111111111111",
				timestamp: RECENT,
				message: {
					role: "user",
					content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "file contents" }],
				},
			}),
		].join("\n"),
	);
	return path;
}

function writeCodexSession(root: string): string {
	const dir = join(root, "2026", "09", "10");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "rollout-2026-09-10T12-00-00-aaaa.jsonl");
	writeFileSync(
		path,
		[
			JSON.stringify({
				type: "session_meta",
				timestamp: RECENT,
				payload: { id: "codex-1", cwd: "/workspace/codex", timestamp: RECENT },
			}),
			JSON.stringify({
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "text", text: "Review the patch." }],
				},
			}),
		].join("\n"),
	);
	return path;
}

function writeCursorSession(root: string): string {
	const dir = join(root, "Users-demo", "agent-transcripts", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jsonl");
	writeFileSync(
		path,
		[
			JSON.stringify({
				role: "user",
				message: { content: [{ type: "text", text: "<user_query>\nHello from cursor-agent.\n</user_query>" }] },
			}),
			JSON.stringify({
				role: "assistant",
				message: { content: [{ type: "text", text: "Hi." }] },
			}),
		].join("\n"),
	);
	return path;
}

function writePiSession(root: string): string {
	const dir = join(root, "--workspace-demo--");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "2026-09-10T12-00-00Z_pi-session.jsonl");
	writeFileSync(
		path,
		[
			JSON.stringify({
				type: "session",
				version: 3,
				id: "pi-session",
				timestamp: RECENT,
				cwd: "/workspace/pi",
			}),
			JSON.stringify({
				type: "message",
				message: { role: "user", content: [{ type: "text", text: "Run the tests." }] },
			}),
		].join("\n"),
	);
	return path;
}

function writeOmpSession(root: string): string {
	const dir = join(root, "-workspace-omp");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "2026-09-10T12-00-00Z_omp-session.jsonl");
	writeFileSync(
		path,
		[
			JSON.stringify({ type: "title", v: 1, title: "Add the settings page", updatedAt: RECENT }),
			JSON.stringify({
				type: "session",
				version: 3,
				id: "omp-session",
				timestamp: RECENT,
				cwd: "/workspace/omp",
				title: "Add the settings page",
			}),
			JSON.stringify({
				type: "message",
				message: { role: "user", content: [{ type: "text", text: "Add the settings page." }] },
			}),
		].join("\n"),
	);
	return path;
}

function createTestHost(roots: readonly { tool: string; path: string }[]): ExternalSessionFileHost {
	return {
		resolveSessionRoots: () => roots,
		join: (...parts) => join(...parts),
		basename,
		exists: (path) => {
			try {
				return existsSync(path);
			} catch {
				return false;
			}
		},
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
			const info = await stat(path);
			return { mtimeMs: info.mtimeMs, size: info.size };
		},
		samePath: (left, right) => left === right,
	};
}

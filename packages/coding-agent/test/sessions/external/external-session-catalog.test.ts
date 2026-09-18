import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CatalogRoutedRuntimeSessionAccessResolver } from "@vetta/runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCodingAgentExternalSessionCatalog,
	EXTERNAL_READONLY_SESSION_ACCESS,
	type ExternalSessionFileHost,
	GROK_CONVERSATION_BODY_NAME,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_TOOL_ID,
} from "../../../src/public-api/external-sessions.js";

const NOW = Date.parse("2026-09-18T00:00:00.000Z");
const RECENT = "2026-09-10T12:00:00.000Z";
const OLD = "2026-07-01T12:00:00.000Z";

describe("external session catalog public entry", () => {
	const temporaryDirectories: string[] = [];
	const reads: string[] = [];

	afterEach(() => {
		reads.length = 0;
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("projects recent Grok sidecars with origin and read-only access", async () => {
		const root = createSessionsRoot();
		const recentPath = writeGrokSession(root, "recent", {
			id: "recent-session",
			title: "Fix the login bug",
			lastActiveAt: RECENT,
			cwd: "/workspace/demo",
		});
		writeGrokSession(root, "old", { id: "old-session", title: "Ancient work", lastActiveAt: OLD });

		const catalog = createCatalog(root);
		const sessions = await catalog.listSessions(root);
		expect(sessions).toHaveLength(1);
		expect(sessions[0]).toMatchObject({
			id: "recent-session",
			name: "Fix the login bug",
			firstMessage: "Fix the login bug",
			cwd: "/workspace/demo",
			path: recentPath,
			modifiedAt: Date.parse(RECENT),
			origin: { tool: GROK_TOOL_ID, path: recentPath },
		});
		expect(sessions[0]?.origin).not.toHaveProperty("importedAt");
		expect(await catalog.listProjects()).toEqual([]);
		expect(await catalog.ownsSession(recentPath)).toBe(true);
		expect(await catalog.ownsSession(join(root, "demo", "recent", GROK_CONVERSATION_BODY_NAME))).toBe(false);

		const access = await new CatalogRoutedRuntimeSessionAccessResolver([
			{ catalog, access: EXTERNAL_READONLY_SESSION_ACCESS },
		]).resolve(recentPath);
		expect(access).toEqual(EXTERNAL_READONLY_SESSION_ACCESS);
		expect(reads.every((path) => basename(path) === GROK_SUMMARY_SIDECAR_NAME)).toBe(true);
	});

	it("finds a structural Grok header after the first line", async () => {
		const root = createSessionsRoot();
		const sidecarPath = writeRawSidecar(
			root,
			"shifted",
			['{"type":"title","text":"ignored"}', grokSummaryLine({ id: "shifted-session", title: "Header later" })].join(
				"\n",
			),
		);
		const catalog = createCatalog(root);
		expect(await catalog.ownsSession(sidecarPath)).toBe(true);
		expect(await catalog.listSessions(root)).toMatchObject([{ id: "shifted-session", name: "Header later" }]);
	});

	it("keeps unsupported and corrupted sidecars visible with a capped failure list", async () => {
		const root = createSessionsRoot();
		writeGrokSession(root, "ok", { id: "ok-session", title: "Still works" });
		writeGrokSession(root, "future", { id: "future-session", title: "New format", version: 99 });
		writeRawSidecar(root, "broken", '{\n  "info": {\n    "id": "broken"');
		for (let index = 0; index < 7; index += 1) {
			const noisePath = writeRawSidecar(
				root,
				`noise-${index}`,
				`{"chat_format_version":"nope","generated_title":"bad ${index}"}`,
			);
			const older = Date.parse("2026-09-01T00:00:00.000Z") / 1000;
			utimesSync(noisePath, older, older);
		}

		const catalog = createCatalog(root);
		const sessions = await catalog.listSessions(root);
		const available = sessions.filter((session) => !session.unavailableReason);
		const unavailable = sessions.filter((session) => session.unavailableReason);
		expect(available).toMatchObject([{ id: "ok-session" }]);
		expect(unavailable.some((session) => session.unavailableReason === "unsupported_version")).toBe(true);
		expect(unavailable.some((session) => session.unavailableReason === "corrupted_header")).toBe(true);
		expect(unavailable).toHaveLength(8);
		expect(await catalog.ownsSession(join(root, "demo", "future", GROK_SUMMARY_SIDECAR_NAME))).toBe(false);
	});

	it("does not list another directory as Grok sessions", async () => {
		const root = createSessionsRoot();
		writeGrokSession(root, "ok", { id: "ok-session", title: "Hidden from other cwd" });
		const catalog = createCatalog(root);
		expect(await catalog.listSessions("/other/project")).toEqual([]);
	});

	it("refuses rename and delete so the catalog cannot write back", async () => {
		const root = createSessionsRoot();
		const sidecarPath = writeGrokSession(root, "ok", { id: "ok-session", title: "Leave me" });
		const catalog = createCatalog(root);
		await expect(catalog.renameSession(sidecarPath, "nope")).rejects.toThrow(/read-only/i);
		await expect(catalog.deleteSessionArtifacts(sidecarPath)).rejects.toThrow(/read-only/i);
		expect(readFileSync(sidecarPath, "utf8")).toContain("Leave me");
	});

	function createCatalog(root: string) {
		return createCodingAgentExternalSessionCatalog(createTestHost(root, reads), { now: () => NOW });
	}

	function createSessionsRoot(): string {
		const directory = mkdtempSync(join(tmpdir(), "vetta-external-sessions-"));
		temporaryDirectories.push(directory);
		mkdirSync(join(directory, "demo"));
		return directory;
	}
});

function writeGrokSession(
	root: string,
	name: string,
	input: { id: string; title: string; lastActiveAt?: string; cwd?: string; version?: number },
): string {
	return writeRawSidecar(root, name, grokSummaryDocument(input));
}

function writeRawSidecar(root: string, name: string, contents: string): string {
	const sessionDir = join(root, "demo", name);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(join(sessionDir, GROK_CONVERSATION_BODY_NAME), '{"role":"user"}\n');
	const sidecarPath = join(sessionDir, GROK_SUMMARY_SIDECAR_NAME);
	writeFileSync(sidecarPath, contents);
	return sidecarPath;
}

function grokSummaryDocument(input: {
	id: string;
	title: string;
	lastActiveAt?: string;
	cwd?: string;
	version?: number;
}): string {
	return `${JSON.stringify(
		{
			info: { id: input.id, cwd: input.cwd ?? "/workspace/demo" },
			agent_id: "agent",
			attempt_id: "attempt",
			session_summary: "Sanitized summary.",
			created_at: input.lastActiveAt ?? RECENT,
			updated_at: input.lastActiveAt ?? RECENT,
			num_messages: 2,
			num_chat_messages: 2,
			current_model_id: "grok-code",
			next_trace_turn: 1,
			chat_format_version: input.version ?? 1,
			git_root_dir: input.cwd ?? "/workspace/demo",
			git_remotes: [],
			head_commit: "deadbeef",
			head_branch: "main",
			request_id: "req",
			grok_home: "/tmp/grok-home",
			last_active_at: input.lastActiveAt ?? RECENT,
			generated_title: input.title,
			agent_name: "Grok",
			sandbox_profile: "default",
			reasoning_effort: "low",
		},
		null,
		2,
	)}\n`;
}

function grokSummaryLine(input: { id: string; title: string }): string {
	return JSON.stringify({
		info: { id: input.id, cwd: "/workspace/demo" },
		chat_format_version: 1,
		generated_title: input.title,
		git_root_dir: "/workspace/demo",
		last_active_at: RECENT,
	});
}

function createTestHost(sessionsDirectory: string, reads: string[]): ExternalSessionFileHost {
	return {
		resolveSessionsDirectory: () => sessionsDirectory,
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

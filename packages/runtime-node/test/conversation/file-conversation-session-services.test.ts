import { existsSync } from "node:fs";
import { appendFile, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessageAppendedEvent, TurnCompletedEvent, TurnStartedEvent } from "@vetta/runtime-core/kernel";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ConversationOwnershipConflictError,
	FileConversationOwnershipManager,
	FileConversationRepository,
	FileConversationRuntimeSessionCatalog,
	FileConversationRuntimeSessionFileHistoryReader,
} from "../../src/conversation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Greenfield runtime session services", () => {
	it("keeps sidebar ordering based on message activity when a session file is touched while opening", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "older", createdAt: 10, cwd });
		await repository.append("older", 0, [
			started("older", 100),
			userMessage("older", "older question", 110),
			assistantMessage("older", "older answer", 120),
			completed("older", 130),
		]);
		await repository.create({ sessionId: "newer", createdAt: 20, cwd });
		await repository.append("newer", 0, [
			started("newer", 200),
			userMessage("newer", "newer question", 210),
			assistantMessage("newer", "newer answer", 220),
			completed("newer", 230),
		]);
		const olderPath = repository.resolveConversationPath("older");
		await repository.close();

		// Import/resume may rewrite or touch the file without adding a new message. That
		// storage detail must not make a merely opened conversation look newly active.
		const touchedAt = new Date("2030-01-01T00:00:00.000Z");
		await utimes(olderPath, touchedAt, touchedAt);

		const catalog = new FileConversationRuntimeSessionCatalog();
		const sessions = await catalog.listSessions(cwd, rootDir);

		expect(sessions.map(({ id, modifiedAt }) => ({ id, modifiedAt }))).toEqual([
			{ id: "newer", modifiedAt: 220 },
			{ id: "older", modifiedAt: 120 },
		]);
	});

	it("falls back to file modification time when a session has no conversation messages", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "empty", createdAt: 10, cwd });
		const sessionPath = repository.resolveConversationPath("empty");
		await repository.close();
		const touchedAt = new Date("2026-08-27T12:00:00.000Z");
		await utimes(sessionPath, touchedAt, touchedAt);

		const catalog = new FileConversationRuntimeSessionCatalog();
		const [session] = await catalog.listSessions(cwd, rootDir);

		expect(session?.modifiedAt).toBe(touchedAt.getTime());
	});

	it("reuses a parsed session summary until the file changes, then re-reads it", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "cached", createdAt: 10, cwd });
		await repository.append("cached", 0, [started("cached", 100), userMessage("cached", "alpha question", 110)]);
		const sessionPath = repository.resolveConversationPath("cached");
		await repository.close();
		// 固定到整秒，后面才能把修改时间原样还原（文件系统的亚毫秒精度经 utimes 会丢失）。
		const pinned = new Date("2030-01-01T00:00:00.000Z");
		await utimes(sessionPath, pinned, pinned);
		const catalog = new FileConversationRuntimeSessionCatalog();
		expect((await catalog.listSessions(cwd, rootDir))[0]?.firstMessage).toBe("alpha question");

		// 同样大小、同样修改时间的改写：摘要直接复用缓存，不重新解析文件。
		const original = await readFile(sessionPath, "utf8");
		await writeFile(sessionPath, original.replace("alpha question", "bravo question"));
		await utimes(sessionPath, pinned, pinned);
		expect((await catalog.listSessions(cwd, rootDir))[0]?.firstMessage).toBe("alpha question");

		// 内容变长（大小变化）：缓存失效，读到最新内容。
		await writeFile(sessionPath, original.replace("alpha question", "charlie question"));
		await utimes(sessionPath, pinned, pinned);
		expect((await catalog.listSessions(cwd, rootDir))[0]?.firstMessage).toBe("charlie question");
	});

	it("lists, reads, renames and deletes conversation artifacts without exposing storage details", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		const sessionId = "greenfield/session";
		await repository.create({ sessionId, createdAt: 100, agentId: "reviewer" });
		await repository.append(sessionId, 0, [
			started(sessionId),
			userMessage(sessionId, "hello"),
			assistantMessage(sessionId, "world"),
			completed(sessionId),
		]);
		const stored = await repository.load(sessionId);
		await repository.saveSnapshot(sessionId, {
			sessionId,
			version: stored.version,
			messages: stored.messages,
			createdAt: 200,
		});
		const sessionPath = repository.resolveConversationPath(sessionId);
		const snapshotPath = sessionPath.replace(/\.conversation\.jsonl$/, ".snapshot.json");
		await repository.close();
		await writeFile(join(rootDir, "corrupt.conversation.jsonl"), "not-json\n", "utf8");

		const catalog = new FileConversationRuntimeSessionCatalog({
			roots: [{ cwd, sessionDir: rootDir }],
			artifactCleaner: {
				deleteSessionArtifacts: vi.fn(async (deletedSessionId) => {
					expect(deletedSessionId).toBe(sessionId);
				}),
			},
		});
		const reader = new FileConversationRuntimeSessionFileHistoryReader();

		expect(await catalog.listProjects()).toEqual([{ cwd, sessionCount: 1 }]);
		expect(await catalog.listSessions(cwd, rootDir)).toEqual([
			expect.objectContaining({
				id: sessionId,
				path: sessionPath,
				agentId: "reviewer",
				cwd,
				firstMessage: "hello",
				lastMessagePreview: "world",
			}),
		]);
		expect(await catalog.ownsSession(sessionPath)).toBe(true);
		expect(reader.canRead(sessionPath)).toBe(true);
		expect(reader.read(sessionPath).history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({ role: "user", content: "hello" }),
				}),
			]),
		);

		await catalog.renameSession(sessionPath, "renamed");
		expect((await catalog.listSessions(cwd, rootDir))[0]?.name).toBe("renamed");

		await catalog.deleteSessionArtifacts(sessionPath);
		expect(existsSync(sessionPath)).toBe(false);
		expect(existsSync(`${sessionPath}.lock`)).toBe(false);
		expect(existsSync(`${sessionPath}.owner.lock`)).toBe(false);
		expect(existsSync(snapshotPath)).toBe(false);
	});

	it("reads only appended records of a watched session and keeps the history identity while unchanged", async () => {
		const rootDir = await createTemporaryRoot();
		const sessionId = "watched";
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId, createdAt: 10 });
		const first = await repository.append(sessionId, 0, [
			started(sessionId, 100),
			userMessage(sessionId, "first question", 110),
			assistantMessage(sessionId, "first answer", 120),
			completed(sessionId, 130),
		]);
		const sessionPath = repository.resolveConversationPath(sessionId);
		const firstText = await readFile(sessionPath, "utf8");
		await repository.append(sessionId, first.version, [
			{ ...started(sessionId, 200), turnId: "turn-2" },
			{ ...userMessage(sessionId, "second question", 210), turnId: "turn-2" },
			{ ...assistantMessage(sessionId, "second answer", 220), turnId: "turn-2" },
			{ ...completed(sessionId, 230), turnId: "turn-2" },
		]);
		await repository.close();
		const fullText = await readFile(sessionPath, "utf8");
		const expected = new FileConversationRuntimeSessionFileHistoryReader().read(sessionPath).history;
		const appended = fullText.slice(firstText.length);
		const cut = Math.floor(appended.indexOf("\n") / 2);

		await writeFile(sessionPath, firstText, "utf8");
		const reader = new FileConversationRuntimeSessionFileHistoryReader();
		const initial = reader.read(sessionPath).history;
		expect(reader.read(sessionPath).history).toBe(initial);

		// A writer caught mid-record: the half line is not parsed yet.
		await appendFile(sessionPath, appended.slice(0, cut), "utf8");
		expect(reader.read(sessionPath).history).toBe(initial);

		await appendFile(sessionPath, appended.slice(cut), "utf8");
		const grown = reader.read(sessionPath).history;
		expect(grown).not.toBe(initial);
		expect(grown).toEqual(expected);

		// Any rewrite other than an append falls back to a whole read.
		await writeFile(sessionPath, firstText, "utf8");
		expect(reader.read(sessionPath).history).toEqual(initial);
	});

	it("keeps the session file when auxiliary artifact cleanup fails so deletion can be retried", async () => {
		const rootDir = await createTemporaryRoot();
		const repository = new FileConversationRepository({ rootDir });
		const sessionId = "retryable-cleanup";
		await repository.create({ sessionId, createdAt: 100 });
		const sessionPath = repository.resolveConversationPath(sessionId);
		await repository.close();
		const catalog = new FileConversationRuntimeSessionCatalog({
			artifactCleaner: {
				deleteSessionArtifacts: async () => {
					throw new Error("artifact cleanup failed");
				},
			},
		});

		await expect(catalog.deleteSessionArtifacts(sessionPath)).rejects.toThrow("artifact cleanup failed");
		expect(existsSync(sessionPath)).toBe(true);
	});

	it("rejects lifecycle writes while another process-lifetime owner holds the conversation", async () => {
		const rootDir = await createTemporaryRoot();
		const repository = new FileConversationRepository({ rootDir });
		const sessionId = "owned-session";
		await repository.create({ sessionId, createdAt: 100 });
		const sessionPath = repository.resolveConversationPath(sessionId);
		await repository.close();

		const ownershipManager = new FileConversationOwnershipManager();
		const owner = await ownershipManager.acquire(sessionPath);
		const catalog = new FileConversationRuntimeSessionCatalog({ ownershipManager });
		try {
			await expect(catalog.renameSession(sessionPath, "blocked")).rejects.toBeInstanceOf(
				ConversationOwnershipConflictError,
			);
			await expect(catalog.deleteSessionArtifacts(sessionPath)).rejects.toBeInstanceOf(
				ConversationOwnershipConflictError,
			);
			expect(existsSync(sessionPath)).toBe(true);
		} finally {
			await owner.release();
		}

		await catalog.deleteSessionArtifacts(sessionPath);
		expect(existsSync(sessionPath)).toBe(false);
	});
});

async function createTemporaryRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-runtime-session-services-"));
	temporaryRoots.push(root);
	return root;
}

function started(sessionId: string, timestamp = 1): TurnStartedEvent {
	return {
		type: "turn.started",
		sessionId,
		turnId: "turn-1",
		snapshotId: "snapshot-1",
		timestamp,
	};
}

function userMessage(sessionId: string, text: string, timestamp = 2): MessageAppendedEvent {
	return {
		type: "message.appended",
		sessionId,
		turnId: "turn-1",
		message: { role: "user", content: text, timestamp },
		timestamp,
	};
}

function assistantMessage(sessionId: string, text: string, timestamp = 3): MessageAppendedEvent {
	return {
		type: "message.appended",
		sessionId,
		turnId: "turn-1",
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			api: "openai-responses",
			provider: "openai",
			model: "test-model",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp,
		},
		timestamp,
	};
}

function completed(sessionId: string, timestamp = 4): TurnCompletedEvent {
	return {
		type: "turn.completed",
		sessionId,
		turnId: "turn-1",
		stopReason: "stop",
		timestamp,
	};
}

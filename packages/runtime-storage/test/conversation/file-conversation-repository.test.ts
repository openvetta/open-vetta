import { appendFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ConversationSnapshot,
	MessageAppendedEvent,
	StoredSessionEvent,
	TurnCompletedEvent,
	TurnStartedEvent,
} from "@vetta/runtime-core/kernel";
import { afterEach, describe, expect, it } from "vitest";
import { CONVERSATION_STORAGE_ERROR_CODES, FileConversationRepository } from "../../src/conversation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRepository(): Promise<{
	readonly repository: FileConversationRepository;
	readonly rootDir: string;
}> {
	const rootDir = await mkdtemp(join(tmpdir(), "vetta-conversation-"));
	temporaryRoots.push(rootDir);
	return {
		repository: new FileConversationRepository({ rootDir }),
		rootDir,
	};
}

function started(sessionId: string, turnId: string): TurnStartedEvent {
	return {
		type: "turn.started",
		sessionId,
		turnId,
		snapshotId: "snapshot-1",
		timestamp: 1,
	};
}

function message(sessionId: string, turnId: string, text: string): MessageAppendedEvent {
	return {
		type: "message.appended",
		sessionId,
		turnId,
		message: {
			role: "user",
			content: text,
			timestamp: 2,
		},
		timestamp: 2,
	};
}

function completed(sessionId: string, turnId: string): TurnCompletedEvent {
	return {
		type: "turn.completed",
		sessionId,
		turnId,
		stopReason: "stop",
		timestamp: 3,
	};
}

describe("FileConversationRepository", () => {
	it("creates, appends and reloads a versioned conversation", async () => {
		const { repository } = await createRepository();
		await repository.create({
			sessionId: "session/with unsafe path",
			createdAt: 100,
		});
		const events: StoredSessionEvent[] = [
			started("session/with unsafe path", "turn-1"),
			message("session/with unsafe path", "turn-1", "hello"),
			completed("session/with unsafe path", "turn-1"),
		];

		const append = await repository.append("session/with unsafe path", 0, events);
		const conversation = await repository.load("session/with unsafe path");

		expect(append.version).toBe(3);
		expect(conversation).toMatchObject({
			sessionId: "session/with unsafe path",
			createdAt: 100,
			version: 3,
		});
		expect(conversation.messages).toHaveLength(1);
		expect(conversation.events.map(({ type }) => type)).toEqual([
			"turn.started",
			"message.appended",
			"turn.completed",
		]);
	});

	it("persists data across repository instances", async () => {
		const { repository, rootDir } = await createRepository();
		await repository.create({
			sessionId: "session-1",
			createdAt: 100,
		});
		await repository.append("session-1", 0, [
			started("session-1", "turn-1"),
			message("session-1", "turn-1", "persisted"),
		]);
		await repository.close();

		const reopened = new FileConversationRepository({ rootDir });
		const conversation = await reopened.load("session-1");

		expect(conversation.version).toBe(2);
		expect(conversation.messages[0]).toMatchObject({
			role: "user",
			content: "persisted",
		});
		await reopened.close();
	});

	it("allows only one concurrent writer for the same expected version", async () => {
		const { repository } = await createRepository();
		await repository.create({
			sessionId: "session-1",
			createdAt: 100,
		});

		const results = await Promise.allSettled([
			repository.append("session-1", 0, [started("session-1", "turn-1")]),
			repository.append("session-1", 0, [started("session-1", "turn-2")]),
		]);

		expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
		const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
		expect(rejected?.reason).toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
		});
		expect((await repository.load("session-1")).version).toBe(1);
	});

	it("rejects events belonging to another session without changing the version", async () => {
		const { repository } = await createRepository();
		await repository.create({
			sessionId: "session-1",
			createdAt: 100,
		});

		await expect(repository.append("session-1", 0, [started("session-2", "turn-1")])).rejects.toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.INVALID_EVENT,
		});
		expect((await repository.load("session-1")).version).toBe(0);
	});

	it("writes snapshots only at the current conversation version", async () => {
		const { repository, rootDir } = await createRepository();
		await repository.create({
			sessionId: "session-1",
			createdAt: 100,
		});
		await repository.append("session-1", 0, [started("session-1", "turn-1")]);
		const snapshot: ConversationSnapshot = {
			sessionId: "session-1",
			version: 1,
			messages: [],
			createdAt: 200,
		};

		await repository.saveSnapshot("session-1", snapshot);
		const snapshotFile = (await readdir(rootDir)).find((file) => file.endsWith(".snapshot.json"));
		expect(snapshotFile).toBeDefined();
		const stored = await readFile(join(rootDir, snapshotFile ?? ""), "utf8");
		expect(JSON.parse(stored)).toMatchObject({
			recordType: "conversation.snapshot",
			schemaVersion: 1,
			snapshot: {
				sessionId: "session-1",
				version: 1,
			},
		});

		await expect(
			repository.saveSnapshot("session-1", {
				...snapshot,
				version: 0,
			}),
		).rejects.toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
		});
	});

	it("detects an incomplete final record", async () => {
		const { repository, rootDir } = await createRepository();
		await repository.create({
			sessionId: "session-1",
			createdAt: 100,
		});
		const conversationFile = (await readdir(rootDir)).find((file) => file.endsWith(".conversation.jsonl"));
		expect(conversationFile).toBeDefined();
		await appendFile(join(rootDir, conversationFile ?? ""), '{"recordType":"conversation.event"', "utf8");

		await expect(repository.load("session-1")).rejects.toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
		});
	});

	it("rejects operations after close", async () => {
		const { repository } = await createRepository();
		await repository.create({
			sessionId: "session-1",
			createdAt: 100,
		});
		await repository.close();

		await expect(repository.load("session-1")).rejects.toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.CLOSED,
		});
	});
});

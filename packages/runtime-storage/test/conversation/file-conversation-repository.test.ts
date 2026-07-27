import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
		const { repository, rootDir } = await createRepository();
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
		const conversationFile = (await readdir(rootDir)).find((file) => file.endsWith(".conversation.jsonl"));
		expect(repository.resolveConversationPath("session/with unsafe path")).toBe(
			join(rootDir, conversationFile ?? ""),
		);
		const records = (await readFile(repository.resolveConversationPath("session/with unsafe path"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as unknown);
		expect(records).toMatchObject([
			{ recordType: "conversation.header", schemaVersion: 2 },
			{ recordType: "conversation.event", schemaVersion: 2, documentEntry: null },
			{
				recordType: "conversation.event",
				schemaVersion: 2,
				documentEntry: { id: "event-2", parentId: null },
			},
			{ recordType: "conversation.event", schemaVersion: 2, documentEntry: null },
		]);
		const document = await repository.readDocument("session/with unsafe path");
		expect(document).toMatchObject({
			revision: 3,
			activeLeafId: "event-2",
			entries: [{ id: "event-2", parentId: null, type: "message" }],
		});
	});

	it("reads existing v1 records without rewriting them", async () => {
		const { repository } = await createRepository();
		const sessionId = "legacy-native-v1";
		await repository.create({ sessionId, createdAt: 100 });
		await writeFile(
			repository.resolveConversationPath(sessionId),
			`${JSON.stringify({
				recordType: "conversation.header",
				schemaVersion: 1,
				sessionId,
				createdAt: 100,
			})}\n${JSON.stringify({
				recordType: "conversation.event",
				schemaVersion: 1,
				sequence: 1,
				event: message(sessionId, "turn-1", "v1 message"),
			})}\n`,
			"utf8",
		);

		expect((await repository.load(sessionId)).messages).toHaveLength(1);
		expect(await repository.readDocument(sessionId)).toMatchObject({
			revision: 1,
			activeLeafId: "event-1",
			entries: [{ id: "event-1", message: { content: "v1 message" } }],
		});
		await repository.append(sessionId, 1, [completed(sessionId, "turn-1")]);
		const stored = await readFile(repository.resolveConversationPath(sessionId), "utf8");
		expect(stored).not.toContain('"schemaVersion":2');
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

	it("rejects structurally invalid events at the repository boundary", async () => {
		const { repository } = await createRepository();
		await repository.create({
			sessionId: "session-1",
			createdAt: 100,
		});
		const invalidEvent = {
			...message("session-1", "turn-1", "hello"),
			message: {
				role: "unexpected",
				content: "invalid",
				timestamp: 2,
			},
		} as unknown as StoredSessionEvent;

		await expect(repository.append("session-1", 0, [invalidEvent])).rejects.toMatchObject({
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
			schemaVersion: 2,
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

	it("detects a complete JSON record with an invalid domain payload", async () => {
		const { repository, rootDir } = await createRepository();
		await repository.create({
			sessionId: "session-1",
			createdAt: 100,
		});
		const conversationFile = (await readdir(rootDir)).find((file) => file.endsWith(".conversation.jsonl"));
		expect(conversationFile).toBeDefined();
		await appendFile(
			join(rootDir, conversationFile ?? ""),
			`${JSON.stringify({
				recordType: "conversation.event",
				schemaVersion: 2,
				sequence: 1,
				documentEntry: null,
				event: {
					type: "turn.completed",
					sessionId: "session-1",
					turnId: "turn-1",
					stopReason: "invented",
					timestamp: 3,
				},
			})}\n`,
			"utf8",
		);

		await expect(repository.load("session-1")).rejects.toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
		});
	});

	it("rejects a v2 document entry whose parent is not present", async () => {
		const { repository } = await createRepository();
		await repository.create({ sessionId: "session-1", createdAt: 100 });
		await appendFile(
			repository.resolveConversationPath("session-1"),
			`${JSON.stringify({
				recordType: "conversation.event",
				schemaVersion: 2,
				sequence: 1,
				documentEntry: {
					id: "event-1",
					parentId: "missing",
					timestamp: "2026-01-01T00:00:00.000Z",
				},
				event: message("session-1", "turn-1", "hello"),
			})}\n`,
			"utf8",
		);

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

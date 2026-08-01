import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	CONVERSATION_STORAGE_ERROR_CODES,
	ConversationStorageError,
	FileConversationRepository,
	LegacySessionImportError,
	migrateLegacySessionToV2,
} from "../../src/conversation/index.js";

const temporaryRoots = new Set<string>();

afterEach(async () => {
	await Promise.all([...temporaryRoots].map((root) => rm(root, { force: true, recursive: true })));
	temporaryRoots.clear();
});

describe("legacy session migration", () => {
	it("publishes a validated V2 conversation without modifying the source", async () => {
		const root = await createTemporaryRoot();
		const sourcePath = join(root, "legacy.jsonl");
		const targetRootDir = join(root, "v2");
		const sourceContent = legacyJsonLines([
			legacyHeader("legacy-source"),
			legacyMessage("user-1", null, userMessage("legacy question", 1)),
			legacyMessage("assistant-1", "user-1", assistantMessage("legacy answer", 2)),
			{
				type: "session_info",
				id: "session-name",
				parentId: "assistant-1",
				timestamp: "2026-01-01T00:00:03.000Z",
				name: "Imported session",
			},
		]);
		await writeFile(sourcePath, sourceContent, "utf8");

		const result = await migrateLegacySessionToV2({
			sourcePath,
			targetRootDir,
			targetSessionId: "v2-target",
		});

		expect(result).toMatchObject({
			sourcePath,
			sourceSessionId: "legacy-source",
			sourceVersion: 3,
			targetSessionId: "v2-target",
		});
		expect(await readFile(sourcePath, "utf8")).toBe(sourceContent);
		const targetRecords = (await readFile(result.targetPath, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as unknown);
		expect(targetRecords).toEqual([
			expect.objectContaining({
				recordType: "conversation.header",
				schemaVersion: 2,
				sessionId: "v2-target",
				cwd: "C:/legacy-workspace",
			}),
			expect.objectContaining({
				recordType: "conversation.import.seed",
				schemaVersion: 2,
				source: {
					format: "coding-agent-jsonl",
					path: sourcePath,
					sessionId: "legacy-source",
					version: 3,
				},
			}),
		]);

		const repository = new FileConversationRepository({ rootDir: targetRootDir });
		const document = await repository.readDocument("v2-target");
		expect(document.identity).toEqual({
			sessionId: "v2-target",
			createdAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
			cwd: "C:/legacy-workspace",
			parentSessionPath: undefined,
			parentEntryId: undefined,
		});
		expect(document.entries.map(({ id }) => id)).toEqual(["user-1", "assistant-1", "session-name"]);
		expect(document.activeLeafId).toBe("session-name");
		expect(document.name).toBe("Imported session");
		await expect(repository.load("v2-target")).resolves.toMatchObject({
			sessionId: "v2-target",
			version: 0,
			messages: [userMessage("legacy question", 1), assistantMessage("legacy answer", 2)],
		});

		await repository.append("v2-target", 0, [
			{
				type: "turn.started",
				sessionId: "v2-target",
				turnId: "turn-1",
				snapshotId: "snapshot-1",
				timestamp: 10,
			},
			{
				type: "message.appended",
				sessionId: "v2-target",
				turnId: "turn-1",
				message: userMessage("continued question", 11),
				timestamp: 11,
			},
			{
				type: "turn.completed",
				sessionId: "v2-target",
				turnId: "turn-1",
				stopReason: "stop",
				timestamp: 12,
			},
		]);
		await expect(repository.load("v2-target")).resolves.toMatchObject({
			version: 3,
			messages: [
				userMessage("legacy question", 1),
				assistantMessage("legacy answer", 2),
				userMessage("continued question", 11),
			],
		});
		await repository.close();
	});

	it("fails closed when the target already exists and keeps both files unchanged", async () => {
		const root = await createTemporaryRoot();
		const sourcePath = join(root, "legacy.jsonl");
		const targetRootDir = join(root, "v2");
		const sourceContent = legacyJsonLines([
			legacyHeader("legacy-source"),
			legacyMessage("user-1", null, userMessage("hello", 1)),
		]);
		await writeFile(sourcePath, sourceContent, "utf8");
		const first = await migrateLegacySessionToV2({
			sourcePath,
			targetRootDir,
			targetSessionId: "stable-target",
		});
		const targetContent = await readFile(first.targetPath, "utf8");

		await expect(
			migrateLegacySessionToV2({
				sourcePath,
				targetRootDir,
				targetSessionId: "stable-target",
			}),
		).rejects.toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.ALREADY_EXISTS,
		});
		expect(await readFile(sourcePath, "utf8")).toBe(sourceContent);
		expect(await readFile(first.targetPath, "utf8")).toBe(targetContent);
	});

	it("reuses only an identical deterministic target", async () => {
		const root = await createTemporaryRoot();
		const sourcePath = join(root, "legacy.jsonl");
		const targetRootDir = join(root, "v2");
		const sourceContent = legacyJsonLines([
			legacyHeader("legacy-source"),
			legacyMessage("user-1", null, userMessage("hello", 1)),
		]);
		await writeFile(sourcePath, sourceContent, "utf8");
		const first = await migrateLegacySessionToV2({
			sourcePath,
			targetRootDir,
			targetSessionId: "stable-target",
			reuseIdenticalTarget: true,
		});

		const reused = await migrateLegacySessionToV2({
			sourcePath,
			targetRootDir,
			targetSessionId: "stable-target",
			reuseIdenticalTarget: true,
		});
		expect(first.created).toBe(true);
		expect(reused.created).toBe(false);

		await writeFile(
			sourcePath,
			legacyJsonLines([legacyHeader("legacy-source"), legacyMessage("user-1", null, userMessage("changed", 1))]),
			"utf8",
		);
		await expect(
			migrateLegacySessionToV2({
				sourcePath,
				targetRootDir,
				targetSessionId: "stable-target",
				reuseIdenticalTarget: true,
			}),
		).rejects.toMatchObject({ code: CONVERSATION_STORAGE_ERROR_CODES.ALREADY_EXISTS });
	});

	it("rejects entries outside the V2 schema before publishing a target", async () => {
		const root = await createTemporaryRoot();
		const sourcePath = join(root, "legacy.jsonl");
		const targetRootDir = join(root, "v2");
		await writeFile(
			sourcePath,
			legacyJsonLines([
				legacyHeader("unsupported-source"),
				legacyMessage("assistant-1", null, {
					role: "assistant",
					content: "extension-specific message",
					timestamp: 1,
				}),
			]),
			"utf8",
		);

		const migration = migrateLegacySessionToV2({
			sourcePath,
			targetRootDir,
			targetSessionId: "rejected-target",
		});
		await expect(migration).rejects.toBeInstanceOf(ConversationStorageError);
		await expect(migration).rejects.toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
		});
		const encodedTarget = Buffer.from("rejected-target", "utf8").toString("base64url");
		await expect(stat(join(targetRootDir, `${encodedTarget}.conversation.jsonl`))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it.each([
		{
			name: "malformed JSON",
			content: `${JSON.stringify(legacyHeader("malformed-source"))}\n{broken}\n`,
			issueCode: "malformed-json",
		},
		{
			name: "an unknown record",
			content: legacyJsonLines([
				legacyHeader("unknown-source"),
				{
					type: "future_entry",
					id: "future-1",
					parentId: null,
					timestamp: "2026-01-01T00:00:01.000Z",
					payload: "must not be dropped",
				},
			]),
			issueCode: "unsupported-record",
		},
		{
			name: "a broken parent reference",
			content: legacyJsonLines([
				legacyHeader("broken-parent-source"),
				legacyMessage("user-1", "missing", userMessage("hello", 1)),
			]),
			issueCode: "broken-parent-reference",
		},
	])("fails closed for $name before creating the target directory", async ({ content, issueCode }) => {
		const root = await createTemporaryRoot();
		const sourcePath = join(root, "legacy.jsonl");
		const targetRootDir = join(root, "v2");
		await writeFile(sourcePath, content, "utf8");

		const migration = migrateLegacySessionToV2({
			sourcePath,
			targetRootDir,
			targetSessionId: "strict-target",
		});
		await expect(migration).rejects.toBeInstanceOf(LegacySessionImportError);
		await expect(migration).rejects.toMatchObject({
			analysis: { status: "not-representable", issues: [expect.objectContaining({ code: issueCode })] },
		});
		await expect(stat(targetRootDir)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readFile(sourcePath, "utf8")).resolves.toBe(content);
	});
});

async function createTemporaryRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-legacy-migration-"));
	temporaryRoots.add(root);
	return root;
}

function legacyHeader(sessionId: string) {
	return {
		type: "session",
		version: 3,
		id: sessionId,
		timestamp: "2026-01-01T00:00:00.000Z",
		cwd: "C:/legacy-workspace",
	};
}

function legacyMessage(id: string, parentId: string | null, message: unknown) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-01-01T00:00:01.000Z",
		message,
	};
}

function userMessage(content: string, timestamp: number) {
	return { role: "user" as const, content, timestamp };
}

function assistantMessage(text: string, timestamp: number) {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
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
		stopReason: "stop" as const,
		timestamp,
	};
}

function legacyJsonLines(records: readonly unknown[]): string {
	return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

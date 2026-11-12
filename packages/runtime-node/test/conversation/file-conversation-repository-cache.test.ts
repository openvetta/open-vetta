import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessageAppendedEvent, TurnCompletedEvent, TurnStartedEvent } from "@vetta/runtime-core/kernel";
import { afterEach, describe, expect, it } from "vitest";
import { CONVERSATION_STORAGE_ERROR_CODES, FileConversationRepository } from "../../src/conversation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRoot(): Promise<string> {
	const rootDir = await mkdtemp(join(tmpdir(), "vetta-conversation-cache-"));
	temporaryRoots.push(rootDir);
	return rootDir;
}

function started(sessionId: string, turnId: string): TurnStartedEvent {
	return { type: "turn.started", sessionId, turnId, snapshotId: "snapshot-1", timestamp: 1 };
}

function userMessage(sessionId: string, turnId: string, text: string): MessageAppendedEvent {
	return {
		type: "message.appended",
		sessionId,
		turnId,
		message: { role: "user", content: text, timestamp: 2 },
		timestamp: 2,
	};
}

function completed(sessionId: string, turnId: string): TurnCompletedEvent {
	return { type: "turn.completed", sessionId, turnId, stopReason: "stop", timestamp: 3 };
}

/** 一轮常见对话：开始、用户消息、结束，期间改名，再开第二轮。 */
async function runTwoTurns(repository: FileConversationRepository, sessionId: string): Promise<void> {
	await repository.create({ sessionId, createdAt: 100 });
	let version = (await repository.append(sessionId, 0, [started(sessionId, "turn-1")])).version;
	version = (await repository.append(sessionId, version, [userMessage(sessionId, "turn-1", "first")])).version;
	version = (await repository.append(sessionId, version, [completed(sessionId, "turn-1")])).version;
	const revision = (await repository.readDocument(sessionId)).revision;
	await repository.execute(sessionId, revision, { type: "session.name.set", name: "renamed" });
	version = (await repository.append(sessionId, version, [started(sessionId, "turn-2")])).version;
	await repository.append(sessionId, version, [
		userMessage(sessionId, "turn-2", "second"),
		completed(sessionId, "turn-2"),
	]);
}

// 只写文件上 readFile 会失败；POSIX root 会无视权限，Windows 没有这类权限位，两者跳过。
const canRevokeRead = process.platform !== "win32" && process.getuid?.() !== 0;

describe("FileConversationRepository parsed file cache", () => {
	// 每追加一条事件都重读并逐条校验整份会话文件，长会话会在 Electron 主进程里反复卡住几十到几百毫秒。
	it.runIf(canRevokeRead)("keeps appending a turn without re-reading the unchanged history", async () => {
		const rootDir = await createRoot();
		const repository = new FileConversationRepository({ rootDir });
		const sessionId = "session-1";
		await repository.create({ sessionId, createdAt: 100 });
		await repository.append(sessionId, 0, [started(sessionId, "turn-1")]);
		await repository.load(sessionId);

		const path = repository.resolveConversationPath(sessionId);
		await chmod(path, 0o200);
		try {
			await repository.append(sessionId, 1, [userMessage(sessionId, "turn-1", "hello")]);
			await repository.append(sessionId, 2, [completed(sessionId, "turn-1")]);
			const conversation = await repository.load(sessionId);
			const document = await repository.readDocument(sessionId);

			expect(conversation.version).toBe(3);
			expect(conversation.messages).toMatchObject([{ role: "user", content: "hello" }]);
			expect(document).toMatchObject({ journalVersion: 3, activeLeafId: "event-2" });
		} finally {
			await chmod(path, 0o600);
		}
		await repository.close();
	});

	it("serves the same conversation and document as a fresh read from disk", async () => {
		const rootDir = await createRoot();
		const repository = new FileConversationRepository({ rootDir });
		await runTwoTurns(repository, "session-1");

		const cachedConversation = await repository.load("session-1");
		const cachedDocument = await repository.readDocument("session-1");
		const fresh = new FileConversationRepository({ rootDir });

		expect(cachedConversation).toEqual(await fresh.load("session-1"));
		expect(cachedDocument).toEqual(await fresh.readDocument("session-1"));
		expect(cachedDocument.name).toBe("renamed");
		expect(cachedConversation.messages.map((message) => message.content)).toEqual(["first", "second"]);
		await Promise.all([repository.close(), fresh.close()]);
	});

	it("sees events written by another repository instance", async () => {
		const rootDir = await createRoot();
		const repository = new FileConversationRepository({ rootDir });
		const other = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "session-1", createdAt: 100 });
		await repository.append("session-1", 0, [started("session-1", "turn-1")]);
		expect((await repository.load("session-1")).version).toBe(1);

		await other.append("session-1", 1, [userMessage("session-1", "turn-1", "from elsewhere")]);

		await expect(repository.append("session-1", 1, [completed("session-1", "turn-1")])).rejects.toMatchObject({
			code: CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
		});
		const conversation = await repository.load("session-1");
		expect(conversation.version).toBe(2);
		expect(conversation.messages).toMatchObject([{ role: "user", content: "from elsewhere" }]);
		expect((await repository.readDocument("session-1")).activeLeafId).toBe("event-2");
		await Promise.all([repository.close(), other.close()]);
	});
});

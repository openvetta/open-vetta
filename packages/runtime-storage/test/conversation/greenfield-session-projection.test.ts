import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage, UserMessage } from "@vetta/ai";
import { afterEach, describe, expect, it } from "vitest";
import {
	createAgentSession,
	type EventSink,
	type RuntimeSnapshot,
	resumeAgentSession,
	StaticRuntimeSnapshotProvider,
	type TurnEngineEvent,
	type TurnEnginePort,
	TurnPipeline,
} from "../../../runtime-core/src/kernel/index.js";
import { GreenfieldRuntimeSessionBackend } from "../../../runtime-core/src/runtime-host/index.js";
import { FileConversationRepository } from "../../src/conversation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("FileConversationRepository Greenfield projection", () => {
	it("rehydrates the synchronous core state from a real file repository", async () => {
		const rootDir = await mkdtemp(join(tmpdir(), "vetta-greenfield-projection-"));
		temporaryRoots.push(rootDir);
		const createdSession = await createBackend(rootDir).create({ id: "session-1" });
		const createdAssembly = createdSession.createCoreAssembly();

		await createdAssembly.corePorts.turnControl.prompt({ text: "persist me" });

		expect(createdAssembly.corePorts.stateReader.readState()).toMatchObject({
			isStreaming: false,
			messageCount: 2,
		});
		expect(createdAssembly.corePorts.stateReader.readMessages().map((message) => message.role)).toEqual([
			"user",
			"assistant",
		]);
		const createdHistory = createdAssembly.historyReader.readHistory();
		expect(createdHistory).toMatchObject([
			{ type: "message", entryId: "event-2", parentId: null, message: { role: "user" } },
			{ type: "message", entryId: "event-3", parentId: "event-2", message: { role: "assistant" } },
		]);
		expect(createdAssembly.lifecycle.sessionPath).toMatch(/\.conversation\.jsonl$/);
		await createdAssembly.lifecycle.dispose();

		const resumedSession = await createBackend(rootDir).resume({ id: "session-1" });
		const resumedAssembly = resumedSession.createCoreAssembly();

		expect(resumedAssembly.corePorts.stateReader.readState()).toMatchObject({
			isStreaming: false,
			messageCount: 2,
		});
		expect(resumedAssembly.corePorts.stateReader.readMessages().map((message) => message.role)).toEqual([
			"user",
			"assistant",
		]);
		expect(resumedAssembly.historyReader.readHistory()).toEqual(createdHistory);
		expect(resumedAssembly.lifecycle.sessionPath).toBe(createdAssembly.lifecycle.sessionPath);
		await resumedAssembly.lifecycle.dispose();
	});
});

function createBackend(rootDir: string): GreenfieldRuntimeSessionBackend<{ readonly id: string }> {
	return new GreenfieldRuntimeSessionBackend({
		promptAdapter: {
			async prepare(request) {
				return { input: { message: userMessage(request.text) } };
			},
		},
		runtimeFactory: {
			create: (options, eventSink) => createAssembly("create", rootDir, options.id, eventSink),
			resume: (options, eventSink) => createAssembly("resume", rootDir, options.id, eventSink),
		},
	});
}

async function createAssembly(
	operation: "create" | "resume",
	rootDir: string,
	sessionId: string,
	eventSink: EventSink,
) {
	let turnIndex = 0;
	const repository = new FileConversationRepository({ rootDir });
	const pipeline = new TurnPipeline({
		repository,
		snapshotProvider: new StaticRuntimeSnapshotProvider(snapshot()),
		turnEngine: new CompletingTurnEngine(),
		eventSink,
		clock: { now: () => Date.now() },
		idGenerator: {
			next: () => {
				turnIndex += 1;
				return `turn-${turnIndex}`;
			},
		},
	});
	const session =
		operation === "create"
			? await createAgentSession({ id: sessionId, pipeline })
			: await resumeAgentSession({ id: sessionId, pipeline });
	return {
		session,
		repository,
		conversationDocumentReader: repository,
		identity: {
			cwd: rootDir,
			sessionPath: repository.resolveConversationPath(sessionId),
		},
		stateSource: {
			read: () => ({
				model: undefined,
				thinkingLevel: "off" as const,
				contextPercent: null,
				contextWindow: 8_000,
				activeToolNames: [] as string[],
			}),
		},
		dispose: () => repository.close(),
	};
}

class CompletingTurnEngine implements TurnEnginePort {
	async *execute(): AsyncIterable<TurnEngineEvent> {
		yield { type: "message", message: assistantMessage("persisted response") };
		yield { type: "completed", stopReason: "stop" };
	}
}

function snapshot(): RuntimeSnapshot {
	return {
		id: "snapshot-1",
		instructions: [],
		tools: new Map(),
		contextProviders: [],
		contextStrategy: {
			async prepare(input) {
				return { messages: input.messages, estimatedTokens: input.messages.length };
			},
		},
		toolPolicy: {
			async authorize() {
				return true;
			},
		},
		tokenBudget: 8_000,
		reservedOutputTokens: 1_000,
		observers: [],
	};
}

function userMessage(text: string): UserMessage {
	return { role: "user", content: text, timestamp: 1 };
}

function assistantMessage(text: string): AssistantMessage {
	return {
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
		timestamp: 2,
	};
}

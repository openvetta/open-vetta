import type { AssistantMessage, UserMessage } from "@vetta/ai";
import { describe, expect, it, vi } from "vitest";
import type { PromptRequest, SessionEvent } from "../../src/contracts.js";
import type {
	ConversationMetadata,
	ConversationRepository,
	ConversationSnapshot,
	CreateConversationInput,
} from "../../src/kernel/contracts.js";
import {
	createAgentSession,
	type EventSink,
	KERNEL_ERROR_CODES,
	type RuntimeSnapshot,
	resumeAgentSession,
	StaticRuntimeSnapshotProvider,
	type StoredConversation,
	type StoredSessionEvent,
	type TurnEngineEvent,
	type TurnEnginePort,
	TurnPipeline,
} from "../../src/kernel/index.js";
import { type GreenfieldPromptAdapter, GreenfieldRuntimeSessionBackend } from "../../src/runtime-host/index.js";

interface TestCreateOptions {
	readonly id: string;
}

class InMemoryConversationRepository implements ConversationRepository {
	private readonly conversations = new Map<string, StoredConversation>();

	async create(input: CreateConversationInput): Promise<ConversationMetadata> {
		const conversation: StoredConversation = {
			sessionId: input.sessionId,
			createdAt: input.createdAt,
			version: 0,
			messages: [],
			events: [],
		};
		this.conversations.set(input.sessionId, conversation);
		return conversation;
	}

	async load(sessionId: string): Promise<StoredConversation> {
		const conversation = this.conversations.get(sessionId);
		if (!conversation) throw new Error(`Conversation not found: ${sessionId}`);
		return conversation;
	}

	async append(
		sessionId: string,
		expectedVersion: number,
		events: readonly StoredSessionEvent[],
	): Promise<{ readonly version: number }> {
		const conversation = await this.load(sessionId);
		if (conversation.version !== expectedVersion) throw new Error("Version mismatch");
		const messages = [...conversation.messages];
		for (const event of events) {
			if (event.type === "message.appended") messages.push(event.message);
		}
		const version = expectedVersion + events.length;
		this.conversations.set(sessionId, {
			...conversation,
			version,
			messages,
			events: [...conversation.events, ...events],
		});
		return { version };
	}

	async saveSnapshot(_sessionId: string, _snapshot: ConversationSnapshot): Promise<void> {}

	async close(): Promise<void> {}
}

class CompletingTurnEngine implements TurnEnginePort {
	private responseIndex = 0;

	async *execute(): AsyncIterable<TurnEngineEvent> {
		this.responseIndex += 1;
		yield {
			type: "observation",
			observation: { type: "lifecycle", phase: "agent_start", source: "runtime-core" },
		};
		yield {
			type: "message",
			message: assistantMessage(`response-${this.responseIndex}`),
		};
		yield {
			type: "observation",
			observation: { type: "lifecycle", phase: "agent_end", source: "runtime-core" },
		};
		yield { type: "completed", stopReason: "stop" };
	}
}

class BlockingTurnEngine implements TurnEnginePort {
	readonly started: Promise<void>;
	private markStarted: (() => void) | undefined;

	constructor() {
		this.started = new Promise((resolve) => {
			this.markStarted = resolve;
		});
	}

	async *execute(request: Parameters<TurnEnginePort["execute"]>[0]): AsyncIterable<TurnEngineEvent> {
		this.markStarted?.();
		await waitForAbort(request.signal);
		yield { type: "completed", stopReason: "stop" };
	}
}

class RecordingPromptAdapter implements GreenfieldPromptAdapter {
	readonly requests: Array<{ readonly request: PromptRequest; readonly sessionId: string }> = [];

	async prepare(request: PromptRequest, context: { readonly sessionId: string }) {
		this.requests.push({ request, sessionId: context.sessionId });
		return {
			input: { message: userMessage(request.text) },
			options: { streamingBehavior: request.streamingBehavior },
		};
	}
}

function createBackend(
	turnEngine: TurnEnginePort,
	promptAdapter: GreenfieldPromptAdapter = new RecordingPromptAdapter(),
	dispose = vi.fn(async () => {}),
) {
	return {
		backend: new GreenfieldRuntimeSessionBackend<TestCreateOptions>({
			promptAdapter,
			runtimeFactory: {
				async create(options: TestCreateOptions, eventSink: EventSink) {
					let turnIndex = 0;
					const repository = new InMemoryConversationRepository();
					const pipeline = new TurnPipeline({
						repository,
						snapshotProvider: new StaticRuntimeSnapshotProvider(snapshot()),
						turnEngine,
						eventSink,
						clock: { now: () => Date.now() },
						idGenerator: {
							next: () => {
								turnIndex += 1;
								return `turn-${turnIndex}`;
							},
						},
					});
					const session = await createAgentSession({ id: options.id, pipeline });
					return { session, repository, dispose };
				},
				async resume() {
					throw new Error("Resume is not configured for this test harness");
				},
			},
		}),
		dispose,
		promptAdapter,
	};
}

describe("GreenfieldRuntimeSessionBackend", () => {
	it("adapts prompts, publishes mapped events and reports repository-backed state", async () => {
		const promptAdapter = new RecordingPromptAdapter();
		const { backend } = createBackend(new CompletingTurnEngine(), promptAdapter);
		const session = await backend.create({ id: "session-1" });
		const events: SessionEvent[] = [];
		session.subscribe(() => {
			throw new Error("listener failure");
		});
		session.subscribe((event) => events.push(event));

		const result = await session.prompt({ text: "hello", metadata: { source: "test" } });

		expect(result.status).toBe("completed");
		expect(promptAdapter.requests).toEqual([
			{
				request: { text: "hello", metadata: { source: "test" } },
				sessionId: "session-1",
			},
		]);
		expect(events.map((event) => event.type)).toEqual([
			"session.lifecycle",
			"message.final",
			"usage.update",
			"session.lifecycle",
		]);
		expect(await session.getState()).toMatchObject({
			sessionId: "session-1",
			state: "idle",
			pendingMessageCount: 0,
			messageCount: 2,
		});
		expect((await session.getMessages()).map((message) => message.role)).toEqual(["user", "assistant"]);
	});

	it("continues from persisted context without adding a user message", async () => {
		const { backend } = createBackend(new CompletingTurnEngine());
		const session = await backend.create({ id: "session-1" });

		await session.prompt({ text: "hello" });
		const result = await session.continue();

		expect(result.status).toBe("completed");
		expect((await session.getMessages()).map((message) => message.role)).toEqual(["user", "assistant", "assistant"]);
	});

	it("uses the explicit resume factory path and publishes interrupted recovery", async () => {
		const repository = new InMemoryConversationRepository();
		await repository.create({ sessionId: "session-1", createdAt: 1 });
		await repository.append("session-1", 0, [
			{
				type: "turn.started",
				sessionId: "session-1",
				turnId: "turn-interrupted",
				snapshotId: "snapshot-1",
				timestamp: 2,
			},
		]);
		const create = vi.fn(async () => {
			throw new Error("Create must not be used while resuming");
		});
		const resume = vi.fn(async (options: TestCreateOptions, eventSink: EventSink) => {
			const pipeline = new TurnPipeline({
				repository,
				snapshotProvider: new StaticRuntimeSnapshotProvider(snapshot()),
				turnEngine: new CompletingTurnEngine(),
				eventSink,
				clock: { now: () => 3 },
				idGenerator: { next: () => "unused-turn-id" },
			});
			const session = await resumeAgentSession({ id: options.id, pipeline });
			return { session, repository };
		});
		const backend = new GreenfieldRuntimeSessionBackend<TestCreateOptions>({
			promptAdapter: new RecordingPromptAdapter(),
			runtimeFactory: { create, resume },
		});

		const session = await backend.resume({ id: "session-1" });
		const events: SessionEvent[] = [];
		session.subscribe((event) => events.push(event));
		const conversation = await repository.load("session-1");

		expect(create).not.toHaveBeenCalled();
		expect(resume).toHaveBeenCalledOnce();
		expect(conversation.events.at(-1)).toMatchObject({
			type: "turn.failed",
			error: { code: KERNEL_ERROR_CODES.TURN_INTERRUPTED },
		});
		expect(events.map((event) => event.type)).toEqual(["error", "session.lifecycle"]);
		expect(events[0]).toMatchObject({
			type: "error",
			error: { code: KERNEL_ERROR_CODES.TURN_INTERRUPTED },
		});
		expect(events[1]).toMatchObject({ type: "session.lifecycle", phase: "agent_end" });
	});

	it("queues explicit concurrent input and retains it after abort", async () => {
		const engine = new BlockingTurnEngine();
		const promptAdapter = new RecordingPromptAdapter();
		const { backend } = createBackend(engine, promptAdapter);
		const session = await backend.create({ id: "session-1" });
		const events: SessionEvent[] = [];
		session.subscribe((event) => events.push(event));
		const activeTurn = session.prompt({ text: "first" });
		await engine.started;

		await expect(session.prompt({ text: "rejected" })).rejects.toMatchObject({ code: "session_busy" });
		await expect(session.prompt({ text: "later", streamingBehavior: "followUp" })).resolves.toEqual({
			status: "queued",
			behavior: "followUp",
			pendingCount: 1,
		});
		await session.abort("user cancelled");

		await expect(activeTurn).resolves.toMatchObject({ status: "cancelled", reason: "user cancelled" });
		expect(promptAdapter.requests.map(({ request }) => request.text)).toEqual(["first", "later"]);
		expect(await session.getState()).toMatchObject({ state: "idle", pendingMessageCount: 1 });
		expect(events.filter((event) => event.type === "session.lifecycle").map((event) => event.phase)).toEqual([
			"aborted",
			"agent_end",
		]);
	});

	it("disposes the kernel session and composition-owned resources once", async () => {
		const dispose = vi.fn(async () => {});
		const { backend } = createBackend(new CompletingTurnEngine(), new RecordingPromptAdapter(), dispose);
		const session = await backend.create({ id: "session-1" });

		await session.dispose();
		await session.dispose();

		expect(dispose).toHaveBeenCalledOnce();
		await expect(session.prompt({ text: "after dispose" })).rejects.toMatchObject({
			code: "session_closed",
		});
	});
});

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

function waitForAbort(signal: AbortSignal): Promise<void> {
	return new Promise((_, reject) => {
		if (signal.aborted) {
			reject(abortError());
			return;
		}
		signal.addEventListener("abort", () => reject(abortError()), { once: true });
	});
}

function abortError(): Error {
	const error = new Error("Aborted");
	error.name = "AbortError";
	return error;
}

import type { AssistantMessage, Message, UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import {
	type ConversationDocument,
	type ConversationDocumentReader,
	createEmptyConversationDocument,
} from "../../src/conversation/index.js";
import {
	BufferedRuntimeSessionContext,
	type Clock,
	type ContextStrategy,
	type ConversationMetadata,
	type ConversationRepository,
	type ConversationSnapshot,
	type CreateConversationInput,
	createAgentSession,
	type EventSink,
	type IdGenerator,
	KERNEL_ERROR_CODES,
	type KernelEvent,
	type PreparedContext,
	type RuntimeSessionContextBuffer,
	type RuntimeSnapshot,
	StaticRuntimeSnapshotProvider,
	type StoredConversation,
	type StoredSessionEvent,
	type TurnEngineEvent,
	type TurnEnginePort,
	type TurnEngineRequest,
	TurnPipeline,
} from "../../src/kernel/index.js";

class TestClock implements Clock {
	private current = 100;

	now(): number {
		this.current += 1;
		return this.current;
	}
}

class TestIdGenerator implements IdGenerator {
	private current = 0;

	next(): string {
		this.current += 1;
		return `turn-${this.current}`;
	}
}

class CollectingEventSink implements EventSink {
	readonly events: KernelEvent[] = [];

	async publish(event: KernelEvent): Promise<void> {
		this.events.push(event);
	}
}

class InMemoryConversationRepository implements ConversationRepository {
	private readonly conversations = new Map<string, StoredConversation>();

	async create(input: CreateConversationInput): Promise<ConversationMetadata> {
		if (this.conversations.has(input.sessionId)) {
			throw new Error(`Conversation already exists: ${input.sessionId}`);
		}
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
		if (conversation.version !== expectedVersion) {
			throw new Error(`Version mismatch: expected ${expectedVersion}, received ${conversation.version}`);
		}
		const messages = [...conversation.messages];
		for (const event of events) {
			if (event.type === "message.appended") messages.push(event.message);
			if (event.type === "context.appended" && event.record.modelVisible) {
				messages.push({
					role: "user",
					content: event.record.content,
					timestamp: event.timestamp,
				});
			}
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

class RecordingContextStrategy implements ContextStrategy {
	readonly inputs: Message[][] = [];

	async prepare(input: Parameters<ContextStrategy["prepare"]>[0], signal: AbortSignal): Promise<PreparedContext> {
		signal.throwIfAborted();
		this.inputs.push([...input.messages]);
		return {
			messages: input.messages,
			estimatedTokens: input.messages.length,
		};
	}
}

class CompletingTurnEngine implements TurnEnginePort {
	readonly requests: TurnEngineRequest[] = [];

	constructor(private readonly response: AssistantMessage) {}

	async *execute(request: TurnEngineRequest): AsyncIterable<TurnEngineEvent> {
		this.requests.push(request);
		yield {
			type: "observation",
			observation: {
				type: "message.delta",
				delta: "partial",
				source: "agent",
			},
		};
		yield {
			type: "message",
			message: this.response,
		};
		yield {
			type: "completed",
			stopReason: "stop",
		};
	}
}

function userMessage(text: string): UserMessage {
	return {
		role: "user",
		content: text,
		timestamp: 1,
	};
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
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			},
		},
		stopReason: "stop",
		timestamp: 2,
	};
}

function toolResultMessage(toolCallId: string): Extract<Message, { role: "toolResult" }> {
	return {
		role: "toolResult",
		toolCallId,
		toolName: "test",
		content: [{ type: "text", text: "tool done" }],
		isError: false,
		timestamp: 2,
	};
}

function snapshot(contextStrategy: ContextStrategy, overrides?: Partial<RuntimeSnapshot>): RuntimeSnapshot {
	return {
		id: "snapshot-1",
		instructions: [],
		tools: new Map(),
		contextProviders: [],
		contextStrategy,
		toolPolicy: {
			async authorize() {
				return true;
			},
		},
		tokenBudget: 8_000,
		reservedOutputTokens: 1_000,
		observers: [],
		...overrides,
	};
}

async function createHarness(options?: {
	readonly turnEngine?: TurnEnginePort;
	readonly contextStrategy?: ContextStrategy;
	readonly runtimeSnapshot?: RuntimeSnapshot;
	readonly eventSink?: EventSink;
	readonly runtimeContext?: RuntimeSessionContextBuffer;
	readonly conversationDocumentReader?: ConversationDocumentReader;
}) {
	const repository = new InMemoryConversationRepository();
	const contextStrategy = options?.contextStrategy ?? new RecordingContextStrategy();
	const turnEngine = options?.turnEngine ?? new CompletingTurnEngine(assistantMessage("done"));
	const eventSink = options?.eventSink ?? new CollectingEventSink();
	const pipeline = new TurnPipeline({
		repository,
		snapshotProvider: new StaticRuntimeSnapshotProvider(options?.runtimeSnapshot ?? snapshot(contextStrategy)),
		turnEngine,
		eventSink,
		clock: new TestClock(),
		idGenerator: new TestIdGenerator(),
		runtimeContext: options?.runtimeContext,
		conversationDocumentReader: options?.conversationDocumentReader,
	});
	const session = await createAgentSession({
		id: "session-1",
		pipeline,
	});
	return {
		contextStrategy,
		eventSink,
		repository,
		session,
		turnEngine,
	};
}

describe("greenfield runtime kernel", () => {
	it("runs the typed pipeline in its fixed order and persists canonical events", async () => {
		const harness = await createHarness();
		const result = await harness.session.send({
			message: userMessage("hello"),
		});

		expect(result.status).toBe("completed");
		expect(harness.session.state).toBe("idle");

		const liveEvents = (harness.eventSink as CollectingEventSink).events;
		expect(liveEvents.filter((event) => event.type === "pipeline.stage").map((event) => event.stage)).toEqual([
			"admission",
			"snapshot_binding",
			"conversation_loading",
			"context_assembly",
			"context_preparation",
			"execution",
			"finalization",
		]);
		expect(liveEvents.filter((event) => event.type === "session.observation")).toMatchObject([
			{
				type: "session.observation",
				sessionId: "session-1",
				turnId: "turn-1",
				observation: {
					type: "message.delta",
					delta: "partial",
					source: "agent",
				},
			},
		]);

		const conversation = await harness.repository.load("session-1");
		expect(conversation.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
		expect(conversation.events.map((event) => event.type)).toEqual([
			"turn.started",
			"message.appended",
			"message.appended",
			"turn.completed",
		]);
	});

	it("assembles provider context before the current input and binds one snapshot", async () => {
		const contextStrategy = new RecordingContextStrategy();
		const providerMessage = userMessage("provider context");
		const runtimeSnapshot = snapshot(contextStrategy, {
			contextProviders: [
				{
					id: "test-provider",
					async provide() {
						return [providerMessage];
					},
				},
			],
		});
		const engine = new CompletingTurnEngine(assistantMessage("done"));
		const harness = await createHarness({
			contextStrategy,
			runtimeSnapshot,
			turnEngine: engine,
		});

		await harness.session.send({
			message: userMessage("current input"),
		});

		expect(contextStrategy.inputs[0].map((message) => message.role)).toEqual(["user", "user"]);
		expect((contextStrategy.inputs[0][0] as UserMessage).content).toBe("provider context");
		expect((contextStrategy.inputs[0][1] as UserMessage).content).toBe("current input");
		expect(engine.requests[0].snapshot.id).toBe("snapshot-1");
	});

	it("persists generic context records and sends only model-visible records to the engine", async () => {
		const contextStrategy = new RecordingContextStrategy();
		const engine = new CompletingTurnEngine(assistantMessage("done"));
		const harness = await createHarness({ contextStrategy, turnEngine: engine });

		await harness.session.send({
			context: [
				{
					type: "visible",
					content: "model context",
					modelVisible: true,
					display: false,
				},
				{
					type: "marker",
					content: "",
					modelVisible: false,
					metadata: { id: "resource" },
				},
			],
			message: userMessage("current input"),
		});

		expect(contextStrategy.inputs[0].map((message) => message.content)).toEqual(["model context", "current input"]);
		expect(engine.requests[0].input?.context).toHaveLength(2);
		const conversation = await harness.repository.load("session-1");
		expect(conversation.events.map(({ type }) => type)).toEqual([
			"turn.started",
			"context.appended",
			"context.appended",
			"message.appended",
			"message.appended",
			"turn.completed",
		]);
	});

	it("persists the current input atomically before committing a prepared compaction", async () => {
		const document = createEmptyConversationDocument({ sessionId: "session-1", createdAt: 1 });
		let preparedHistory: readonly Message[] = [];
		let preparedDocument: ConversationDocument | undefined;
		let committed = false;
		const contextStrategy: ContextStrategy = {
			async prepare(input) {
				preparedHistory = input.historyMessages;
				preparedDocument = input.document;
				return {
					messages: input.messages,
					estimatedTokens: 1,
					compaction: {
						summary: "summary",
						summaryMessage: userMessage("summary"),
						firstKeptEntryId: "existing-entry",
						tokensBefore: 10,
						reason: "threshold",
					},
				};
			},
			async onCompactionCommitted() {
				committed = true;
				return { continueExecution: true };
			},
		};
		const harness = await createHarness({
			contextStrategy,
			conversationDocumentReader: {
				async readDocument() {
					return document;
				},
			},
		});

		await harness.session.send({ message: userMessage("current input") });

		expect(preparedHistory).toEqual([]);
		expect(preparedDocument).toBe(document);
		expect(committed).toBe(true);
		expect((await harness.repository.load("session-1")).events.map(({ type }) => type)).toEqual([
			"turn.started",
			"message.appended",
			"context.compacted",
			"message.appended",
			"turn.completed",
		]);
	});

	it("commits same-turn compaction checkpoints after prior model messages are persisted", async () => {
		const preparationReasons: Array<string | undefined> = [];
		const checkpointMessages = [userMessage("current input"), toolResultMessage("call-1")];
		let checkpointResult: Parameters<
			Extract<TurnEngineEvent, { type: "context_checkpoint" }>["request"]["complete"]
		>[0];
		const contextStrategy: ContextStrategy = {
			async prepare(input) {
				preparationReasons.push(input.reason);
				if (input.reason !== "model_call") {
					return { messages: input.messages, estimatedTokens: input.messages.length };
				}
				return {
					messages: [userMessage("summary"), ...input.messages.slice(-1)],
					estimatedTokens: 2,
					compaction: {
						summary: "summary",
						summaryMessage: userMessage("summary"),
						firstKeptEntryId: "event-1",
						tokensBefore: 10,
						reason: "threshold",
					},
				};
			},
		};
		const engine: TurnEnginePort = {
			async *execute() {
				yield { type: "message", message: checkpointMessages[1] };
				yield {
					type: "context_checkpoint",
					request: {
						reason: "model_call",
						messages: checkpointMessages,
						recoveryAttempt: 0,
						complete(result) {
							checkpointResult = result;
						},
						fail(error) {
							throw error;
						},
					},
				};
				yield { type: "message", message: assistantMessage("done") };
				yield { type: "completed", stopReason: "stop" };
			},
		};
		const harness = await createHarness({ contextStrategy, turnEngine: engine });

		await harness.session.send({ message: checkpointMessages[0] as UserMessage });

		expect(preparationReasons).toEqual(["turn_start", "model_call"]);
		expect(checkpointResult?.contextMessages?.map(({ role }) => role)).toEqual(["user", "toolResult"]);
		expect((await harness.repository.load("session-1")).events.map(({ type }) => type)).toEqual([
			"turn.started",
			"message.appended",
			"message.appended",
			"context.compacted",
			"message.appended",
			"turn.completed",
		]);
	});

	it("rejects an in-flight context checkpoint when the turn is cancelled", async () => {
		let markCheckpoint: (() => void) | undefined;
		const checkpointStarted = new Promise<void>((resolve) => {
			markCheckpoint = resolve;
		});
		let checkpointFailed = false;
		const contextStrategy: ContextStrategy = {
			async prepare(input, signal) {
				if (input.reason !== "model_call") {
					return { messages: input.messages, estimatedTokens: input.messages.length };
				}
				markCheckpoint?.();
				await waitForAbort(signal);
				throw new Error("Checkpoint continued after cancellation");
			},
		};
		const engine: TurnEnginePort = {
			async *execute() {
				yield {
					type: "context_checkpoint",
					request: {
						reason: "model_call",
						messages: [userMessage("current input")],
						recoveryAttempt: 0,
						complete() {},
						fail() {
							checkpointFailed = true;
						},
					},
				};
				yield { type: "completed", stopReason: "stop" };
			},
		};
		const harness = await createHarness({ contextStrategy, turnEngine: engine });
		const turn = harness.session.send({ message: userMessage("current input") });
		await checkpointStarted;

		await harness.session.cancel("cancel checkpoint");
		const result = await turn;

		expect(result).toMatchObject({ status: "cancelled", reason: "cancel checkpoint" });
		expect(checkpointFailed).toBe(true);
		expect((await harness.repository.load("session-1")).events.at(-1)?.type).toBe("turn.cancelled");
	});

	it("serializes runtime context after tool results and exposes it to the next external turn", async () => {
		const runtimeContext = new BufferedRuntimeSessionContext();
		let execution = 0;
		const engine: TurnEnginePort = {
			async *execute() {
				execution += 1;
				if (execution === 1) {
					runtimeContext.append([
						{
							type: "tool-hook-context",
							content: "remember this",
							modelVisible: true,
							display: false,
						},
					]);
					yield {
						type: "message",
						message: {
							role: "toolResult",
							toolCallId: "call-1",
							toolName: "test",
							content: [{ type: "text", text: "tool done" }],
							isError: false,
							timestamp: 2,
						},
					};
				}
				yield {
					type: "message",
					message: assistantMessage(`done-${execution}`),
				};
				yield { type: "completed", stopReason: "stop" };
			},
		};
		const contextStrategy = new RecordingContextStrategy();
		const harness = await createHarness({ contextStrategy, runtimeContext, turnEngine: engine });

		await harness.session.send({ message: userMessage("first") });
		const firstConversation = await harness.repository.load("session-1");
		expect(firstConversation.events.map(({ type }) => type)).toEqual([
			"turn.started",
			"message.appended",
			"message.appended",
			"context.appended",
			"message.appended",
			"turn.completed",
		]);
		expect(contextStrategy.inputs[0].map((message) => message.content)).not.toContain("remember this");

		await harness.session.send({ message: userMessage("second") });
		expect(contextStrategy.inputs[1].map((message) => message.content)).toContain("remember this");
	});

	it("starts a normal turn when streaming behavior is supplied while idle", async () => {
		const harness = await createHarness();

		const result = await harness.session.send({ message: userMessage("hello") }, { streamingBehavior: "followUp" });

		expect(result.status).toBe("completed");
		expect(harness.session.pendingMessageCount).toBe(0);
	});

	it("continues from stored context without appending a synthetic user message", async () => {
		const harness = await createHarness();

		await harness.session.send({ message: userMessage("hello") });
		const result = await harness.session.continue();

		expect(result.status).toBe("completed");
		expect((harness.contextStrategy as RecordingContextStrategy).inputs[1].map((message) => message.role)).toEqual([
			"user",
			"assistant",
		]);
		const conversation = await harness.repository.load("session-1");
		expect(conversation.messages.map((message) => message.role)).toEqual(["user", "assistant", "assistant"]);
		expect(conversation.events.filter((event) => event.type === "turn.started")).toHaveLength(2);
	});

	it("fails a turn when the engine omits its terminal event", async () => {
		const engine: TurnEnginePort = {
			async *execute() {
				yield {
					type: "message",
					message: assistantMessage("partial"),
				};
			},
		};
		const harness = await createHarness({ turnEngine: engine });
		const result = await harness.session.send({
			message: userMessage("hello"),
		});

		expect(result).toMatchObject({
			status: "failed",
			error: {
				code: KERNEL_ERROR_CODES.TURN_PROTOCOL,
			},
		});
		const conversation = await harness.repository.load("session-1");
		expect(conversation.events.at(-1)?.type).toBe("turn.failed");
	});

	it("requires an explicit concurrent-input behavior and retains queued input on cancellation", async () => {
		let markStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const engine: TurnEnginePort = {
			async *execute(request) {
				markStarted?.();
				await waitForAbort(request.signal);
				yield {
					type: "completed",
					stopReason: "stop",
				};
			},
		};
		const harness = await createHarness({ turnEngine: engine });
		const firstTurn = harness.session.send({
			message: userMessage("first"),
		});
		await started;

		await expect(
			harness.session.send({
				message: userMessage("second"),
			}),
		).rejects.toMatchObject({
			code: KERNEL_ERROR_CODES.SESSION_BUSY,
		});
		await expect(
			harness.session.send(
				{
					message: userMessage("steer"),
				},
				{ streamingBehavior: "steer" },
			),
		).resolves.toEqual({
			status: "queued",
			behavior: "steer",
			pendingCount: 1,
		});
		await expect(
			harness.session.send(
				{
					message: userMessage("follow-up"),
				},
				{ streamingBehavior: "followUp" },
			),
		).resolves.toEqual({
			status: "queued",
			behavior: "followUp",
			pendingCount: 2,
		});

		await harness.session.cancel("user cancelled");
		const result = await firstTurn;
		expect(result).toMatchObject({
			status: "cancelled",
			reason: "user cancelled",
		});
		expect(harness.session.state).toBe("idle");
		expect(harness.session.pendingMessageCount).toBe(2);
		expect(harness.session.getSteeringMessages().map((message) => message.content)).toEqual(["steer"]);
		expect(harness.session.getFollowUpMessages().map((message) => message.content)).toEqual(["follow-up"]);
		const conversation = await harness.repository.load("session-1");
		expect(conversation.events.at(-1)?.type).toBe("turn.cancelled");
	});

	it("closes an active session by cancelling its turn", async () => {
		let markStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const engine: TurnEnginePort = {
			async *execute(request) {
				markStarted?.();
				await waitForAbort(request.signal);
				yield {
					type: "completed",
					stopReason: "stop",
				};
			},
		};
		const harness = await createHarness({ turnEngine: engine });
		const turn = harness.session.send({
			message: userMessage("hello"),
		});
		await started;
		harness.session.followUp({ message: userMessage("discard on close") });

		await harness.session.close();
		const result = await turn;

		expect(result.status).toBe("cancelled");
		expect(harness.session.state).toBe("closed");
		expect(harness.session.pendingMessageCount).toBe(0);
		await expect(
			harness.session.send({
				message: userMessage("after close"),
			}),
		).rejects.toMatchObject({
			code: KERNEL_ERROR_CODES.SESSION_CLOSED,
		});
	});

	it("isolates observer and event sink failures from turn semantics", async () => {
		const contextStrategy = new RecordingContextStrategy();
		const runtimeSnapshot = snapshot(contextStrategy, {
			observers: [
				{
					id: "broken-observer",
					async observe() {
						throw new Error("observer failed");
					},
				},
			],
		});
		const eventSink: EventSink = {
			async publish() {
				throw new Error("sink failed");
			},
		};
		const harness = await createHarness({
			contextStrategy,
			runtimeSnapshot,
			eventSink,
		});

		const result = await harness.session.send({
			message: userMessage("hello"),
		});

		expect(result.status).toBe("completed");
		expect(harness.session.state).toBe("idle");
	});
});

function waitForAbort(signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(abortError());
			return;
		}
		const onAbort = () => {
			signal.removeEventListener("abort", onAbort);
			reject(abortError());
		};
		signal.addEventListener("abort", onAbort, { once: true });
		void resolve;
	});
}

function abortError(): Error {
	const error = new Error("Aborted");
	error.name = "AbortError";
	return error;
}

import type { Api, AssistantMessage, Message, Model, UserMessage } from "@vetta/ai";
import type { HookDispatchOutcome } from "@vetta/ecosystem-adapter/hooks";
import {
	applyStoredEventToConversationDocument,
	type ConversationDocument,
	createEmptyConversationDocument,
} from "@vetta/runtime-core/conversation";
import type {
	ContextPreparationInput,
	RuntimeSessionObservationEvent,
	StoredSessionEvent,
} from "@vetta/runtime-core/kernel";
import { describe, expect, it, vi } from "vitest";
import {
	CodingAgentGreenfieldContextRuntime,
	type CodingAgentGreenfieldContextRuntimeOptions,
} from "../../src/adapters/runtime-core/index.js";
import type { CompactionPreparation, CompactionResult, CompactionSettings } from "../../src/core/compaction/index.js";
import { COMPACTION_SUMMARY_PREFIX, COMPACTION_SUMMARY_SUFFIX } from "../../src/core/messages.js";

describe("CodingAgentGreenfieldContextRuntime", () => {
	it("persists a threshold compaction while keeping transient turn input outside the summary", async () => {
		const history = [
			userMessage("old request".repeat(40), 1),
			assistantMessage("old response", 90, 2),
			userMessage("kept request", 3),
		] satisfies Message[];
		const document = documentFromMessages(history);
		const currentInput = userMessage("current input", 4);
		const observations: RuntimeSessionObservationEvent[] = [];
		const hooks = createHookRuntime();
		const generateCompaction = vi.fn(
			async (preparation: CompactionPreparation): Promise<CompactionResult> => ({
				summary: "summary",
				firstKeptEntryId: preparation.firstKeptEntryId,
				tokensBefore: preparation.tokensBefore,
				details: { source: "test" },
			}),
		);
		const runtime = new CodingAgentGreenfieldContextRuntime({
			hookRuntime: hooks,
			resolveApiKey: () => "key",
			resolveSettings: compactingSettings,
			generateCompaction,
			now: () => 42,
		});
		const input = preparationInput(document, history, [...history, currentInput], observations);

		const prepared = await runtime.prepare(input, new AbortController().signal);

		expect(generateCompaction).toHaveBeenCalledOnce();
		expect(prepared.compaction).toEqual({
			summary: "summary",
			summaryMessage: {
				role: "user",
				content: [
					{
						type: "text",
						text: `${COMPACTION_SUMMARY_PREFIX}summary${COMPACTION_SUMMARY_SUFFIX}`,
					},
				],
				timestamp: 42,
			},
			firstKeptEntryId: "event-3",
			tokensBefore: 93,
			details: { source: "test" },
			reason: "threshold",
		});
		expect(prepared.messages.map(messageText)).toEqual([
			`${COMPACTION_SUMMARY_PREFIX}summary${COMPACTION_SUMMARY_SUFFIX}`,
			"kept request",
			"current input",
		]);
		expect(hooks.runPreCompact).toHaveBeenCalledWith("auto", expect.any(AbortSignal));
		expect(hooks.runPostCompact).not.toHaveBeenCalled();
		expect(observations).toEqual([{ type: "compaction.start", reason: "threshold", source: "agent" }]);

		await runtime.onCompactionCommitted(prepared.compaction!, input, new AbortController().signal);

		expect(hooks.runPostCompact).toHaveBeenCalledWith("auto", expect.any(AbortSignal));
		expect(hooks.markSessionStart).toHaveBeenCalledWith("compact");
		expect(observations).toEqual([{ type: "compaction.start", reason: "threshold", source: "agent" }]);
	});

	it("does not generate or persist a compaction when the pre-compact hook blocks", async () => {
		const history = [
			userMessage("old request".repeat(40), 1),
			assistantMessage("old response", 90, 2),
			userMessage("kept request", 3),
		] satisfies Message[];
		const observations: RuntimeSessionObservationEvent[] = [];
		const generateCompaction = vi.fn(async (_preparation: CompactionPreparation): Promise<CompactionResult> => {
			throw new Error("must not run");
		});
		const hooks = createHookRuntime({
			...emptyHookOutcome(),
			shouldBlock: true,
			blockReason: "blocked by test",
		});
		const runtime = new CodingAgentGreenfieldContextRuntime({
			hookRuntime: hooks,
			resolveApiKey: () => "key",
			resolveSettings: compactingSettings,
			generateCompaction,
		});
		const input = preparationInput(documentFromMessages(history), history, history, observations);

		const prepared = await runtime.prepare(input, new AbortController().signal);

		expect(prepared.messages).toEqual(history);
		expect(prepared.compaction).toBeUndefined();
		expect(generateCompaction).not.toHaveBeenCalled();
		expect(observations).toEqual([
			{ type: "compaction.start", reason: "threshold", source: "agent" },
			{
				type: "compaction.end",
				success: false,
				errorMessage: "blocked by test",
				source: "agent",
			},
		]);
	});

	it("microcompacts every model call without mutating persisted messages", async () => {
		const runtime = new CodingAgentGreenfieldContextRuntime({
			hookRuntime: createHookRuntime(),
			resolveApiKey: () => "key",
		});
		const messages = Array.from({ length: 9 }, (_, index) => toolResultMessage(index));
		const input = {
			sessionId: "session-1",
			turnId: "turn-1",
			messages,
			modelBinding: { model: MODEL },
		};

		const first = await runtime.transform(input, new AbortController().signal);
		const second = await runtime.transform(input, new AbortController().signal);

		expect(messageText(first[0])).toBe("[tool result cleared — old context]");
		expect(messageText(second[0])).toBe("[tool result cleared — old context]");
		expect(messageText(messages[0])).toBe("result-0");
		expect(first).not.toBe(second);
	});

	it("restores context usage from the document and then reports exact assistant usage", async () => {
		const runtime = new CodingAgentGreenfieldContextRuntime({
			hookRuntime: createHookRuntime(),
			resolveApiKey: () => "key",
		});
		runtime.initialize(documentFromMessages([userMessage("request", 1), assistantMessage("old", 125, 2)]));
		expect(runtime.readUsage(1_000)).toEqual({ tokens: 125, contextWindow: 1_000, percent: 12.5 });

		const message = assistantMessage("response", 250, 1);
		const event: StoredSessionEvent = {
			type: "message.appended",
			sessionId: "session-1",
			turnId: "turn-1",
			message,
			timestamp: 1,
		};

		await runtime.observe(event);

		expect(runtime.readUsage(1_000)).toEqual({ tokens: 250, contextWindow: 1_000, percent: 25 });
	});
});

function preparationInput(
	document: ConversationDocument,
	historyMessages: readonly Message[],
	messages: readonly Message[],
	observations: RuntimeSessionObservationEvent[],
): ContextPreparationInput {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		historyMessages,
		messages,
		tokenBudget: MODEL.contextWindow,
		reservedOutputTokens: MODEL.maxTokens,
		modelBinding: { model: MODEL },
		document,
		reportObservation: async (observation) => {
			observations.push(observation);
		},
	};
}

function documentFromMessages(messages: readonly Message[]): ConversationDocument {
	let document = createEmptyConversationDocument({ sessionId: "session-1", createdAt: 0 });
	for (let index = 0; index < messages.length; index += 1) {
		document = applyStoredEventToConversationDocument(
			document,
			{
				type: "message.appended",
				sessionId: "session-1",
				turnId: "previous-turn",
				message: messages[index] as Message,
				timestamp: index + 1,
			},
			index + 1,
		);
	}
	return document;
}

function createHookRuntime(preCompactOutcome: HookDispatchOutcome = emptyHookOutcome()) {
	return {
		runPreCompact: vi.fn(async () => preCompactOutcome),
		runPostCompact: vi.fn(async () => emptyHookOutcome()),
		markSessionStart: vi.fn(),
	} satisfies CodingAgentGreenfieldContextRuntimeOptions["hookRuntime"];
}

function emptyHookOutcome(): HookDispatchOutcome {
	return {
		shouldStop: false,
		shouldBlock: false,
		additionalContexts: [],
		continuationFragments: [],
		runs: [],
	};
}

function compactingSettings(): CompactionSettings {
	return {
		enabled: true,
		reserveTokens: 20,
		minFreePercent: 20,
		keepRecentTokens: 1,
	};
}

function userMessage(text: string, timestamp: number): UserMessage {
	return { role: "user", content: text, timestamp };
}

function assistantMessage(text: string, totalTokens: number, timestamp: number): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: MODEL.api,
		provider: MODEL.provider,
		model: MODEL.id,
		usage: {
			input: totalTokens,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp,
	};
}

function toolResultMessage(index: number): Extract<Message, { role: "toolResult" }> {
	return {
		role: "toolResult",
		toolCallId: `call-${index}`,
		toolName: "read",
		content: [{ type: "text", text: `result-${index}` }],
		isError: false,
		timestamp: 1,
	};
}

function messageText(message: Message | undefined): string {
	if (!message) return "";
	if (typeof message.content === "string") return message.content;
	return message.content
		.filter((item): item is Extract<(typeof message.content)[number], { type: "text" }> => item.type === "text")
		.map(({ text }) => text)
		.join("");
}

const MODEL: Model<Api> = {
	id: "model",
	name: "Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100,
	maxTokens: 20,
};

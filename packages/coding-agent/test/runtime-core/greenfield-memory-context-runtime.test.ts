import type { Api, AssistantMessage, Message, Model, UserMessage } from "@vetta/ai";
import {
	applyStoredEventToConversationDocument,
	type ConversationDocument,
	createEmptyConversationDocument,
} from "@vetta/runtime-core/conversation";
import type { ContextPreparationInput } from "@vetta/runtime-core/kernel";
import { describe, expect, it, vi } from "vitest";
import {
	CodingAgentGreenfieldContextRuntime,
	CodingAgentMemoryRolloverOrchestrator,
	type CodingAgentMemoryRolloverPreparation,
} from "../../src/adapters/runtime-core/index.js";
import type { CompactionSettings } from "../../src/core/compaction/index.js";

describe("Greenfield memory rollover context integration", () => {
	it("applies the legacy memory threshold, flushes the discarded prefix and requests generic continuation", async () => {
		const history = [
			userMessage("old request", 1),
			assistantMessage("old response", 30, 2),
			userMessage("recent request", 3),
			assistantMessage("recent response", 75, 4),
		] satisfies Message[];
		const document = documentFromMessages(history);
		const flushMemory = vi.fn(
			async (
				_input: CodingAgentMemoryRolloverPreparation & {
					readonly memoryFile: string;
					readonly limit: number;
				},
			) => [],
		);
		const memoryRollover = new CodingAgentMemoryRolloverOrchestrator({
			memoryFile: "C:\\memory\\MEMORY.md",
			cwd: "C:\\workspace",
			flushMemory,
		});
		const runtime = new CodingAgentGreenfieldContextRuntime({
			hookRuntime: hookRuntime(),
			resolveApiKey: () => "key",
			resolveSettings: baseSettings,
			generateCompaction: async (preparation) => ({
				summary: "memory summary",
				firstKeptEntryId: preparation.firstKeptEntryId,
				tokensBefore: preparation.tokensBefore,
			}),
			memoryRollover,
			now: () => 3,
		});
		const input = preparationInput(document, history);

		const prepared = await runtime.prepare(input, new AbortController().signal);
		const committed = await runtime.onCompactionCommitted(prepared.compaction!, input, new AbortController().signal);

		expect(prepared.compaction).toMatchObject({
			summary: "memory summary",
			reason: "threshold",
		});
		expect(flushMemory).toHaveBeenCalledOnce();
		expect(flushMemory.mock.calls[0]?.[0]?.preparation.messagesToSummarize.map(({ role }) => role)).toEqual([
			"user",
			"assistant",
		]);
		expect(committed).toEqual({
			continueExecution: true,
			continuation: { reason: "memory-rollover" },
		});
	});

	it("does not apply memory flush or continuation to manual compaction", async () => {
		const history = [userMessage("old request", 1), assistantMessage("old response", 75, 2)] satisfies Message[];
		const document = documentFromMessages(history);
		const flushMemory = vi.fn(
			async (
				_input: CodingAgentMemoryRolloverPreparation & {
					readonly memoryFile: string;
					readonly limit: number;
				},
			) => [],
		);
		const memoryRollover = new CodingAgentMemoryRolloverOrchestrator({
			memoryFile: "C:\\memory\\MEMORY.md",
			cwd: "C:\\workspace",
			flushMemory,
		});
		const runtime = new CodingAgentGreenfieldContextRuntime({
			hookRuntime: hookRuntime(),
			resolveApiKey: () => "key",
			resolveSettings: () => ({ ...baseSettings(), reserveTokens: 90 }),
			generateCompaction: async (preparation) => ({
				summary: "manual summary",
				firstKeptEntryId: preparation.firstKeptEntryId,
				tokensBefore: preparation.tokensBefore,
			}),
			memoryRollover,
		});

		const record = await runtime.compactManual(
			{
				sessionId: "session-1",
				document,
				modelBinding: { model: MODEL },
			},
			new AbortController().signal,
		);
		await runtime.onManualCompactionCommitted(
			record,
			{ sessionId: "session-1", document, modelBinding: { model: MODEL } },
			new AbortController().signal,
		);

		expect(record.reason).toBe("manual");
		expect(flushMemory).not.toHaveBeenCalled();
	});
});

function preparationInput(
	document: ConversationDocument,
	historyMessages: readonly Message[],
): ContextPreparationInput {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		historyMessages,
		messages: historyMessages,
		tokenBudget: MODEL.contextWindow,
		reservedOutputTokens: MODEL.maxTokens,
		modelBinding: { model: MODEL },
		document,
		reportObservation: async () => {},
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

function hookRuntime() {
	return {
		runPreCompact: vi.fn(async () => hookOutcome()),
		runPostCompact: vi.fn(async () => hookOutcome()),
		markSessionStart: vi.fn(),
	};
}

function hookOutcome() {
	return {
		shouldStop: false,
		shouldBlock: false,
		additionalContexts: [],
		continuationFragments: [],
		runs: [],
	};
}

function baseSettings(): CompactionSettings {
	return {
		enabled: true,
		reserveTokens: 10,
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

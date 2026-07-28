import type { AgentMessage } from "@vetta/agent-core";
import type { Api, AssistantMessage, Model } from "@vetta/ai";
import type {
	AgentFeatureDefinition,
	ContextCompactionRecord,
	ConversationContinuationDirective,
	StoredSessionEvent,
	TurnObserver,
} from "@vetta/runtime-core/kernel";
import type { CompactionPreparation, CompactionSettings } from "../../core/compaction/index.js";
import { flushMemoryBeforeRollover } from "../../core/memory/memory-flush.js";
import { appendJournalLine, appendJournalSection } from "../../core/memory/memory-journal.js";
import { DEFAULT_MEMORY_CHAR_LIMIT, readMemoryContent, renderMemoryForPrompt } from "../../core/memory/memory-store.js";
import { createMemoryTool } from "../../core/tools/memory/index.js";
import type { CodingAgentPromptMemoryState } from "./greenfield-prompt-runtime.js";
import {
	adaptCodingAgentToolRegistration,
	type CodingAgentRuntimeToolRegistration,
} from "./greenfield-tool-adapter.js";

export interface CodingAgentMemoryRolloverPreparation {
	readonly preparation: CompactionPreparation;
	readonly model: Model<Api>;
	readonly apiKey: string;
	readonly signal: AbortSignal;
}

export interface CodingAgentMemoryFlushInput {
	readonly messages: readonly AgentMessage[];
	readonly model: Model<Api>;
	readonly apiKey: string;
	readonly signal: AbortSignal;
}

export interface CodingAgentMemoryCompactionPolicy {
	adjustCompactionSettings(settings: CompactionSettings, contextWindow: number): CompactionSettings;
	beforeCompaction(input: CodingAgentMemoryRolloverPreparation): Promise<void>;
	beforeContinuation(record: ContextCompactionRecord): void;
	continuationAfterCompaction(): ConversationContinuationDirective;
}

export interface CodingAgentMemoryRolloverOrchestratorOptions {
	readonly memoryFile: string;
	readonly cwd: string;
	readonly memoryCharLimit?: number;
	readonly flushMemory?: (
		input: CodingAgentMemoryFlushInput & { readonly memoryFile: string; readonly limit: number },
	) => Promise<readonly string[]>;
	readonly appendTurnJournal?: (cwd: string, message: AssistantMessage) => void;
	readonly appendRolloverJournal?: (cwd: string, summary: string) => void;
}

export interface CodingAgentMemoryRolloverRuntime extends CodingAgentMemoryCompactionPolicy, TurnObserver {
	readonly toolRegistration: CodingAgentRuntimeToolRegistration;
	readPromptMemory(): CodingAgentPromptMemoryState;
	renderPromptMemory(): string;
	flushMessages(input: CodingAgentMemoryFlushInput): Promise<number>;
	dispose(): void;
}

/**
 * Coding Agent memory-mode 的 Session 级产品编排。
 *
 * Runtime Core 只接收调整后的压缩设置与通用 continuation directive；
 * MEMORY.md、JOURNAL.md 和 memory Tool 始终留在 Coding Agent 边界。
 */
export class CodingAgentMemoryRolloverOrchestrator implements CodingAgentMemoryRolloverRuntime {
	readonly id = "coding-agent.memory-rollover";
	readonly toolRegistration: CodingAgentRuntimeToolRegistration;
	private readonly memoryFile: string;
	private readonly cwd: string;
	private readonly memoryCharLimit: number;
	private readonly frozenMemorySnapshot: string;
	private readonly flushMemory: NonNullable<CodingAgentMemoryRolloverOrchestratorOptions["flushMemory"]>;
	private readonly appendTurnJournal: NonNullable<CodingAgentMemoryRolloverOrchestratorOptions["appendTurnJournal"]>;
	private readonly appendRolloverJournal: NonNullable<
		CodingAgentMemoryRolloverOrchestratorOptions["appendRolloverJournal"]
	>;
	private readonly lastAssistantByTurn = new Map<string, AssistantMessage>();

	constructor(options: CodingAgentMemoryRolloverOrchestratorOptions) {
		this.memoryFile = options.memoryFile;
		this.cwd = options.cwd;
		this.memoryCharLimit = options.memoryCharLimit ?? DEFAULT_MEMORY_CHAR_LIMIT;
		this.frozenMemorySnapshot = readMemoryContent(options.memoryFile);
		this.flushMemory =
			options.flushMemory ??
			(async ({ messages, model, apiKey, signal, memoryFile, limit }) =>
				flushMemoryBeforeRollover({
					memoryFile,
					limit,
					messages: [...messages],
					model,
					apiKey,
					signal,
				}));
		this.appendTurnJournal = options.appendTurnJournal ?? appendJournalLine;
		this.appendRolloverJournal = options.appendRolloverJournal ?? appendJournalSection;
		this.toolRegistration = adaptCodingAgentToolRegistration(createMemoryTool(this.memoryFile, this.memoryCharLimit));
	}

	readPromptMemory(): CodingAgentPromptMemoryState {
		return {
			enabled: true,
			file: this.memoryFile,
			snapshot: this.frozenMemorySnapshot,
			charLimit: this.memoryCharLimit,
		};
	}

	renderPromptMemory(): string {
		return renderMemoryForPrompt(this.memoryFile, this.frozenMemorySnapshot, this.memoryCharLimit);
	}

	adjustCompactionSettings(settings: CompactionSettings, contextWindow: number): CompactionSettings {
		return {
			...settings,
			minFreePercent: Math.max(settings.minFreePercent, 30),
			reserveTokens:
				contextWindow > 0
					? Math.max(settings.reserveTokens, Math.ceil(contextWindow * 0.3))
					: settings.reserveTokens,
		};
	}

	async beforeCompaction(input: CodingAgentMemoryRolloverPreparation): Promise<void> {
		await this.flushMessages({
			messages: input.preparation.messagesToSummarize,
			model: input.model,
			apiKey: input.apiKey,
			signal: input.signal,
		});
	}

	async flushMessages(input: CodingAgentMemoryFlushInput): Promise<number> {
		try {
			const written = await this.flushMemory({
				...input,
				memoryFile: this.memoryFile,
				limit: this.memoryCharLimit,
			});
			return written.length;
		} catch {
			// MEMORY flush 与旧实现一致：best-effort，不能阻止压缩或 rollover。
			return 0;
		}
	}

	beforeContinuation(record: ContextCompactionRecord): void {
		try {
			this.appendRolloverJournal(this.cwd, record.summary);
		} catch {
			// JOURNAL 与旧实现一致：best-effort，并且发生在 rollover 事务之前。
		}
	}

	continuationAfterCompaction(): ConversationContinuationDirective {
		return { reason: "memory-rollover" };
	}

	async observe(event: StoredSessionEvent): Promise<void> {
		if (event.type === "message.appended" && event.message.role === "assistant") {
			this.lastAssistantByTurn.set(event.turnId, event.message);
			return;
		}
		if (event.type === "turn.completed") {
			const message = this.lastAssistantByTurn.get(event.turnId);
			this.lastAssistantByTurn.delete(event.turnId);
			if (!message) return;
			try {
				this.appendTurnJournal(this.cwd, message);
			} catch {
				// JOURNAL 是观察副作用，失败不能改变 Turn 终态。
			}
			return;
		}
		if (event.type === "turn.cancelled" || event.type === "turn.failed") {
			this.lastAssistantByTurn.delete(event.turnId);
		}
	}

	dispose(): void {
		this.lastAssistantByTurn.clear();
	}
}

export function createCodingAgentMemoryRuntimeFeature(
	registration: CodingAgentRuntimeToolRegistration,
): AgentFeatureDefinition {
	return {
		id: "coding-agent.memory",
		async prepare(context) {
			context.signal.throwIfAborted();
			return {
				async contribute(contributionContext) {
					contributionContext.signal.throwIfAborted();
					return { tools: [registration.tool] };
				},
				async dispose() {},
			};
		},
	};
}

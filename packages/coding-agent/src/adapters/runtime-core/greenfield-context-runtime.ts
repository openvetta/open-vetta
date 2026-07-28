import {
	type Api,
	type AssistantMessage,
	isContextOverflow,
	type Message,
	type Model,
	type UserMessage,
} from "@vetta/ai";
import type { EcosystemHookRuntime } from "@vetta/ecosystem-adapter/hooks";
import {
	applyStoredEventToConversationDocument,
	type ConversationDocument,
	type ConversationDocumentEntry,
	selectConversationDocumentEntries,
	selectConversationDocumentModelMessages,
} from "@vetta/runtime-core/conversation";
import type {
	ContextCompactionRecord,
	ContextPreparationInput,
	ContextStrategy,
	ModelCallContextTransformationInput,
	ModelCallContextTransformer,
	PreparedContext,
	StoredSessionEvent,
	TurnObserver,
} from "@vetta/runtime-core/kernel";
import {
	CompactionCircuitBreaker,
	type CompactionPreparation,
	type CompactionResult,
	type CompactionSettings,
	compact,
	DEFAULT_COMPACTION_SETTINGS,
	estimateContextTokens,
	fingerprintCompactionPrefix,
	isPrefireCacheValid,
	microcompact,
	type PrefireCache,
	prepareCompaction,
	shouldCompact,
	shouldPrefire,
} from "../../core/compaction/index.js";
import { COMPACTION_SUMMARY_PREFIX, COMPACTION_SUMMARY_SUFFIX } from "../../core/messages.js";
import type { SessionEntry } from "../../core/session-manager/index.js";

type ContextHookRuntime = Pick<EcosystemHookRuntime, "markSessionStart" | "runPostCompact" | "runPreCompact">;

export interface CodingAgentGreenfieldContextRuntimeOptions {
	readonly hookRuntime: ContextHookRuntime;
	readonly resolveApiKey: (model: Model<Api>) => Promise<string | undefined> | string | undefined;
	readonly resolveSettings?: () => CompactionSettings;
	readonly generateCompaction?: (
		preparation: CompactionPreparation,
		model: Model<Api>,
		apiKey: string,
		signal: AbortSignal,
	) => Promise<CompactionResult>;
	readonly now?: () => number;
}

export interface CodingAgentContextUsage {
	readonly tokens: number;
	readonly contextWindow: number;
	readonly percent: number;
}

/**
 * Greenfield Session 唯一的上下文所有者。
 *
 * 持久化摘要只在 Turn Context Strategy 中生成；每次模型调用前的 microcompact
 * 通过独立 transformer 运行，永不直接改写 Conversation Document。
 */
export class CodingAgentGreenfieldContextRuntime implements ContextStrategy, ModelCallContextTransformer, TurnObserver {
	readonly id = "coding-agent.context-runtime";
	private readonly hookRuntime: ContextHookRuntime;
	private readonly resolveApiKey: CodingAgentGreenfieldContextRuntimeOptions["resolveApiKey"];
	private readonly resolveSettings: () => CompactionSettings;
	private readonly generateCompaction: NonNullable<CodingAgentGreenfieldContextRuntimeOptions["generateCompaction"]>;
	private readonly now: () => number;
	private readonly circuitBreaker = new CompactionCircuitBreaker();
	private prefireCache: PrefireCache | undefined;
	private prefireAbortController: AbortController | undefined;
	private disposed = false;
	private currentTokens = 0;

	constructor(options: CodingAgentGreenfieldContextRuntimeOptions) {
		this.hookRuntime = options.hookRuntime;
		this.resolveApiKey = options.resolveApiKey;
		this.resolveSettings = options.resolveSettings ?? (() => DEFAULT_COMPACTION_SETTINGS);
		this.generateCompaction =
			options.generateCompaction ??
			((preparation, model, apiKey, signal) => compact(preparation, model, apiKey, undefined, signal));
		this.now = options.now ?? Date.now;
	}

	initialize(document: ConversationDocument): void {
		this.refreshUsage(document);
	}

	onDocumentChanged(document: ConversationDocument): void {
		this.refreshUsage(document);
	}

	async prepare(input: ContextPreparationInput, signal: AbortSignal): Promise<PreparedContext> {
		signal.throwIfAborted();
		const reason = input.reason ?? "turn_start";
		const model = input.modelBinding?.model;
		const contextWindow = model?.contextWindow ?? input.tokenBudget;
		const settings = this.resolveSettings();
		const overflow =
			(reason === "assistant_error" || reason === "assistant_result") &&
			input.recoveryAttempt === 0 &&
			model !== undefined &&
			isOverflowFromCurrentModel(input.triggeringAssistantMessage, model, contextWindow);
		const callMessages = overflow
			? removeAssistantMessage(input.messages, input.triggeringAssistantMessage)
			: [...input.messages];
		const measuredMessages = reason === "turn_start" ? [...input.historyMessages] : callMessages;
		const estimate = estimateContextTokens(measuredMessages);
		const assembledTokens = estimateContextTokens(callMessages).tokens;
		this.currentTokens = assembledTokens;
		if (!model || !input.document || contextWindow <= 0 || !settings.enabled) {
			return unchanged(callMessages, assembledTokens);
		}

		const entries = toSessionEntries(input.document);
		if (reason === "assistant_error" && !overflow) {
			return unchanged(callMessages, assembledTokens);
		}
		if (!overflow && !shouldCompact(estimate.tokens, contextWindow, settings)) {
			if (shouldPrefire(estimate.tokens, contextWindow, settings)) {
				this.maybeStartPrefire(entries, settings, model);
			}
			return unchanged(callMessages, assembledTokens);
		}
		if (!this.circuitBreaker.canAttempt()) return unchanged(callMessages, assembledTokens);

		const compactionReason = overflow ? "overflow" : "threshold";
		await input.reportObservation({ type: "compaction.start", reason: compactionReason, source: "agent" });
		try {
			const apiKey = await this.resolveApiKey(model);
			if (!apiKey) {
				await input.reportObservation({
					type: "compaction.end",
					success: false,
					errorMessage: `No API key for ${model.provider}`,
					source: "agent",
				});
				return unchanged(callMessages, assembledTokens);
			}
			const preparation = prepareCompaction(entries, settings);
			if (!preparation) {
				await input.reportObservation({ type: "compaction.end", success: false, source: "agent" });
				return unchanged(callMessages, assembledTokens);
			}
			const preHookOutcome = await this.hookRuntime.runPreCompact("auto", signal);
			if (preHookOutcome.shouldStop || preHookOutcome.shouldBlock) {
				await input.reportObservation({
					type: "compaction.end",
					success: false,
					errorMessage:
						preHookOutcome.stopReason ?? preHookOutcome.blockReason ?? "Compaction blocked by ecosystem hook",
					source: "agent",
				});
				return unchanged(callMessages, assembledTokens);
			}

			const prefired = this.takeValidPrefire(entries);
			const result = prefired ?? (await this.generateCompaction(preparation, model, apiKey, signal));
			signal.throwIfAborted();
			const record = this.toRecord(result, compactionReason);
			const compactedHistory = projectCompactedHistory(input.document, input.sessionId, input.turnId, record);
			const messages = assemblePreparedMessages(
				compactedHistory,
				input,
				reason,
				compactionReason,
				input.triggeringAssistantMessage,
			);
			const compactedEstimate = estimateContextTokens(messages).tokens;
			this.currentTokens = compactedEstimate;
			return { messages, estimatedTokens: compactedEstimate, compaction: record };
		} catch (error) {
			this.circuitBreaker.recordFailure();
			await input.reportObservation({
				type: "compaction.end",
				success: false,
				errorMessage: error instanceof Error ? error.message : String(error),
				source: "agent",
			});
			return unchanged(callMessages, assembledTokens);
		}
	}

	async onCompactionCommitted(_record: ContextCompactionRecord, _input: ContextPreparationInput, signal: AbortSignal) {
		const outcome = await this.hookRuntime.runPostCompact("auto", signal);
		this.hookRuntime.markSessionStart("compact");
		this.circuitBreaker.recordSuccess();
		return { continueExecution: !outcome.shouldStop };
	}

	async transform(input: ModelCallContextTransformationInput, signal: AbortSignal): Promise<readonly Message[]> {
		signal.throwIfAborted();
		const transformed = microcompact([...input.messages]);
		const messages = transformed.filter(isRuntimeMessage);
		this.currentTokens = estimateContextTokens(messages).tokens;
		return messages;
	}

	async observe(event: StoredSessionEvent): Promise<void> {
		if (event.type !== "message.appended" || event.message.role !== "assistant") return;
		if (event.message.stopReason === "aborted" || event.message.stopReason === "error") return;
		const usage = event.message.usage;
		this.currentTokens = usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
	}

	readUsage(contextWindow: number): CodingAgentContextUsage {
		return {
			tokens: this.currentTokens,
			contextWindow,
			percent: contextWindow > 0 ? (this.currentTokens / contextWindow) * 100 : 0,
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.prefireAbortController?.abort();
		this.prefireAbortController = undefined;
		this.prefireCache = undefined;
	}

	private toRecord(result: CompactionResult, reason: "threshold" | "overflow"): ContextCompactionRecord {
		const timestamp = this.now();
		const summaryMessage: UserMessage = {
			role: "user",
			content: [{ type: "text", text: COMPACTION_SUMMARY_PREFIX + result.summary + COMPACTION_SUMMARY_SUFFIX }],
			timestamp,
		};
		return {
			summary: result.summary,
			summaryMessage,
			firstKeptEntryId: result.firstKeptEntryId,
			tokensBefore: result.tokensBefore,
			...(result.details === undefined ? {} : { details: result.details }),
			reason,
		};
	}

	private maybeStartPrefire(entries: readonly SessionEntry[], settings: CompactionSettings, model: Model<Api>): void {
		if (this.prefireAbortController || this.disposed || !this.circuitBreaker.canAttempt()) return;
		const preparation = prepareCompaction([...entries], settings);
		if (!preparation) return;
		const fingerprint = fingerprintCompactionPrefix([...entries], preparation.firstKeptEntryId);
		if (!fingerprint || this.prefireCache?.fingerprint === fingerprint) return;

		const controller = new AbortController();
		this.prefireAbortController = controller;
		void this.runPrefire(preparation, fingerprint, model, controller.signal).finally(() => {
			if (this.prefireAbortController === controller) this.prefireAbortController = undefined;
		});
	}

	private async runPrefire(
		preparation: CompactionPreparation,
		fingerprint: string,
		model: Model<Api>,
		signal: AbortSignal,
	): Promise<void> {
		try {
			const apiKey = await this.resolveApiKey(model);
			if (!apiKey) return;
			const result = await this.generateCompaction(preparation, model, apiKey, signal);
			if (signal.aborted || this.disposed) return;
			this.prefireCache = { fingerprint, result };
			console.info(
				`[compaction] prefire cached (tokensBefore=${result.tokensBefore}, firstKept=${result.firstKeptEntryId})`,
			);
		} catch {
			// Prefire is best-effort and does not affect the circuit breaker.
		}
	}

	private takeValidPrefire(entries: readonly SessionEntry[]): CompactionResult | undefined {
		const cache = this.prefireCache;
		if (!cache) return undefined;
		this.prefireCache = undefined;
		return isPrefireCacheValid(cache, [...entries]) ? cache.result : undefined;
	}

	private refreshUsage(document: ConversationDocument): void {
		this.currentTokens = estimateContextTokens(
			selectConversationDocumentModelMessages(document).filter(isRuntimeMessage),
		).tokens;
	}
}

function isOverflowFromCurrentModel(
	message: AssistantMessage | undefined,
	model: Model<Api>,
	contextWindow: number,
): boolean {
	return (
		message !== undefined &&
		message.provider === model.provider &&
		message.model === model.id &&
		isContextOverflow(message, contextWindow)
	);
}

function removeAssistantMessage(
	messages: readonly Message[],
	triggeringMessage: AssistantMessage | undefined,
): Message[] {
	if (!triggeringMessage) return [...messages];
	const result = [...messages];
	for (let index = result.length - 1; index >= 0; index -= 1) {
		const message = result[index];
		if (message.role !== "assistant") continue;
		if (
			message === triggeringMessage ||
			(message.timestamp === triggeringMessage.timestamp &&
				message.provider === triggeringMessage.provider &&
				message.model === triggeringMessage.model &&
				message.stopReason === triggeringMessage.stopReason)
		) {
			result.splice(index, 1);
			break;
		}
	}
	return result;
}

function assemblePreparedMessages(
	compactedHistory: readonly Message[],
	input: ContextPreparationInput,
	reason: NonNullable<ContextPreparationInput["reason"]>,
	compactionReason: "threshold" | "overflow",
	triggeringMessage: AssistantMessage | undefined,
): Message[] {
	if (reason === "turn_start") {
		return [...compactedHistory, ...input.messages.slice(input.historyMessages.length)];
	}

	const history =
		compactionReason === "overflow"
			? removeAssistantMessage(compactedHistory, triggeringMessage)
			: [...compactedHistory];
	const transientMessages = input.transientMessages ?? [];
	if (transientMessages.length === 0) return history;
	if (history.length === 0) return [...transientMessages];
	return [history[0], ...transientMessages, ...history.slice(1)];
}

function unchanged(messages: readonly Message[], estimatedTokens: number): PreparedContext {
	return { messages, estimatedTokens };
}

function projectCompactedHistory(
	document: ConversationDocument,
	sessionId: string,
	turnId: string,
	record: ContextCompactionRecord,
): readonly Message[] {
	const sequence = document.journalVersion + 1;
	const projected = applyStoredEventToConversationDocument(
		document,
		{
			type: "context.compacted",
			sessionId,
			turnId,
			record,
			timestamp: record.summaryMessage.timestamp,
		},
		sequence,
		{
			id: `pending-compaction-${turnId}`,
			parentId: document.activeLeafId,
			timestamp: new Date(record.summaryMessage.timestamp).toISOString(),
		},
	);
	return selectConversationDocumentModelMessages(projected);
}

function toSessionEntries(document: ConversationDocument): SessionEntry[] {
	return selectConversationDocumentEntries(document).flatMap((entry) => {
		const converted = toSessionEntry(entry);
		return converted ? [converted] : [];
	});
}

function toSessionEntry(entry: ConversationDocumentEntry): SessionEntry | undefined {
	switch (entry.type) {
		case "message":
			return isRuntimeMessage(entry.message) ? { ...entry, message: entry.message } : undefined;
		case "compaction":
			return {
				type: "compaction",
				id: entry.id,
				parentId: entry.parentId,
				timestamp: entry.timestamp,
				summary: entry.summary,
				firstKeptEntryId: entry.firstKeptEntryId,
				tokensBefore: entry.tokensBefore,
				...(entry.details === undefined ? {} : { details: entry.details }),
				...(entry.fromHook === undefined ? {} : { fromHook: entry.fromHook }),
			};
		case "branch_summary":
			return {
				...entry,
				...(entry.details === undefined ? {} : { details: entry.details }),
				...(entry.fromHook === undefined ? {} : { fromHook: entry.fromHook }),
			};
		case "custom":
			return { ...entry };
		case "custom_message":
			return entry.modelVisible === true && isUserContent(entry.content)
				? {
						type: "custom_message",
						id: entry.id,
						parentId: entry.parentId,
						timestamp: entry.timestamp,
						customType: entry.customType,
						content: entry.content,
						display: entry.display,
						...(entry.details === undefined ? {} : { details: entry.details }),
					}
				: undefined;
		case "thinking_level_change":
		case "model_change":
		case "session_info":
			return { ...entry };
		case "label":
			return {
				type: "label",
				id: entry.id,
				parentId: entry.parentId,
				timestamp: entry.timestamp,
				targetId: entry.targetId,
				label: entry.label,
			};
		case "tool_timing":
			return { ...entry, phases: [...entry.phases] };
	}
}

function isRuntimeMessage(value: unknown): value is Message {
	if (!value || typeof value !== "object" || !("role" in value)) return false;
	return value.role === "user" || value.role === "assistant" || value.role === "toolResult";
}

function isUserContent(value: unknown): value is UserMessage["content"] {
	if (typeof value === "string") return true;
	if (!Array.isArray(value)) return false;
	return value.every((item) => {
		if (!item || typeof item !== "object" || !("type" in item)) return false;
		if (item.type === "text") return "text" in item && typeof item.text === "string";
		return (
			item.type === "image" &&
			"data" in item &&
			typeof item.data === "string" &&
			"mimeType" in item &&
			typeof item.mimeType === "string"
		);
	});
}

import type { AgentMessage } from "@vetta/agent-core";
import {
	type Api,
	type AssistantMessage,
	isContextOverflow,
	type Message,
	type Model,
	type UserMessage,
} from "@vetta/ai";
import type { EcosystemHookRuntime } from "@vetta/ecosystem-adapter/hooks";
import type { RuntimeMessageEnvelope } from "@vetta/runtime-core";
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
	ConversationContinuationResult,
	ManualContextCompactionInput,
	ManualContextCompactionRuntime,
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
} from "../../compaction/index.js";
import type { CodingAgentMemoryCompactionPolicy } from "../../memory/index.js";
import {
	COMPACTION_SUMMARY_PREFIX,
	COMPACTION_SUMMARY_SUFFIX,
	convertToLlm,
	createCustomMessage,
} from "../../model-context/index.js";
import type {
	CodingAgentCompactionEntry as CompactionEntry,
	CodingAgentSessionEntry as SessionEntry,
} from "../../sessions/index.js";
import { restoreCodingAgentSessionAgentMessageEntry } from "../../sessions/index.js";
import type { CodingAgentCompactionExtensionRuntime } from "./greenfield-compaction-extension-runtime.js";

type ContextHookRuntime = Pick<EcosystemHookRuntime, "markSessionStart" | "runPostCompact" | "runPreCompact">;

export interface CodingAgentGreenfieldContextRuntimeOptions {
	readonly hookRuntime: ContextHookRuntime;
	readonly resolveApiKey: (model: Model<Api>) => Promise<string | undefined> | string | undefined;
	readonly resolveSettings?: () => CompactionSettings;
	readonly generateCompaction?: (
		preparation: CompactionPreparation,
		model: Model<Api>,
		apiKey: string,
		customInstructions: string | undefined,
		signal: AbortSignal,
	) => Promise<CompactionResult>;
	readonly extensionRuntime?: CodingAgentCompactionExtensionRuntime;
	readonly memoryRollover?: CodingAgentMemoryCompactionPolicy;
	readonly transformAgentContext?: (
		messages: readonly AgentMessage[],
		signal: AbortSignal,
	) => Promise<readonly AgentMessage[]>;
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
export class CodingAgentGreenfieldContextRuntime
	implements ContextStrategy, ManualContextCompactionRuntime, ModelCallContextTransformer, TurnObserver
{
	readonly id = "coding-agent.context-runtime";
	private readonly hookRuntime: ContextHookRuntime;
	private readonly resolveApiKey: CodingAgentGreenfieldContextRuntimeOptions["resolveApiKey"];
	private readonly resolveSettings: () => CompactionSettings;
	private readonly generateCompaction: NonNullable<CodingAgentGreenfieldContextRuntimeOptions["generateCompaction"]>;
	private readonly extensionRuntime: CodingAgentCompactionExtensionRuntime | undefined;
	private readonly memoryRollover: CodingAgentMemoryCompactionPolicy | undefined;
	private readonly transformAgentContext: CodingAgentGreenfieldContextRuntimeOptions["transformAgentContext"];
	private readonly now: () => number;
	private readonly circuitBreaker = new CompactionCircuitBreaker();
	private prefireCache: PrefireCache | undefined;
	private prefireAbortController: AbortController | undefined;
	private disposed = false;
	private currentTokens = 0;
	private autoCompactionEnabledOverride: boolean | undefined;

	constructor(options: CodingAgentGreenfieldContextRuntimeOptions) {
		this.hookRuntime = options.hookRuntime;
		this.resolveApiKey = options.resolveApiKey;
		this.resolveSettings = options.resolveSettings ?? (() => DEFAULT_COMPACTION_SETTINGS);
		this.generateCompaction =
			options.generateCompaction ??
			((preparation, model, apiKey, customInstructions, signal) =>
				compact(preparation, model, apiKey, customInstructions, signal));
		this.extensionRuntime = options.extensionRuntime;
		this.memoryRollover = options.memoryRollover;
		this.transformAgentContext = options.transformAgentContext;
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
		const baseSettings = this.readSettings();
		const settings = this.memoryRollover?.adjustCompactionSettings(baseSettings, contextWindow) ?? baseSettings;
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
		if (reason === "turn_start") {
			return unchanged(callMessages, assembledTokens);
		}
		if (!model || !input.document || contextWindow <= 0 || !settings.enabled) {
			return unchanged(callMessages, assembledTokens);
		}

		const entries = toSessionEntries(input.compactionSourceDocument ?? input.document);
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
			await this.memoryRollover?.beforeCompaction({
				preparation,
				model,
				apiKey,
				signal,
			});

			const extensionResult = await this.extensionRuntime?.beforeCompaction({
				preparation,
				branchEntries: entries,
				signal,
			});
			if (extensionResult?.cancel) {
				await input.reportObservation({ type: "compaction.end", success: false, source: "agent" });
				return unchanged(callMessages, assembledTokens);
			}
			const prefired = extensionResult?.compaction ? undefined : this.takeValidPrefire(entries);
			const result =
				extensionResult?.compaction ??
				prefired ??
				(await this.generateCompaction(preparation, model, apiKey, undefined, signal));
			signal.throwIfAborted();
			const record = this.toRecord(result, compactionReason, extensionResult?.compaction !== undefined);
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

	async onCompactionCommitted(
		record: ContextCompactionRecord,
		_input: ContextPreparationInput,
		signal: AbortSignal,
		document?: ConversationDocument,
	) {
		if (!this.memoryRollover) return this.finalizeAutomaticCompaction(record, signal, document);
		this.memoryRollover.beforeContinuation(record);
		return { continueExecution: true, continuation: this.memoryRollover.continuationAfterCompaction() };
	}

	async onCompactionContinuationCommitted(
		record: ContextCompactionRecord,
		_input: ContextPreparationInput,
		result: ConversationContinuationResult,
		signal: AbortSignal,
	) {
		return this.finalizeAutomaticCompaction(record, signal, result.seedDocument, true);
	}

	async onCompactionContinuationFailed(): Promise<void> {
		this.circuitBreaker.recordFailure();
	}

	async compactManual(input: ManualContextCompactionInput, signal: AbortSignal): Promise<ContextCompactionRecord> {
		signal.throwIfAborted();
		const model = input.modelBinding?.model;
		if (!model) throw new Error("No model selected");
		const apiKey = await this.resolveApiKey(model);
		if (!apiKey) throw new Error(`No API key for ${model.provider}`);

		const entries = toSessionEntries(input.document);
		const preparation = prepareCompaction(entries, this.readSettings());
		if (!preparation) {
			const lastEntry = entries[entries.length - 1];
			if (lastEntry?.type === "compaction") throw new Error("Already compacted");
			throw new Error("Nothing to compact (session too small)");
		}

		const preHookOutcome = await this.hookRuntime.runPreCompact("manual", signal);
		if (preHookOutcome.shouldStop || preHookOutcome.shouldBlock) {
			throw new Error(preHookOutcome.stopReason ?? preHookOutcome.blockReason ?? "Compaction blocked by hook");
		}
		const extensionResult = await this.extensionRuntime?.beforeCompaction({
			preparation,
			branchEntries: entries,
			customInstructions: input.customInstructions,
			signal,
		});
		if (extensionResult?.cancel) throw new Error("Compaction cancelled");
		const result =
			extensionResult?.compaction ??
			(await this.generateCompaction(preparation, model, apiKey, input.customInstructions, signal));
		if (signal.aborted) throw new Error("Compaction cancelled");
		return this.toRecord(result, "manual", extensionResult?.compaction !== undefined);
	}

	async onManualCompactionCommitted(
		record: ContextCompactionRecord,
		_input: ManualContextCompactionInput,
		signal: AbortSignal,
		document?: ConversationDocument,
	): Promise<void> {
		await this.notifyExtensionCommitted(record, document);
		await this.hookRuntime.runPostCompact("manual", signal);
		this.hookRuntime.markSessionStart("compact");
	}

	readAutoCompactionEnabled(): boolean {
		return this.readSettings().enabled;
	}

	setAutoCompactionEnabled(enabled: boolean): void {
		this.autoCompactionEnabledOverride = enabled;
	}

	async transform(input: ModelCallContextTransformationInput, signal: AbortSignal): Promise<readonly Message[]> {
		signal.throwIfAborted();
		const envelopes = input.messageEnvelopes ?? input.messages.map(toMessageEnvelope);
		const agentMessages = envelopes.flatMap(toAgentMessages);
		const invisibleIdentities = readInvisibleIdentityCounts(envelopes);
		const extensionMessages = this.transformAgentContext
			? await this.transformAgentContext(agentMessages, signal)
			: agentMessages;
		signal.throwIfAborted();
		const messages = convertToLlm(
			microcompact([...extensionMessages]).filter((message) => !consumeIdentity(invisibleIdentities, message)),
		);
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

	private toRecord(
		result: CompactionResult,
		reason: ContextCompactionRecord["reason"],
		fromExtension: boolean,
	): ContextCompactionRecord {
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
			...(fromExtension ? { fromHook: true } : {}),
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
			const result = await this.generateCompaction(preparation, model, apiKey, undefined, signal);
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

	private readSettings(): CompactionSettings {
		const settings = this.resolveSettings();
		return this.autoCompactionEnabledOverride === undefined
			? settings
			: { ...settings, enabled: this.autoCompactionEnabledOverride };
	}

	private async notifyExtensionCommitted(
		record: ContextCompactionRecord,
		document: ConversationDocument | undefined,
		allowRemappedFirstKept = false,
	): Promise<void> {
		if (!this.extensionRuntime || !document) return;
		const entry = [...toSessionEntries(document)]
			.reverse()
			.find(
				(candidate): candidate is CompactionEntry =>
					candidate.type === "compaction" &&
					candidate.summary === record.summary &&
					(allowRemappedFirstKept || candidate.firstKeptEntryId === record.firstKeptEntryId),
			);
		if (!entry) return;
		await this.extensionRuntime.afterCompaction({
			compactionEntry: entry,
			fromExtension: record.fromHook === true,
		});
	}

	private async finalizeAutomaticCompaction(
		record: ContextCompactionRecord,
		signal: AbortSignal,
		document: ConversationDocument | undefined,
		allowRemappedFirstKept = false,
	) {
		try {
			await this.notifyExtensionCommitted(record, document, allowRemappedFirstKept);
			const outcome = await this.hookRuntime.runPostCompact("auto", signal);
			this.hookRuntime.markSessionStart("compact");
			this.circuitBreaker.recordSuccess();
			return { continueExecution: !outcome.shouldStop };
		} catch (error) {
			this.circuitBreaker.recordFailure();
			throw error;
		}
	}
}

function toAgentMessages(envelope: RuntimeMessageEnvelope): AgentMessage[] {
	if (envelope.kind === "message") return [envelope.message];
	if (envelope.kind === "context") {
		return [
			createCustomMessage(
				envelope.record.type,
				envelope.record.content,
				envelope.record.display ?? false,
				envelope.record.metadata,
				new Date(envelope.timestamp).toISOString(),
			),
		];
	}
	return isAgentMessage(envelope.identity)
		? [envelope.identity]
		: envelope.modelMessage
			? [envelope.modelMessage]
			: [];
}

function toMessageEnvelope(message: Message): RuntimeMessageEnvelope {
	return { kind: "message", message };
}

function readInvisibleIdentityCounts(envelopes: readonly RuntimeMessageEnvelope[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const envelope of envelopes) {
		const invisible =
			(envelope.kind === "context" && !envelope.record.modelVisible) ||
			(envelope.kind === "opaque" && !envelope.modelMessage);
		if (!invisible) continue;
		for (const message of toAgentMessages(envelope)) {
			const key = messageIdentityKey(message);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return counts;
}

function consumeIdentity(counts: Map<string, number>, message: AgentMessage): boolean {
	const key = messageIdentityKey(message);
	const count = counts.get(key) ?? 0;
	if (count === 0) return false;
	if (count === 1) counts.delete(key);
	else counts.set(key, count - 1);
	return true;
}

function messageIdentityKey(message: AgentMessage): string {
	const discriminator = message.role === "custom" ? message.customType : message.role;
	return `${discriminator}:${message.timestamp}`;
}

function isAgentMessage(value: unknown): value is AgentMessage {
	return (
		value !== null &&
		typeof value === "object" &&
		"role" in value &&
		typeof value.role === "string" &&
		AGENT_MESSAGE_ROLES.has(value.role)
	);
}

const AGENT_MESSAGE_ROLES = new Set([
	"user",
	"assistant",
	"toolResult",
	"bashExecution",
	"custom",
	"branchSummary",
	"compactionSummary",
]);

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
			return (
				restoreCodingAgentSessionAgentMessageEntry(entry) ??
				(entry.modelVisible === true && isUserContent(entry.content)
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
					: undefined)
			);
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

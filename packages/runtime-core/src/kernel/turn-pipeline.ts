import type { Message, StopReason } from "@vetta/ai";
import type { ConversationDocument, ConversationDocumentReader } from "../conversation/document.js";
import type { RuntimeSessionObservationEvent } from "../session-observation.js";
import { ContextCompactionCommitter } from "./context-compaction-committer.js";
import type {
	Clock,
	ContextCompactionRecord,
	ContextProvider,
	ConversationRepository,
	EventSink,
	IdGenerator,
	KernelEvent,
	MessageAppendedEvent,
	RuntimeSnapshot,
	RuntimeSnapshotLease,
	RuntimeSnapshotProvider,
	RuntimeTurnModelBinding,
	RuntimeTurnModelBindingProvider,
	SessionContextRecord,
	SessionInput,
	StoredConversation,
	StoredSessionEvent,
	TurnEngineContextCheckpointRequest,
	TurnEngineContextCheckpointResult,
	TurnEnginePort,
	TurnInputQueue,
	TurnPipelineStage,
	TurnResult,
} from "./contracts.js";
import { type ConversationRecoveryPolicy, FailInterruptedTurnRecoveryPolicy } from "./conversation-recovery.js";
import { KERNEL_ERROR_CODES, KernelError, turnProtocolError } from "./errors.js";
import type { RuntimeSessionContextBuffer } from "./session-context-buffer.js";

export interface TurnPipelineOptions {
	readonly repository: ConversationRepository;
	readonly snapshotProvider: RuntimeSnapshotProvider;
	readonly modelBindingProvider?: RuntimeTurnModelBindingProvider;
	readonly turnEngine: TurnEnginePort;
	readonly eventSink: EventSink;
	readonly clock: Clock;
	readonly idGenerator: IdGenerator;
	readonly recoveryPolicy?: ConversationRecoveryPolicy;
	readonly runtimeContext?: RuntimeSessionContextBuffer;
	readonly conversationDocumentReader?: ConversationDocumentReader;
	readonly contextCompactionCommitter?: ContextCompactionCommitter;
}

interface MutableTurnState {
	version: number;
	started: boolean;
	snapshot?: RuntimeSnapshot;
	readonly messages: Message[];
}

interface ContextCheckpointPreparation {
	readonly sessionId: string;
	readonly turnId: string;
	readonly snapshot: RuntimeSnapshot;
	readonly modelBinding?: RuntimeTurnModelBinding;
	readonly providerMessages: readonly Message[];
	readonly request: TurnEngineContextCheckpointRequest;
	readonly state: MutableTurnState;
	readonly signal: AbortSignal;
}

export class TurnPipeline {
	private readonly repository: ConversationRepository;
	private readonly snapshotProvider: RuntimeSnapshotProvider;
	private readonly modelBindingProvider: RuntimeTurnModelBindingProvider | undefined;
	private readonly turnEngine: TurnEnginePort;
	private readonly eventSink: EventSink;
	private readonly clock: Clock;
	private readonly idGenerator: IdGenerator;
	private readonly recoveryPolicy: ConversationRecoveryPolicy;
	private readonly runtimeContext: RuntimeSessionContextBuffer | undefined;
	private readonly conversationDocumentReader: ConversationDocumentReader | undefined;
	private readonly contextCompactionCommitter: ContextCompactionCommitter;

	constructor(options: TurnPipelineOptions) {
		this.repository = options.repository;
		this.snapshotProvider = options.snapshotProvider;
		this.modelBindingProvider = options.modelBindingProvider;
		this.turnEngine = options.turnEngine;
		this.eventSink = options.eventSink;
		this.clock = options.clock;
		this.idGenerator = options.idGenerator;
		this.recoveryPolicy = options.recoveryPolicy ?? new FailInterruptedTurnRecoveryPolicy();
		this.runtimeContext = options.runtimeContext;
		this.conversationDocumentReader = options.conversationDocumentReader;
		this.contextCompactionCommitter =
			options.contextCompactionCommitter ??
			new ContextCompactionCommitter({
				repository: options.repository,
				eventSink: options.eventSink,
				clock: options.clock,
				conversationDocumentReader: options.conversationDocumentReader,
			});
	}

	async createSession(sessionId: string): Promise<void> {
		await this.repository.create({
			sessionId,
			createdAt: this.clock.now(),
		});
	}

	async resumeSession(sessionId: string): Promise<void> {
		const conversation = await this.repository.load(sessionId);
		const plan = this.recoveryPolicy.plan(conversation);
		if (plan.status === "ready") return;

		const event: StoredSessionEvent = {
			type: "turn.failed",
			sessionId,
			turnId: plan.turnId,
			error: {
				code: KERNEL_ERROR_CODES.TURN_INTERRUPTED,
				message: "Turn interrupted before the session was resumed",
			},
			timestamp: this.clock.now(),
		};
		await this.repository.append(sessionId, conversation.version, [event]);
		await this.publishSafely(event);
	}

	async run(
		sessionId: string,
		input: SessionInput,
		signal: AbortSignal,
		inputQueue?: TurnInputQueue,
	): Promise<TurnResult> {
		return this.runTurn(sessionId, input, signal, inputQueue);
	}

	async continue(sessionId: string, signal: AbortSignal, inputQueue?: TurnInputQueue): Promise<TurnResult> {
		return this.runTurn(sessionId, undefined, signal, inputQueue);
	}

	private async runTurn(
		sessionId: string,
		input: SessionInput | undefined,
		signal: AbortSignal,
		inputQueue: TurnInputQueue | undefined,
	): Promise<TurnResult> {
		const turnId = this.idGenerator.next("turn");
		const state: MutableTurnState = {
			version: 0,
			started: false,
			messages: [],
		};
		let snapshotLease: RuntimeSnapshotLease | undefined;

		try {
			await this.enterStage(sessionId, turnId, "admission");
			signal.throwIfAborted();

			await this.enterStage(sessionId, turnId, "snapshot_binding");
			snapshotLease = await this.snapshotProvider.acquire();
			const snapshot = snapshotLease.snapshot;
			const modelBinding = this.modelBindingProvider?.bind();
			state.snapshot = snapshot;
			signal.throwIfAborted();

			await this.enterStage(sessionId, turnId, "conversation_loading");
			const conversation = await this.repository.load(sessionId);
			const conversationDocument = await this.conversationDocumentReader?.readDocument(sessionId);
			state.version = conversation.version;
			signal.throwIfAborted();

			const startedAt = this.clock.now();
			const startEvents: StoredSessionEvent[] = [
				{
					type: "turn.started",
					sessionId,
					turnId,
					snapshotId: snapshot.id,
					timestamp: startedAt,
				},
			];
			if (input) {
				for (const record of input.context ?? []) {
					startEvents.push({
						type: "context.appended",
						sessionId,
						turnId,
						record,
						timestamp: startedAt,
					});
				}
				startEvents.push({
					type: "message.appended",
					sessionId,
					turnId,
					message: input.message,
					timestamp: startedAt,
				});
			}
			await this.append(sessionId, state, signal, startEvents);
			state.started = true;

			await this.enterStage(sessionId, turnId, "context_assembly");
			const providerMessages = await this.collectProviderMessages(
				snapshot.contextProviders,
				sessionId,
				turnId,
				conversation,
				input,
				signal,
			);
			const inputContextMessages = input?.context
				?.filter(({ modelVisible }) => modelVisible)
				.map((record) => ({
					role: "user" as const,
					content: record.content,
					timestamp: startedAt,
				}));
			const assembledMessages = input
				? [...conversation.messages, ...providerMessages, ...(inputContextMessages ?? []), input.message]
				: [...conversation.messages, ...providerMessages];

			await this.enterStage(sessionId, turnId, "context_preparation");
			const preparationInput = {
				sessionId,
				turnId,
				messages: assembledMessages,
				historyMessages: conversation.messages,
				transientMessages: providerMessages,
				reason: "turn_start" as const,
				tokenBudget: snapshot.tokenBudget,
				reservedOutputTokens: snapshot.reservedOutputTokens,
				modelBinding,
				document: conversationDocument,
				reportObservation: (observation: RuntimeSessionObservationEvent) =>
					this.publishObservation(sessionId, turnId, observation),
			};
			const prepared = await snapshot.contextStrategy.prepare(preparationInput, signal);
			signal.throwIfAborted();

			if (prepared.compaction) {
				const document = await this.commitCompaction(
					sessionId,
					turnId,
					prepared.compaction,
					state,
					signal,
					snapshot,
				);
				await snapshot.contextStrategy.onCompactionCommitted?.(
					prepared.compaction,
					preparationInput,
					signal,
					document,
				);
			}

			await this.enterStage(sessionId, turnId, "execution");
			let stopReason: StopReason | undefined;
			for await (const event of this.turnEngine.execute({
				sessionId,
				turnId,
				snapshot,
				modelBinding,
				messages: prepared.messages,
				signal,
				inputQueue,
				input,
				contextCheckpoints: true,
			})) {
				if (stopReason) {
					throw turnProtocolError("Turn engine emitted an event after completion");
				}
				if (event.type === "context_checkpoint") {
					try {
						signal.throwIfAborted();
						const result = await this.prepareContextCheckpoint({
							sessionId,
							turnId,
							snapshot,
							modelBinding,
							providerMessages,
							request: event.request,
							state,
							signal,
						});
						event.request.complete(result);
					} catch (error) {
						event.request.fail(error);
						throw error;
					}
					continue;
				}
				signal.throwIfAborted();
				if (event.type === "completed") {
					stopReason = event.stopReason;
					continue;
				}
				if (event.type === "observation") {
					await this.publishObservation(sessionId, turnId, event.observation);
					continue;
				}

				const storedEvent: MessageAppendedEvent = {
					type: "message.appended",
					sessionId,
					turnId,
					message: event.message,
					timestamp: this.clock.now(),
				};
				await this.append(sessionId, state, signal, [storedEvent]);
				state.messages.push(event.message);
				await this.appendRuntimeContext(sessionId, turnId, state, signal);
			}

			if (!stopReason) {
				throw turnProtocolError("Turn engine completed without a terminal event");
			}

			await this.enterStage(sessionId, turnId, "finalization");
			await this.appendRuntimeContext(sessionId, turnId, state, signal);
			await this.append(sessionId, state, signal, [
				{
					type: "turn.completed",
					sessionId,
					turnId,
					stopReason,
					timestamp: this.clock.now(),
				},
			]);

			return {
				status: "completed",
				turnId,
				stopReason,
				messages: state.messages,
			};
		} catch (error) {
			if (signal.aborted || isAbortError(error)) {
				const reason = abortReason(signal);
				await this.appendTerminalSafely(sessionId, turnId, state, signal, {
					type: "turn.cancelled",
					sessionId,
					turnId,
					reason,
					timestamp: this.clock.now(),
				});
				return {
					status: "cancelled",
					turnId,
					reason,
					messages: state.messages,
				};
			}

			const normalized = normalizeError(error);
			await this.appendTerminalSafely(sessionId, turnId, state, signal, {
				type: "turn.failed",
				sessionId,
				turnId,
				error: normalized,
				timestamp: this.clock.now(),
			});
			return {
				status: "failed",
				turnId,
				error: normalized,
				messages: state.messages,
			};
		} finally {
			this.runtimeContext?.clear();
			await this.releaseSnapshotSafely(snapshotLease, sessionId, turnId);
		}
	}

	private async prepareContextCheckpoint(
		checkpoint: ContextCheckpointPreparation,
	): Promise<TurnEngineContextCheckpointResult | undefined> {
		const { request, sessionId, signal, snapshot, state, turnId } = checkpoint;
		const conversation = await this.repository.load(sessionId);
		const currentDocument = await this.conversationDocumentReader?.readDocument(sessionId);
		const preparationInput = {
			sessionId,
			turnId,
			messages: request.messages,
			historyMessages: conversation.messages,
			transientMessages: checkpoint.providerMessages,
			reason: request.reason,
			triggeringAssistantMessage: request.assistantMessage,
			recoveryAttempt: request.recoveryAttempt,
			tokenBudget: snapshot.tokenBudget,
			reservedOutputTokens: snapshot.reservedOutputTokens,
			modelBinding: checkpoint.modelBinding,
			document: currentDocument,
			reportObservation: (observation: RuntimeSessionObservationEvent) =>
				this.publishObservation(sessionId, turnId, observation),
		} as const;
		const prepared = await snapshot.contextStrategy.prepare(preparationInput, signal);
		signal.throwIfAborted();

		if (!prepared.compaction) {
			if (request.reason === "assistant_error") return undefined;
			return { messages: prepared.messages };
		}

		const committedDocument = await this.commitCompaction(
			sessionId,
			turnId,
			prepared.compaction,
			state,
			signal,
			snapshot,
		);
		const commitResult = await snapshot.contextStrategy.onCompactionCommitted?.(
			prepared.compaction,
			preparationInput,
			signal,
			committedDocument,
		);
		const transformedMessages =
			snapshot.modelCallContextTransformer && checkpoint.modelBinding
				? await snapshot.modelCallContextTransformer.transform(
						{
							sessionId,
							turnId,
							messages: prepared.messages,
							modelBinding: checkpoint.modelBinding,
						},
						signal,
					)
				: prepared.messages;

		return {
			messages: transformedMessages,
			contextMessages: prepared.messages,
			retry:
				request.reason !== "model_call" &&
				prepared.compaction.reason === "overflow" &&
				commitResult?.continueExecution !== false,
		};
	}

	private async commitCompaction(
		sessionId: string,
		turnId: string,
		record: ContextCompactionRecord,
		state: MutableTurnState,
		signal: AbortSignal,
		snapshot: RuntimeSnapshot,
	): Promise<ConversationDocument | undefined> {
		const result = await this.contextCompactionCommitter.commit({
			sessionId,
			turnId,
			expectedVersion: state.version,
			record,
			snapshot,
			signal,
		});
		state.version = result.version;
		return result.document;
	}

	private async collectProviderMessages(
		providers: readonly ContextProvider[],
		sessionId: string,
		turnId: string,
		conversation: StoredConversation,
		input: SessionInput | undefined,
		signal: AbortSignal,
	): Promise<readonly Message[]> {
		const messages: Message[] = [];
		for (const provider of providers) {
			signal.throwIfAborted();
			const provided = await provider.provide(
				{
					sessionId,
					turnId,
					conversation,
					input,
				},
				signal,
			);
			messages.push(...provided);
		}
		return messages;
	}

	private async append(
		sessionId: string,
		state: MutableTurnState,
		signal: AbortSignal,
		events: readonly StoredSessionEvent[],
	): Promise<void> {
		const result = await this.repository.append(sessionId, state.version, events);
		state.version = result.version;
		for (const event of events) {
			await this.publishSafely(event);
			await this.notifyObserversSafely(state.snapshot, event, signal);
		}
	}

	private async appendTerminalSafely(
		sessionId: string,
		turnId: string,
		state: MutableTurnState,
		signal: AbortSignal,
		event: StoredSessionEvent,
	): Promise<void> {
		if (!state.started) return;
		try {
			await this.appendRuntimeContext(sessionId, turnId, state, signal);
			await this.append(sessionId, state, signal, [event]);
		} catch (error) {
			await this.publishSafely({
				type: "observer.failed",
				sessionId,
				turnId,
				observerId: "conversation-repository",
				error: errorMessage(error),
				timestamp: this.clock.now(),
			});
		}
	}

	private async appendRuntimeContext(
		sessionId: string,
		turnId: string,
		state: MutableTurnState,
		signal: AbortSignal,
	): Promise<void> {
		await this.runtimeContext?.flush(async (records) => {
			const timestamp = this.clock.now();
			await this.append(
				sessionId,
				state,
				signal,
				records.map((record: SessionContextRecord) => ({
					type: "context.appended" as const,
					sessionId,
					turnId,
					record,
					timestamp,
				})),
			);
		});
	}

	private async enterStage(sessionId: string, turnId: string, stage: TurnPipelineStage): Promise<void> {
		await this.publishSafely({
			type: "pipeline.stage",
			sessionId,
			turnId,
			stage,
			timestamp: this.clock.now(),
		});
	}

	private async publishObservation(
		sessionId: string,
		turnId: string,
		observation: RuntimeSessionObservationEvent,
	): Promise<void> {
		await this.publishSafely({
			type: "session.observation",
			sessionId,
			turnId,
			observation,
			timestamp: observation.timestamp ?? this.clock.now(),
		});
	}

	private async notifyObserversSafely(
		snapshot: RuntimeSnapshot | undefined,
		event: StoredSessionEvent,
		signal: AbortSignal,
	): Promise<void> {
		if (!snapshot) return;
		for (const observer of snapshot.observers) {
			try {
				await observer.observe(event, signal);
			} catch (error) {
				await this.publishSafely({
					type: "observer.failed",
					sessionId: event.sessionId,
					turnId: event.turnId ?? "manual-context-compaction",
					observerId: observer.id,
					error: errorMessage(error),
					timestamp: this.clock.now(),
				});
			}
		}
	}

	private async publishSafely(event: KernelEvent): Promise<void> {
		try {
			await this.eventSink.publish(event);
		} catch {
			// Event sinks are observational and cannot change turn semantics.
		}
	}

	private async releaseSnapshotSafely(
		lease: RuntimeSnapshotLease | undefined,
		sessionId: string,
		turnId: string,
	): Promise<void> {
		if (!lease) return;
		try {
			await lease.release();
		} catch (error) {
			await this.publishSafely({
				type: "observer.failed",
				sessionId,
				turnId,
				observerId: "runtime-snapshot-provider",
				error: errorMessage(error),
				timestamp: this.clock.now(),
			});
		}
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function abortReason(signal: AbortSignal): string | undefined {
	if (typeof signal.reason === "string") return signal.reason;
	if (signal.reason instanceof Error) return signal.reason.message;
	return undefined;
}

function normalizeError(error: unknown): { readonly code: string; readonly message: string } {
	if (error instanceof KernelError) {
		return {
			code: error.code,
			message: error.message,
		};
	}
	return {
		code: KERNEL_ERROR_CODES.TURN_FAILED,
		message: errorMessage(error),
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

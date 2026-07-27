import type { Message, StopReason } from "@vetta/ai";
import type {
	Clock,
	ContextProvider,
	ConversationRepository,
	EventSink,
	IdGenerator,
	KernelEvent,
	MessageAppendedEvent,
	RuntimeSnapshot,
	RuntimeSnapshotLease,
	RuntimeSnapshotProvider,
	SessionInput,
	StoredConversation,
	StoredSessionEvent,
	TurnEnginePort,
	TurnInputQueue,
	TurnPipelineStage,
	TurnResult,
} from "./contracts.js";
import { type ConversationRecoveryPolicy, FailInterruptedTurnRecoveryPolicy } from "./conversation-recovery.js";
import { KERNEL_ERROR_CODES, KernelError, turnProtocolError } from "./errors.js";

export interface TurnPipelineOptions {
	readonly repository: ConversationRepository;
	readonly snapshotProvider: RuntimeSnapshotProvider;
	readonly turnEngine: TurnEnginePort;
	readonly eventSink: EventSink;
	readonly clock: Clock;
	readonly idGenerator: IdGenerator;
	readonly recoveryPolicy?: ConversationRecoveryPolicy;
}

interface MutableTurnState {
	version: number;
	started: boolean;
	snapshot?: RuntimeSnapshot;
	readonly messages: Message[];
}

export class TurnPipeline {
	private readonly repository: ConversationRepository;
	private readonly snapshotProvider: RuntimeSnapshotProvider;
	private readonly turnEngine: TurnEnginePort;
	private readonly eventSink: EventSink;
	private readonly clock: Clock;
	private readonly idGenerator: IdGenerator;
	private readonly recoveryPolicy: ConversationRecoveryPolicy;

	constructor(options: TurnPipelineOptions) {
		this.repository = options.repository;
		this.snapshotProvider = options.snapshotProvider;
		this.turnEngine = options.turnEngine;
		this.eventSink = options.eventSink;
		this.clock = options.clock;
		this.idGenerator = options.idGenerator;
		this.recoveryPolicy = options.recoveryPolicy ?? new FailInterruptedTurnRecoveryPolicy();
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
			state.snapshot = snapshot;
			signal.throwIfAborted();

			await this.enterStage(sessionId, turnId, "conversation_loading");
			const conversation = await this.repository.load(sessionId);
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
			const assembledMessages = input
				? [...conversation.messages, ...providerMessages, input.message]
				: [...conversation.messages, ...providerMessages];

			await this.enterStage(sessionId, turnId, "context_preparation");
			const prepared = await snapshot.contextStrategy.prepare(
				{
					messages: assembledMessages,
					tokenBudget: snapshot.tokenBudget,
					reservedOutputTokens: snapshot.reservedOutputTokens,
				},
				signal,
			);
			signal.throwIfAborted();

			if (prepared.compaction) {
				await this.append(sessionId, state, signal, [
					{
						type: "context.compacted",
						sessionId,
						turnId,
						record: prepared.compaction,
						timestamp: this.clock.now(),
					},
				]);
			}

			await this.enterStage(sessionId, turnId, "execution");
			let stopReason: StopReason | undefined;
			for await (const event of this.turnEngine.execute({
				sessionId,
				turnId,
				snapshot,
				messages: prepared.messages,
				signal,
				inputQueue,
			})) {
				signal.throwIfAborted();
				if (stopReason) {
					throw turnProtocolError("Turn engine emitted an event after completion");
				}
				if (event.type === "completed") {
					stopReason = event.stopReason;
					continue;
				}
				if (event.type === "observation") {
					await this.publishSafely({
						type: "session.observation",
						sessionId,
						turnId,
						observation: event.observation,
						timestamp: event.observation.timestamp ?? this.clock.now(),
					});
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
			}

			if (!stopReason) {
				throw turnProtocolError("Turn engine completed without a terminal event");
			}

			await this.enterStage(sessionId, turnId, "finalization");
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
			await this.releaseSnapshotSafely(snapshotLease, sessionId, turnId);
		}
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

	private async enterStage(sessionId: string, turnId: string, stage: TurnPipelineStage): Promise<void> {
		await this.publishSafely({
			type: "pipeline.stage",
			sessionId,
			turnId,
			stage,
			timestamp: this.clock.now(),
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
					turnId: event.turnId,
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

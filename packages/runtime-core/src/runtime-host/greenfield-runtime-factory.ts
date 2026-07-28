import type { StreamFn } from "@vetta/agent-core";
import type { SimpleStreamOptions } from "@vetta/ai";
import type { ConversationDocumentStore } from "../conversation/index.js";
import {
	AgentCoreTurnEngine,
	type Clock,
	type ConversationRepository,
	createAgentSession,
	type EventSink,
	type IdGenerator,
	RandomIdGenerator,
	type RuntimeSnapshotProvider,
	resumeAgentSession,
	type SessionInputQueueMode,
	SystemClock,
	TurnPipeline,
} from "../kernel/index.js";
import type { GreenfieldRuntimeModelRuntime } from "./greenfield-model-runtime.js";
import type { GreenfieldRuntimeAssembly, GreenfieldRuntimeFactory } from "./greenfield-session-backend.js";
import type {
	GreenfieldRuntimeSessionIdentity,
	GreenfieldRuntimeStateSource,
} from "./greenfield-session-projection.js";

export type GreenfieldRuntimeOperation = "create" | "resume";

export interface GreenfieldRuntimeResources {
	readonly sessionId: string;
	readonly repository: ConversationRepository;
	readonly conversationDocumentStore: ConversationDocumentStore;
	readonly snapshotProvider: RuntimeSnapshotProvider;
	readonly modelRuntime: GreenfieldRuntimeModelRuntime;
	readonly identity: GreenfieldRuntimeSessionIdentity;
	readonly stateSource: GreenfieldRuntimeStateSource;
	readonly steeringMode?: SessionInputQueueMode;
	readonly followUpMode?: SessionInputQueueMode;
	dispose?(): Promise<void>;
}

export interface ComposedGreenfieldRuntimeFactoryOptions<TCreateOptions> {
	createResources(options: TCreateOptions, operation: GreenfieldRuntimeOperation): Promise<GreenfieldRuntimeResources>;
	readonly streamFn?: StreamFn;
	readonly streamOptions?: Omit<SimpleStreamOptions, "sessionId" | "signal">;
	readonly clock?: Clock;
	readonly idGenerator?: IdGenerator;
}

/**
 * 只组合 Runtime-owned 对象的默认 Greenfield Factory。
 *
 * Repository、Snapshot、Model Runtime 和宿主资源仍由上层提供；本类负责保证
 * AgentSession、TurnPipeline、TurnEngine 使用同一组 Session 资源。
 */
export class ComposedGreenfieldRuntimeFactory<TCreateOptions> implements GreenfieldRuntimeFactory<TCreateOptions> {
	private readonly options: ComposedGreenfieldRuntimeFactoryOptions<TCreateOptions>;
	private readonly clock: Clock;
	private readonly idGenerator: IdGenerator;

	constructor(options: ComposedGreenfieldRuntimeFactoryOptions<TCreateOptions>) {
		this.options = options;
		this.clock = options.clock ?? new SystemClock();
		this.idGenerator = options.idGenerator ?? new RandomIdGenerator();
	}

	create(options: TCreateOptions, eventSink: EventSink): Promise<GreenfieldRuntimeAssembly> {
		return this.assemble("create", options, eventSink);
	}

	resume(options: TCreateOptions, eventSink: EventSink): Promise<GreenfieldRuntimeAssembly> {
		return this.assemble("resume", options, eventSink);
	}

	private async assemble(
		operation: GreenfieldRuntimeOperation,
		options: TCreateOptions,
		eventSink: EventSink,
	): Promise<GreenfieldRuntimeAssembly> {
		const resources = await this.options.createResources(options, operation);
		try {
			const turnEngine = new AgentCoreTurnEngine({
				streamFn: this.options.streamFn,
				streamOptions: this.options.streamOptions,
				resolveApiKey: (model) => resources.modelRuntime.resolveApiKey(model),
			});
			const pipeline = new TurnPipeline({
				repository: resources.repository,
				snapshotProvider: resources.snapshotProvider,
				modelBindingProvider: resources.modelRuntime,
				turnEngine,
				eventSink,
				clock: this.clock,
				idGenerator: this.idGenerator,
			});
			const sessionOptions = {
				id: resources.sessionId,
				pipeline,
				steeringMode: resources.steeringMode,
				followUpMode: resources.followUpMode,
			};
			const session =
				operation === "create"
					? await createAgentSession(sessionOptions)
					: await resumeAgentSession(sessionOptions);
			const dispose = resources.dispose;
			return {
				session,
				repository: resources.repository,
				conversationDocumentStore: resources.conversationDocumentStore,
				modelRuntime: resources.modelRuntime,
				identity: resources.identity,
				stateSource: resources.stateSource,
				dispose: dispose ? () => dispose.call(resources) : undefined,
			};
		} catch (error) {
			await resources.dispose?.();
			throw error;
		}
	}
}

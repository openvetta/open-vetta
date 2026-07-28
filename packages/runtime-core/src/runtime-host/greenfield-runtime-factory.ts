import type { StreamFn } from "@vetta/agent-core";
import type { SimpleStreamOptions } from "@vetta/ai";
import type { ConversationDocumentStore } from "../conversation/index.js";
import {
	AgentCoreTurnEngine,
	BufferedRuntimeSessionContext,
	type Clock,
	ContextCompactionCommitter,
	type ConversationContinuationResult,
	type ConversationContinuationStore,
	type ConversationRepository,
	createAgentSession,
	type EventSink,
	type IdGenerator,
	type ManualContextCompactionRuntime,
	RandomIdGenerator,
	type RuntimeSessionContextAppender,
	type RuntimeSnapshotProvider,
	resumeAgentSession,
	type SessionInputQueueMode,
	SystemClock,
	TurnPipeline,
} from "../kernel/index.js";
import type { GreenfieldRuntimeDocumentParticipant } from "./greenfield-document-participant.js";
import type { GreenfieldRuntimeModelRuntime } from "./greenfield-model-runtime.js";
import type {
	GreenfieldPromptAdapter,
	GreenfieldRuntimeAssembly,
	GreenfieldRuntimeFactory,
} from "./greenfield-session-backend.js";
import { GreenfieldSessionContextController } from "./greenfield-session-context-controller.js";
import type {
	GreenfieldRuntimeSessionIdentity,
	GreenfieldRuntimeStateSource,
} from "./greenfield-session-projection.js";
import type { RuntimeSessionTodoController } from "./session-ports.js";

export type GreenfieldRuntimeOperation = "create" | "resume";

export interface GreenfieldRuntimeResourceContext {
	readonly operation: GreenfieldRuntimeOperation;
	readonly contextAppender: RuntimeSessionContextAppender;
	abortCurrentRun(): void;
}

export interface GreenfieldRuntimeResources {
	readonly sessionId: string;
	readonly repository: ConversationRepository;
	readonly conversationDocumentStore: ConversationDocumentStore;
	readonly conversationContinuationStore?: ConversationContinuationStore;
	readonly promptAdapter: GreenfieldPromptAdapter;
	readonly snapshotProvider: RuntimeSnapshotProvider;
	readonly modelRuntime: GreenfieldRuntimeModelRuntime;
	readonly identity: GreenfieldRuntimeSessionIdentity;
	readonly stateSource: GreenfieldRuntimeStateSource;
	readonly documentParticipants?: readonly GreenfieldRuntimeDocumentParticipant[];
	readonly todoController?: RuntimeSessionTodoController;
	readonly contextRuntime?: ManualContextCompactionRuntime;
	readonly steeringMode?: SessionInputQueueMode;
	readonly followUpMode?: SessionInputQueueMode;
	onConversationContinued?(result: ConversationContinuationResult): Promise<void> | void;
	dispose?(): Promise<void>;
}

export interface ComposedGreenfieldRuntimeFactoryOptions<TCreateOptions> {
	createResources(
		options: TCreateOptions,
		context: GreenfieldRuntimeResourceContext,
	): Promise<GreenfieldRuntimeResources>;
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
		const runtimeContext = new BufferedRuntimeSessionContext();
		let abortCurrentRun = (): void => {};
		const resources = await this.options.createResources(options, {
			operation,
			contextAppender: runtimeContext,
			abortCurrentRun: () => abortCurrentRun(),
		});
		try {
			const turnEngine = new AgentCoreTurnEngine({
				streamFn: this.options.streamFn,
				streamOptions: this.options.streamOptions,
				resolveApiKey: (model) => resources.modelRuntime.resolveApiKey(model),
			});
			const contextCompactionCommitter = new ContextCompactionCommitter({
				repository: resources.repository,
				eventSink,
				clock: this.clock,
				conversationDocumentReader: resources.conversationDocumentStore,
			});
			const pipeline = new TurnPipeline({
				repository: resources.repository,
				snapshotProvider: resources.snapshotProvider,
				modelBindingProvider: resources.modelRuntime,
				turnEngine,
				eventSink,
				clock: this.clock,
				idGenerator: this.idGenerator,
				runtimeContext,
				conversationDocumentReader: resources.conversationDocumentStore,
				contextCompactionCommitter,
				conversationContinuationStore: resources.conversationContinuationStore,
				onConversationContinued: resources.onConversationContinued
					? (result) => resources.onConversationContinued?.(result)
					: undefined,
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
			abortCurrentRun = () => {
				void session.cancel().catch((error) => {
					console.warn("[runtime-core] failed to abort Greenfield session", error);
				});
			};
			const contextController = resources.contextRuntime
				? new GreenfieldSessionContextController({
						session,
						repository: resources.repository,
						conversationDocumentReader: resources.conversationDocumentStore,
						snapshotProvider: resources.snapshotProvider,
						modelBindingProvider: resources.modelRuntime,
						contextRuntime: resources.contextRuntime,
						committer: contextCompactionCommitter,
					})
				: undefined;
			const dispose = resources.dispose;
			return {
				session,
				repository: resources.repository,
				conversationDocumentStore: resources.conversationDocumentStore,
				promptAdapter: resources.promptAdapter,
				modelRuntime: resources.modelRuntime,
				identity: resources.identity,
				stateSource: resources.stateSource,
				documentParticipants: resources.documentParticipants,
				todoController: resources.todoController,
				contextController,
				dispose: dispose ? () => dispose.call(resources) : undefined,
			};
		} catch (error) {
			runtimeContext.clear();
			await resources.dispose?.();
			throw error;
		}
	}
}

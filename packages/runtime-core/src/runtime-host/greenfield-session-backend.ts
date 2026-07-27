import type { Message } from "@vetta/ai";
import type { PromptRequest, SessionEvent } from "../contracts.js";
import type { AgentSession } from "../kernel/agent-session.js";
import type {
	AgentSessionState,
	ConversationRepository,
	EventSink,
	KernelEvent,
	SessionInput,
	SessionInputQueueMode,
	SessionSendOptions,
	SessionSendResult,
	StoredSessionEvent,
	TurnResult,
} from "../kernel/contracts.js";
import { sessionBusyError, sessionClosedError } from "../kernel/errors.js";
import { mapGreenfieldKernelEventToSessionEvents } from "./greenfield-session-events.js";
import {
	type GreenfieldRuntimeSessionIdentity,
	type GreenfieldRuntimeStateSource,
	GreenfieldSessionProjection,
} from "./greenfield-session-projection.js";
import type { RuntimeSessionBackend } from "./session-backend.js";
import type {
	RuntimeSessionCorePorts,
	RuntimeSessionIdentityLifecycle,
	RuntimeSessionState,
	RuntimeSessionWorkspaceView,
} from "./session-ports.js";

export interface GreenfieldPromptPreparationContext {
	readonly sessionId: string;
}

export interface GreenfieldPreparedPrompt {
	readonly input: SessionInput;
	readonly options?: SessionSendOptions;
}

/** 外部 PromptRequest 到 Kernel 输入的必需反腐层；Backend 不静默忽略宿主字段。 */
export interface GreenfieldPromptAdapter {
	prepare(request: PromptRequest, context: GreenfieldPromptPreparationContext): Promise<GreenfieldPreparedPrompt>;
}

export interface GreenfieldRuntimeAssembly {
	readonly session: AgentSession;
	readonly repository: ConversationRepository;
	readonly identity: GreenfieldRuntimeSessionIdentity;
	readonly stateSource: GreenfieldRuntimeStateSource;
	/** 由组合根释放 Session 之外的独占资源；共享 Repository 不应在这里关闭。 */
	dispose?(): Promise<void>;
}

export interface GreenfieldRuntimeFactory<TCreateOptions> {
	create(options: TCreateOptions, eventSink: EventSink): Promise<GreenfieldRuntimeAssembly>;
	resume(options: TCreateOptions, eventSink: EventSink): Promise<GreenfieldRuntimeAssembly>;
}

export interface GreenfieldRuntimeSessionBackendOptions<TCreateOptions> {
	readonly runtimeFactory: GreenfieldRuntimeFactory<TCreateOptions>;
	readonly promptAdapter: GreenfieldPromptAdapter;
}

export interface GreenfieldRuntimeSessionState {
	readonly sessionId: string;
	readonly state: AgentSessionState;
	readonly pendingMessageCount: number;
	readonly steeringMode: SessionInputQueueMode;
	readonly followUpMode: SessionInputQueueMode;
	readonly messageCount: number;
}

/** Greenfield 当前真实具备的 RuntimeHost 核心能力；不包含尚未迁移的外围 Port。 */
export interface GreenfieldRuntimeSessionCoreAssembly {
	readonly lifecycle: RuntimeSessionIdentityLifecycle;
	readonly workspaceView: RuntimeSessionWorkspaceView;
	readonly corePorts: RuntimeSessionCorePorts;
}

export class GreenfieldRuntimeSession {
	readonly sessionId: string;
	private readonly session: AgentSession;
	private readonly promptAdapter: GreenfieldPromptAdapter;
	private readonly eventSink: GreenfieldSessionEventSink;
	private readonly identity: GreenfieldRuntimeSessionIdentity;
	private readonly stateSource: GreenfieldRuntimeStateSource;
	private readonly projection: GreenfieldSessionProjection;
	private readonly disposeRuntime: (() => Promise<void>) | undefined;
	private disposed = false;

	constructor(
		assembly: GreenfieldRuntimeAssembly,
		promptAdapter: GreenfieldPromptAdapter,
		eventSink: GreenfieldSessionEventSink,
		projection: GreenfieldSessionProjection,
	) {
		this.sessionId = assembly.session.id;
		this.session = assembly.session;
		this.promptAdapter = promptAdapter;
		this.eventSink = eventSink;
		this.identity = assembly.identity;
		this.stateSource = assembly.stateSource;
		this.projection = projection;
		const dispose = assembly.dispose;
		this.disposeRuntime = dispose ? () => dispose.call(assembly) : undefined;
	}

	async prompt(request: PromptRequest): Promise<SessionSendResult> {
		this.assertOpen();
		if ((this.session.state === "running" || this.session.state === "cancelling") && !request.streamingBehavior) {
			throw sessionBusyError();
		}
		const prepared = await this.promptAdapter.prepare(request, { sessionId: this.sessionId });
		this.assertOpen();
		return this.session.send(prepared.input, prepared.options ?? {});
	}

	async continue(): Promise<TurnResult> {
		this.assertOpen();
		return this.session.continue();
	}

	async abort(reason?: string): Promise<void> {
		this.assertOpen();
		await this.session.cancel(reason);
	}

	subscribe(handler: (event: SessionEvent) => void): () => void {
		this.assertOpen();
		return this.eventSink.subscribe(handler);
	}

	async getState(): Promise<GreenfieldRuntimeSessionState> {
		this.assertOpen();
		return {
			sessionId: this.sessionId,
			state: this.session.state,
			pendingMessageCount: this.session.pendingMessageCount,
			steeringMode: this.session.steeringMode,
			followUpMode: this.session.followUpMode,
			messageCount: this.projection.readMessageCount(),
		};
	}

	async getMessages(): Promise<readonly Message[]> {
		this.assertOpen();
		return this.projection.readMessages();
	}

	readState(): RuntimeSessionState {
		this.assertOpen();
		const dynamic = this.stateSource.read();
		return {
			...dynamic,
			activeToolNames: [...dynamic.activeToolNames],
			isStreaming: this.session.state === "running" || this.session.state === "cancelling",
			messageCount: this.projection.readMessageCount(),
			parentSessionPath: this.identity.parentSessionPath,
			parentEntryId: this.identity.parentEntryId,
		};
	}

	readMessages(): readonly Message[] {
		this.assertOpen();
		return this.projection.readMessages();
	}

	createCoreAssembly(): GreenfieldRuntimeSessionCoreAssembly {
		this.assertOpen();
		return {
			lifecycle: {
				sessionId: this.sessionId,
				sessionPath: this.identity.sessionPath,
				dispose: () => this.dispose(),
			},
			workspaceView: {
				readWorkingDirectory: () => this.identity.cwd,
			},
			corePorts: {
				turnControl: {
					prompt: async (request) => {
						await this.prompt(request);
					},
					continue: async () => {
						await this.continue();
					},
					abort: () => this.abort(),
				},
				eventStream: {
					subscribe: (handler) => this.subscribe(handler),
				},
				stateReader: {
					readState: () => this.readState(),
					readMessages: () => this.readMessages(),
				},
			},
		};
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.eventSink.clear();
		try {
			await this.session.close();
		} finally {
			await this.disposeRuntime?.();
		}
	}

	private assertOpen(): void {
		if (this.disposed) throw sessionClosedError();
	}
}

/**
 * Greenfield Kernel 的显式并行后端。
 *
 * 它实现通用 RuntimeSessionBackend 工厂合同，但返回独立 Greenfield 门面；当前
 * RuntimeHost 仍使用默认类型参数下的 Legacy Session，不能把本类直接注入生产入口。
 */
export class GreenfieldRuntimeSessionBackend<TCreateOptions>
	implements RuntimeSessionBackend<TCreateOptions, GreenfieldRuntimeSession>
{
	private readonly options: GreenfieldRuntimeSessionBackendOptions<TCreateOptions>;

	constructor(options: GreenfieldRuntimeSessionBackendOptions<TCreateOptions>) {
		this.options = options;
	}

	async create(options: TCreateOptions): Promise<GreenfieldRuntimeSession> {
		return this.assemble("create", options);
	}

	async resume(options: TCreateOptions): Promise<GreenfieldRuntimeSession> {
		return this.assemble("resume", options);
	}

	private async assemble(operation: "create" | "resume", options: TCreateOptions): Promise<GreenfieldRuntimeSession> {
		const eventSink = new GreenfieldSessionEventSink();
		const assembly = await this.options.runtimeFactory[operation](options, eventSink);
		try {
			const conversation = await assembly.repository.load(assembly.session.id);
			const projection = new GreenfieldSessionProjection(conversation);
			eventSink.bindProjection(projection);
			eventSink.finishInitialization();
			return new GreenfieldRuntimeSession(assembly, this.options.promptAdapter, eventSink, projection);
		} catch (error) {
			try {
				await assembly.session.close();
			} finally {
				await assembly.dispose?.();
			}
			throw error;
		}
	}
}

class GreenfieldSessionEventSink implements EventSink {
	private readonly listeners = new Set<(event: SessionEvent) => void>();
	private readonly initializationEvents: SessionEvent[] = [];
	private projection: GreenfieldSessionProjection | undefined;
	private initializing = true;

	async publish(event: KernelEvent): Promise<void> {
		if (isStoredSessionEvent(event)) this.projection?.apply(event);
		for (const mapped of mapGreenfieldKernelEventToSessionEvents(event)) {
			if (this.initializing) {
				this.initializationEvents.push(mapped);
				continue;
			}
			this.notifyListeners(mapped);
		}
	}

	subscribe(handler: (event: SessionEvent) => void): () => void {
		this.listeners.add(handler);
		for (const event of this.initializationEvents.splice(0)) {
			try {
				handler(event);
			} catch {
				// Session observers are isolated from initialization recovery events.
			}
		}
		return () => this.listeners.delete(handler);
	}

	finishInitialization(): void {
		this.initializing = false;
	}

	bindProjection(projection: GreenfieldSessionProjection): void {
		this.projection = projection;
	}

	clear(): void {
		this.listeners.clear();
		this.initializationEvents.length = 0;
	}

	private notifyListeners(event: SessionEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {
				// Session observers are isolated from turn execution and from each other.
			}
		}
	}
}

function isStoredSessionEvent(event: KernelEvent): event is StoredSessionEvent {
	return (
		event.type === "turn.started" ||
		event.type === "message.appended" ||
		event.type === "context.compacted" ||
		event.type === "turn.completed" ||
		event.type === "turn.cancelled" ||
		event.type === "turn.failed"
	);
}

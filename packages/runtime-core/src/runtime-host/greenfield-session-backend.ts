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
	TurnResult,
} from "../kernel/contracts.js";
import { sessionBusyError, sessionClosedError } from "../kernel/errors.js";
import { mapGreenfieldKernelEventToSessionEvents } from "./greenfield-session-events.js";
import type { RuntimeSessionBackend } from "./session-backend.js";

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
	/** 由组合根释放 Session 之外的独占资源；共享 Repository 不应在这里关闭。 */
	dispose?(): Promise<void>;
}

export interface GreenfieldRuntimeFactory<TCreateOptions> {
	create(options: TCreateOptions, eventSink: EventSink): Promise<GreenfieldRuntimeAssembly>;
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

export class GreenfieldRuntimeSession {
	readonly sessionId: string;
	private readonly session: AgentSession;
	private readonly repository: ConversationRepository;
	private readonly promptAdapter: GreenfieldPromptAdapter;
	private readonly eventSink: GreenfieldSessionEventSink;
	private readonly disposeRuntime: (() => Promise<void>) | undefined;
	private disposed = false;

	constructor(
		assembly: GreenfieldRuntimeAssembly,
		promptAdapter: GreenfieldPromptAdapter,
		eventSink: GreenfieldSessionEventSink,
	) {
		this.sessionId = assembly.session.id;
		this.session = assembly.session;
		this.repository = assembly.repository;
		this.promptAdapter = promptAdapter;
		this.eventSink = eventSink;
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
		const conversation = await this.repository.load(this.sessionId);
		return {
			sessionId: this.sessionId,
			state: this.session.state,
			pendingMessageCount: this.session.pendingMessageCount,
			steeringMode: this.session.steeringMode,
			followUpMode: this.session.followUpMode,
			messageCount: conversation.messages.length,
		};
	}

	async getMessages(): Promise<readonly Message[]> {
		this.assertOpen();
		return (await this.repository.load(this.sessionId)).messages;
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
		const eventSink = new GreenfieldSessionEventSink();
		const assembly = await this.options.runtimeFactory.create(options, eventSink);
		return new GreenfieldRuntimeSession(assembly, this.options.promptAdapter, eventSink);
	}
}

class GreenfieldSessionEventSink implements EventSink {
	private readonly listeners = new Set<(event: SessionEvent) => void>();

	async publish(event: KernelEvent): Promise<void> {
		for (const mapped of mapGreenfieldKernelEventToSessionEvents(event)) {
			for (const listener of this.listeners) {
				try {
					listener(mapped);
				} catch {
					// Session observers are isolated from turn execution and from each other.
				}
			}
		}
	}

	subscribe(handler: (event: SessionEvent) => void): () => void {
		this.listeners.add(handler);
		return () => this.listeners.delete(handler);
	}

	clear(): void {
		this.listeners.clear();
	}
}

import type { Message } from "@vetta/ai";
import type { HistoryEntry, PromptRequest, SessionEvent } from "../contracts.js";
import {
	type ConversationDocumentCommand,
	type ConversationDocumentCommandResult,
	type ConversationDocumentStore,
	conversationDocumentEntry,
	extractConversationEntryText,
} from "../conversation/index.js";
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
import type { GreenfieldRuntimeModelRuntime } from "./greenfield-model-runtime.js";
import { mapGreenfieldKernelEventToSessionEvents } from "./greenfield-session-events.js";
import {
	type GreenfieldRuntimeSessionIdentity,
	type GreenfieldRuntimeStateSource,
	GreenfieldSessionProjection,
} from "./greenfield-session-projection.js";
import type { RuntimeSessionBackend } from "./session-backend.js";
import type {
	RuntimeSessionCorePorts,
	RuntimeSessionHistoryController,
	RuntimeSessionHistoryReader,
	RuntimeSessionIdentityLifecycle,
	RuntimeSessionModelController,
	RuntimeSessionModelView,
	RuntimeSessionState,
	RuntimeSessionWorkspaceView,
} from "./session-ports.js";

export interface GreenfieldPromptPreparationContext {
	readonly sessionId: string;
	readonly queueing: boolean;
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
	readonly conversationDocumentStore: ConversationDocumentStore;
	readonly promptAdapter: GreenfieldPromptAdapter;
	readonly modelRuntime: GreenfieldRuntimeModelRuntime;
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
	readonly historyReader: RuntimeSessionHistoryReader;
	readonly historyController: RuntimeSessionHistoryController;
	readonly modelController: RuntimeSessionModelController;
	readonly modelView: RuntimeSessionModelView;
	readonly workspaceView: RuntimeSessionWorkspaceView;
	readonly corePorts: RuntimeSessionCorePorts;
}

export class GreenfieldRuntimeSession {
	readonly sessionId: string;
	private readonly session: AgentSession;
	private readonly promptAdapter: GreenfieldPromptAdapter;
	private readonly eventSink: GreenfieldSessionEventSink;
	private readonly modelRuntime: GreenfieldRuntimeModelRuntime;
	private readonly identity: GreenfieldRuntimeSessionIdentity;
	private readonly stateSource: GreenfieldRuntimeStateSource;
	private readonly conversationDocumentStore: ConversationDocumentStore;
	private readonly projection: GreenfieldSessionProjection;
	private readonly disposeRuntime: (() => Promise<void>) | undefined;
	private disposed = false;
	private historyMutation = false;

	constructor(
		assembly: GreenfieldRuntimeAssembly,
		eventSink: GreenfieldSessionEventSink,
		projection: GreenfieldSessionProjection,
	) {
		this.sessionId = assembly.session.id;
		this.session = assembly.session;
		this.promptAdapter = assembly.promptAdapter;
		this.eventSink = eventSink;
		this.modelRuntime = assembly.modelRuntime;
		this.identity = assembly.identity;
		this.stateSource = assembly.stateSource;
		this.conversationDocumentStore = assembly.conversationDocumentStore;
		this.projection = projection;
		const dispose = assembly.dispose;
		this.disposeRuntime = dispose ? () => dispose.call(assembly) : undefined;
	}

	async prompt(request: PromptRequest): Promise<SessionSendResult> {
		this.assertOpen();
		if (this.historyMutation) throw sessionBusyError();
		if ((this.session.state === "running" || this.session.state === "cancelling") && !request.streamingBehavior) {
			throw sessionBusyError();
		}
		if (request.modelKey) {
			await this.modelRuntime.selectModel(request.modelKey, "if-changed");
		}
		if (request.reasoning) {
			this.modelRuntime.setThinkingLevel(request.reasoning);
		}
		const prepared = await this.promptAdapter.prepare(this.normalizeImages(request), {
			sessionId: this.sessionId,
			queueing: this.session.state === "running" || this.session.state === "cancelling",
		});
		this.assertOpen();
		return this.session.send(prepared.input, prepared.options ?? {});
	}

	async continue(): Promise<TurnResult> {
		this.assertOpen();
		if (this.historyMutation) throw sessionBusyError();
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
			model: this.modelRuntime.readCurrentModel(),
			thinkingLevel: this.modelRuntime.readThinkingLevel(),
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

	readHistory(): readonly HistoryEntry[] {
		this.assertOpen();
		return this.projection.readHistory();
	}

	async navigateForEdit(entryId: string): Promise<{ text: string; cancelled: boolean }> {
		return this.withHistoryMutation("Cannot edit message while the session is streaming", async () => {
			const entry = conversationDocumentEntry(this.projection.readDocument(), entryId);
			const text = extractConversationEntryText(entry);
			const editable =
				entry.type === "custom_message" ||
				(entry.type === "message" && isRecord(entry.message) && entry.message.role === "user");
			await this.executeDocumentCommand({
				type: "active_leaf.set",
				entryId: editable ? entry.parentId : entry.id,
			});
			return { text, cancelled: false };
		});
	}

	async switchBranch(entryId: string): Promise<{ leafId: string }> {
		return this.withHistoryMutation("Cannot switch branch while the session is streaming", async () => {
			const result = await this.executeDocumentCommand({ type: "branch.select", entryId });
			if (!result.leafId) throw new Error(`Entry ${entryId} has no branch leaf`);
			return { leafId: result.leafId };
		});
	}

	async deleteMessage(entryId: string): Promise<{ leafId: string | null }> {
		return this.withHistoryMutation("Cannot delete a message while the session is streaming", async () => {
			const result = await this.executeDocumentCommand({ type: "message.delete", entryId });
			return { leafId: result.leafId };
		});
	}

	async replaceLastUserMessage(entryId: string): Promise<{ leafId: string | null }> {
		return this.withHistoryMutation("Cannot replace a message while the session is streaming", async () => {
			const result = await this.executeDocumentCommand({ type: "user_turn.replace", entryId });
			return { leafId: result.leafId };
		});
	}

	async forkSession(entryId: string): Promise<{ path: string; text: string }> {
		return this.withHistoryMutation("Cannot fork while the session is streaming", async () => {
			const result = await this.conversationDocumentStore.fork(this.sessionId, entryId);
			return { path: result.path, text: result.text };
		});
	}

	async setName(name: string): Promise<void> {
		this.assertOpen();
		if (this.historyMutation) throw new Error("Cannot rename while another history mutation is active");
		this.historyMutation = true;
		try {
			await this.conversationDocumentStore.execute(this.sessionId, null, {
				type: "session.name.set",
				name,
			});
			this.projection.applyPersistedName(name);
		} finally {
			this.historyMutation = false;
		}
	}

	createCoreAssembly(): GreenfieldRuntimeSessionCoreAssembly {
		this.assertOpen();
		return {
			lifecycle: {
				sessionId: this.sessionId,
				sessionPath: this.identity.sessionPath,
				dispose: () => this.dispose(),
			},
			historyReader: {
				readHistory: () => this.readHistory(),
			},
			historyController: {
				navigateForEdit: (entryId) => this.navigateForEdit(entryId),
				switchBranch: (entryId) => this.switchBranch(entryId),
				deleteMessage: (entryId) => this.deleteMessage(entryId),
				replaceLastUserMessage: (entryId) => this.replaceLastUserMessage(entryId),
				forkSession: (entryId) => this.forkSession(entryId),
				setName: (name) => this.setName(name),
			},
			modelController: this.modelRuntime,
			modelView: this.modelRuntime,
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

	private normalizeImages(request: PromptRequest): PromptRequest {
		if (!request.images || request.images.length === 0) return request;
		const model = this.modelRuntime.readCurrentModel();
		if (model?.input?.includes("image")) return request;
		return {
			...request,
			images: undefined,
			text:
				request.text === "(see attached images)"
					? "(User attempted to send images, but the current model does not support image input. Please inform the user that this model cannot process images.)"
					: request.text,
		};
	}

	private async executeDocumentCommand(
		command: ConversationDocumentCommand,
	): Promise<ConversationDocumentCommandResult> {
		const document = this.projection.readDocument();
		const result = await this.conversationDocumentStore.execute(this.sessionId, document.revision, command);
		this.projection.replaceDocument(result.document);
		return result;
	}

	private async withHistoryMutation<T>(message: string, operation: () => Promise<T>): Promise<T> {
		this.assertOpen();
		if (this.historyMutation || this.session.state === "running" || this.session.state === "cancelling") {
			throw new Error(message);
		}
		this.historyMutation = true;
		try {
			return await operation();
		} finally {
			this.historyMutation = false;
		}
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
			const [conversation, document] = await Promise.all([
				assembly.repository.load(assembly.session.id),
				assembly.conversationDocumentStore.readDocument(assembly.session.id),
			]);
			const projection = new GreenfieldSessionProjection(conversation, document);
			eventSink.bindProjection(projection);
			eventSink.finishInitialization();
			return new GreenfieldRuntimeSession(assembly, eventSink, projection);
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
		event.type === "context.appended" ||
		event.type === "context.compacted" ||
		event.type === "turn.completed" ||
		event.type === "turn.cancelled" ||
		event.type === "turn.failed"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { completeSimple, type Message, type TextContent } from "@mariozechner/pi-ai";
import {
	type AgentSession,
	type AgentSessionEvent,
	type SessionEntry as CodingSessionEntry,
	type CreateAgentSessionOptions,
	type CustomEntry,
	createAgentSession,
	type ExtensionUIContext,
	type FileEntry,
	loadEntriesFromFile,
	type ModelRegistry,
	type SessionHeader,
	type SessionInfo,
	SessionManager,
} from "@vetta/coding-agent";
import type {
	AssistantTurnTiming,
	HistoryEntry,
	ProjectInfo,
	PromptRequest,
	RuntimeSandboxGrantDecision,
	RuntimeSandboxGrantInfo,
	RuntimeSandboxGrantRequest,
	RuntimeUserConfirmationRequest,
	SessionConfig,
	SessionEvent,
	SessionEventBase,
	SessionExecutionMode,
	SessionFacade,
	SessionHistoryInfo,
	SessionStateSnapshot,
	SettingsPatch,
} from "./contracts.js";
import { runtimeError } from "./errors.js";
import {
	clearSessionGrants,
	listSessionGrants,
	revokeAllSessionGrants,
	revokeSessionGrant,
} from "./execution-mode/sandbox-permissions.js";
import { buildSandboxToolDefinitions } from "./execution-mode/sandbox-tools.js";

interface SessionHandle {
	session: AgentSession;
	executionMode: SessionExecutionMode;
}

/**
 * Reconstruct the leaf→root branch from a flat list of FileEntries (as
 * returned by loadEntriesFromFile). Mirrors what SessionManager.getBranch
 * does in-process but without instantiating SessionManager (which would
 * acquire the session-file lock).
 *
 * Strategy: find the most recent non-header entry that has no children,
 * then walk parentId back to the root. Order returned is root → leaf.
 */
function branchFromFileEntries(entries: FileEntry[]): CodingSessionEntry[] {
	const byId = new Map<string, CodingSessionEntry>();
	const hasChild = new Set<string>();
	for (const e of entries) {
		if (e.type === "session") continue;
		const se = e as CodingSessionEntry;
		byId.set(se.id, se);
		if (se.parentId) hasChild.add(se.parentId);
	}
	let leafId: string | null = null;
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i];
		if (e.type === "session") continue;
		const se = e as CodingSessionEntry;
		if (!hasChild.has(se.id)) {
			leafId = se.id;
			break;
		}
	}
	const branch: CodingSessionEntry[] = [];
	let cur = leafId ? byId.get(leafId) : undefined;
	while (cur) {
		branch.unshift(cur);
		cur = cur.parentId ? byId.get(cur.parentId) : undefined;
	}
	return branch;
}

/**
 * Per-session buffer of the currently-streaming LLM call's deltas.
 *
 * The runtime persists assistant messages to the JSONL history only on
 * `message_end`. So if a renderer disconnects mid-stream and reconnects
 * (e.g. user switches sessions and switches back), `getFullHistory` returns
 * nothing for the in-flight assistant, and a fresh `subscribe()` only forwards
 * future events. Without this buffer, all text/thinking/tool-call events
 * received before reconnection would be lost.
 *
 * Text and thinking are cleared on `message_end` because each LLM call inside
 * a multi-step turn produces its own deltas; the prior call's content is
 * already on disk via `message.final`. `isActive` flips on at `agent_start`
 * and off at `agent_end`.
 */
interface InFlightBuffer {
	turnStartedAt: number;
	text: string;
	thinking: string;
	toolCallStarts: Array<{ toolCallId: string; toolName: string }>;
	isActive: boolean;
}

const ASSISTANT_TURN_TIMING_TYPE = "vetta.assistant_turn_timing";

export interface RuntimeHostOptions {
	getDefaultExecutionMode?: () => SessionExecutionMode | Promise<SessionExecutionMode>;
	sandboxHostPath?: string;
	linuxBubblewrapPath?: string;
	macosSandboxExecPath?: string;
	userConfirmationHandler?: (request: RuntimeUserConfirmationRequest, signal?: AbortSignal) => Promise<boolean>;
	userSandboxGrantHandler?: (
		request: RuntimeSandboxGrantRequest,
		signal?: AbortSignal,
	) => Promise<RuntimeSandboxGrantDecision>;
	/**
	 * Vetta 远端服务 URL。宿主进程显式注入后，下挂的 createAgentSession 不会再
	 * 回退到 coding-agent 内置的 LAN 默认值，避免主进程内 desktop-app 路径
	 * （env-injected URL）与 SDK 路径（硬编码 URL）"半边大脑"。
	 */
	serverUrl?: string;
	/**
	 * 进程级共享的 ModelRegistry。注入后每次 createSession 都复用同一份，
	 * sdk 内部 `if (!options.modelRegistry)` 的远程 fetch 分支就会跳过——
	 * 第一次发消息不再被 5s 的 `/providers/models.json` 阻塞。
	 *
	 * 仍然需要保证模型实时性：见 `createSession` 末尾的 stale-while-revalidate
	 * 后台刷新，以及 `reloadServerAuth` 在登录/登出时的同步刷新。
	 */
	modelRegistry?: ModelRegistry;
}

export class RuntimeHost implements SessionFacade {
	private sessions = new Map<string, SessionHandle>();
	private currentTurnStartedAt = new Map<string, number>();
	private inFlightBuffers = new Map<string, InFlightBuffer>();
	private inFlightUnsubscribers = new Map<string, () => void>();
	/**
	 * 外部订阅者表。`subscribe()` 在挂到 session.subscribe 的同时把 handler 也
	 * 登记在这里，方便 RuntimeHost 自己注入合成事件（例如 prompt 同步抛错时
	 * 把 error 事件广播出去，否则错误只会以 IPC reject 形式回到调用方，
	 * 一旦调用方没 try/catch 就被静默吞掉）。
	 */
	private externalSubscribers = new Map<string, Set<(event: SessionEvent) => void>>();
	/**
	 * 当前正在 streaming 的 session 集合（key 为 sessionPath / sessionFile）。
	 * 在 attachInFlightBuffer 里随 agent_start/agent_end/aborted 同步维护，并通过
	 * runningChangedHandlers 广播给宿主（main 进程 IPC 层），用于侧边栏渲染 spin。
	 */
	private runningSessionPaths = new Set<string>();
	private runningChangedHandlers = new Set<(sessionPath: string, running: boolean) => void>();
	private readonly getDefaultExecutionMode: () => SessionExecutionMode | Promise<SessionExecutionMode>;
	private readonly sandboxHostPath: string | undefined;
	private readonly linuxBubblewrapPath: string | undefined;
	private readonly macosSandboxExecPath: string | undefined;
	private readonly serverUrl: string | undefined;
	private readonly modelRegistry: ModelRegistry | undefined;
	private userConfirmationHandler:
		| ((request: RuntimeUserConfirmationRequest, signal?: AbortSignal) => Promise<boolean>)
		| undefined;
	private userSandboxGrantHandler:
		| ((request: RuntimeSandboxGrantRequest, signal?: AbortSignal) => Promise<RuntimeSandboxGrantDecision>)
		| undefined;

	constructor(options: RuntimeHostOptions = {}) {
		this.getDefaultExecutionMode = options.getDefaultExecutionMode ?? (() => "sandbox");
		this.sandboxHostPath = options.sandboxHostPath;
		this.linuxBubblewrapPath = options.linuxBubblewrapPath;
		this.macosSandboxExecPath = options.macosSandboxExecPath;
		this.serverUrl = options.serverUrl;
		this.modelRegistry = options.modelRegistry;
		this.userConfirmationHandler = options.userConfirmationHandler;
		this.userSandboxGrantHandler = options.userSandboxGrantHandler;
	}

	setUserConfirmationHandler(
		handler: ((request: RuntimeUserConfirmationRequest, signal?: AbortSignal) => Promise<boolean>) | undefined,
	): void {
		this.userConfirmationHandler = handler;
	}

	setUserSandboxGrantHandler(
		handler:
			| ((request: RuntimeSandboxGrantRequest, signal?: AbortSignal) => Promise<RuntimeSandboxGrantDecision>)
			| undefined,
	): void {
		this.userSandboxGrantHandler = handler;
	}

	listSandboxGrants(sessionId: string): RuntimeSandboxGrantInfo[] {
		return listSessionGrants(sessionId).map((entry) => ({
			id: entry.id,
			sessionId: entry.sessionId,
			toolName: entry.toolName,
			capability: entry.capability,
			grantRoot: entry.grantRoot,
			firstTarget: entry.firstTarget,
			createdAt: entry.createdAt,
		}));
	}

	revokeSandboxGrant(sessionId: string, grantId: string): boolean {
		return revokeSessionGrant(sessionId, grantId);
	}

	revokeAllSandboxGrants(sessionId: string): number {
		return revokeAllSessionGrants(sessionId);
	}

	/**
	 * Push a new server token to the ModelRegistry and refresh remote models.
	 * Call this after login / logout so long-lived sessions pick up auth changes
	 * without an app restart.
	 *
	 * 共享 modelRegistry 模式（desktop-app）：单点更新，所有 session 立即看到。
	 * 兼容旧模式（无共享 registry）：遍历每个 session 的 registry。
	 */
	async reloadServerAuth(token: string | undefined): Promise<void> {
		if (this.modelRegistry) {
			try {
				this.modelRegistry.setServerToken(token);
				// 没 token 时 loadRemoteModels 内部直接早退；有 token 时拉一次最新。
				await this.modelRegistry.loadRemoteModels();
			} catch (err) {
				console.warn("[RuntimeHost] reloadServerAuth (shared) failed:", err);
			}
			return;
		}
		const handles = Array.from(this.sessions.values());
		await Promise.all(
			handles.map(async ({ session }) => {
				try {
					session.modelRegistry.setServerToken(token);
					await session.modelRegistry.loadRemoteModels();
				} catch (err) {
					console.warn("[RuntimeHost] reloadServerAuth failed for session:", err);
				}
			}),
		);
	}

	/**
	 * Look up an open SessionHandle by absolute session file path.
	 * Used to dedupe re-opens of the same file (avoids self-conflicts on the
	 * file lock, since SessionManager rejects same-pid re-acquisition).
	 */
	private findHandleBySessionPath(sessionPath: string): { sessionId: string; handle: SessionHandle } | undefined {
		const target = resolvePath(sessionPath);
		for (const [sessionId, handle] of this.sessions) {
			const openPath = handle.session.sessionFile;
			if (openPath && resolvePath(openPath) === target) {
				return { sessionId, handle };
			}
		}
		return undefined;
	}

	async createSession(config: SessionConfig = {}): Promise<{ sessionId: string }> {
		const __t0 = Date.now();
		console.log(`[perf][RuntimeHost.createSession] enter cwd=${config.cwd ?? "-"}`);
		// Dedupe by sessionPath: a SessionManager.open() takes an exclusive file
		// lock, and the lock module treats same-pid re-acquisition as a real
		// conflict. So if the renderer reopens a session this RuntimeHost is
		// already holding, we must return the existing handle instead of opening
		// a second one.
		if (config.sessionPath && config.sessionPath.trim().length > 0) {
			const existing = this.findHandleBySessionPath(config.sessionPath);
			if (existing) {
				if (config.executionMode !== undefined && config.executionMode !== existing.handle.executionMode) {
					await this.setExecutionMode(existing.sessionId, config.executionMode);
				}
				await existing.handle.session.bindExtensions({
					uiContext: this.createExtensionUIContext({ current: existing.sessionId }),
				});
				return { sessionId: existing.sessionId };
			}
		}

		const sessionManager =
			config.sessionPath && config.sessionPath.trim().length > 0
				? SessionManager.open(config.sessionPath)
				: config.cwd
					? SessionManager.create(config.cwd, config.sessionDir)
					: undefined;

		const requestedMode = config.executionMode;
		const defaultMode = await this.getDefaultExecutionMode();
		const executionMode = requestedMode ?? defaultMode;
		const effectiveCwd = config.cwd ?? process.cwd();
		const sessionIdRef: { current?: string } = {};
		const customTools = this.resolveExecutionModeTools(executionMode, effectiveCwd, () => sessionIdRef.current);

		const options: CreateAgentSessionOptions = {
			cwd: config.cwd,
			agentDir: config.agentDir,
			sessionManager,
			model: config.model,
			thinkingLevel: config.thinkingLevel,
			customTools,
			appendSystemPrompt: config.appendSystemPrompt,
			env: config.env,
			serverUrl: this.serverUrl,
			// 传入共享 registry，sdk 内部就会跳过它自己的远程 fetch 分支
			// （sdk.ts: `if (!options.modelRegistry) { ... loadRemoteModels() }`）。
			modelRegistry: this.modelRegistry,
		};

		console.log(`[perf][RuntimeHost.createSession] before createAgentSession +${Date.now() - __t0}ms`);
		const { session } = await createAgentSession(options);
		console.log(`[perf][RuntimeHost.createSession] after createAgentSession +${Date.now() - __t0}ms`);
		const sessionId = session.sessionId;
		sessionIdRef.current = sessionId;
		await session.bindExtensions({ uiContext: this.createExtensionUIContext(sessionIdRef) });
		this.sessions.set(sessionId, { session, executionMode });
		this.attachInFlightBuffer(sessionId, session);
		console.log(`[perf][RuntimeHost.createSession] exit total=${Date.now() - __t0}ms`);

		// Stale-while-revalidate：当前的远程 model 数据已就绪可用（来自启动预热
		// 或上一次刷新），这里再 fire-and-forget 一次刷新，不 await。
		// - loadRemoteModels 内部对 inflight 做了 dedupe，并发安全；
		// - 未登录时该方法立即早退，无副作用；
		// - 任何错误已在 doLoadRemoteModels 内静默吞掉，不会扩散。
		// 效果：用户每次 createSession 都会触发一次"下一次会更新"的后台刷新。
		if (this.modelRegistry) {
			void this.modelRegistry.loadRemoteModels();
		}
		return { sessionId };
	}

	/**
	 * Attach a permanent listener to the session that maintains the in-flight
	 * buffer regardless of whether any external subscriber is connected. Replayed
	 * by `subscribe()` so a re-subscribing renderer sees prior in-flight content.
	 */
	private attachInFlightBuffer(sessionId: string, session: AgentSession): void {
		const buffer: InFlightBuffer = {
			turnStartedAt: 0,
			text: "",
			thinking: "",
			toolCallStarts: [],
			isActive: false,
		};
		this.inFlightBuffers.set(sessionId, buffer);
		const unsubscribe = session.subscribe((event) => {
			if (event.type === "agent_start") {
				buffer.turnStartedAt = Date.now();
				buffer.text = "";
				buffer.thinking = "";
				buffer.toolCallStarts = [];
				buffer.isActive = true;
				this.markRunning(session.sessionFile, true);
				return;
			}
			if (event.type === "agent_end") {
				buffer.text = "";
				buffer.thinking = "";
				buffer.toolCallStarts = [];
				buffer.isActive = false;
				this.markRunning(session.sessionFile, false);
				return;
			}
			if (event.type === "message_end") {
				// Each LLM call inside a multi-step turn ends with message_end and
				// its content gets persisted to history. The chat draft in the UI
				// keeps accumulating across calls, but the buffer should reset so
				// it only ever holds the *current* in-flight LLM call's deltas.
				buffer.text = "";
				buffer.thinking = "";
				buffer.toolCallStarts = [];
				return;
			}
			if (event.type === "message_update") {
				const sub = event.assistantMessageEvent;
				if (sub.type === "text_delta") {
					buffer.text += sub.delta;
				} else if (sub.type === "thinking_delta") {
					buffer.thinking += sub.delta;
				} else if (sub.type === "toolcall_start") {
					const idx = sub.contentIndex;
					const tc = sub.partial?.content?.[idx];
					if (tc && tc.type === "toolCall") {
						buffer.toolCallStarts.push({
							toolCallId: String(tc.id ?? ""),
							toolName: String(tc.name ?? ""),
						});
					}
				}
			}
		});
		this.inFlightUnsubscribers.set(sessionId, unsubscribe);
	}

	async setExecutionMode(sessionId: string, mode: SessionExecutionMode): Promise<void> {
		const handle = this.requireSession(sessionId);
		if (handle.executionMode === mode) return;
		this.assertCanSwitchExecutionMode(handle);

		const sessionAny = handle.session as AgentSession & {
			reconfigureCustomTools?: (customTools: CreateAgentSessionOptions["customTools"]) => void;
		};
		if (typeof sessionAny.reconfigureCustomTools !== "function") {
			throw runtimeError("INTERNAL_ERROR", "Session does not support execution mode reconfiguration.", false);
		}

		const cwd = handle.session.sessionManager.getCwd() ?? process.cwd();
		const customTools = this.resolveExecutionModeTools(mode, cwd, () => sessionId);
		sessionAny.reconfigureCustomTools(customTools);
		handle.executionMode = mode;
	}

	async setGlobalExecutionMode(mode: SessionExecutionMode): Promise<void> {
		const pending = Array.from(this.sessions.entries()).filter(([, handle]) => handle.executionMode !== mode);
		for (const [, handle] of pending) {
			this.assertCanSwitchExecutionMode(handle);
		}
		for (const [sessionId] of pending) {
			await this.setExecutionMode(sessionId, mode);
		}
	}

	async prompt(sessionId: string, request: PromptRequest): Promise<void> {
		const handle = this.requireSession(sessionId);

		// Ensure the session model matches the requested model BEFORE prompting,
		// so the model actually used is always the one the UI displays.
		if (request.modelKey) {
			const [provider, ...rest] = request.modelKey.split("/");
			const modelId = rest.join("/");
			// getAvailable() filters out providers where authStorage.hasAuth() is
			// false. Local custom providers (e.g. a self-hosted qwen-local) can
			// fail that check even when fully configured in models.json — the
			// fallback resolver depends on construction-time state and some
			// host-process scenarios race with it. Fall back to find() so an
			// explicit user selection isn't silently dropped; if auth is truly
			// missing, the provider request itself will return a clean error.
			const available = handle.session.modelRegistry.getAvailable();
			const model =
				available.find((m) => m.provider === provider && m.id === modelId) ??
				handle.session.modelRegistry.find(provider, modelId);
			if (model) {
				const current = handle.session.model;
				if (!current || current.provider !== provider || current.id !== modelId) {
					await handle.session.setModel(model);
				}
			}
		}

		let images = request.images;
		let text = request.text;
		console.log(
			`[RuntimeHost.prompt] session=${sessionId} model=${handle.session.model?.provider ?? "unknown"}/${handle.session.model?.id ?? "unknown"} textLength=${text.length} images=${images?.length ?? 0} streamingBehavior=${request.streamingBehavior ?? "default"}`,
		);
		if (images && images.length > 0) {
			const model = handle.session.model;
			if (!model?.input?.includes("image")) {
				console.warn(
					`[RuntimeHost.prompt] Model ${model?.id} does not support image input (input=${JSON.stringify(model?.input)}), stripping ${images.length} images`,
				);
				images = undefined;
				if (text === "(see attached images)") {
					text =
						"(User attempted to send images, but the current model does not support image input. Please inform the user that this model cannot process images.)";
				}
			} else {
				console.log(
					`[RuntimeHost.prompt] passing ${images.length} images to session.prompt, model=${model?.id}, model.input=${JSON.stringify(model?.input)}`,
				);
			}
		}
		try {
			await handle.session.prompt(text, {
				images,
				streamingBehavior: request.streamingBehavior,
				source: "extension",
			});
		} catch (err) {
			// session.prompt 在进入 agent.start 之前会做同步校验（"No model
			// selected"、"No API key found"、"Agent is already processing"
			// 等），抛出的异常 *不会* 经由 session 事件流回到订阅者。如果不
			// 主动把它转换成一个 error 事件，renderer 这边的体验就是「发了一
			// 条消息但完全没反应、没气泡、没 spinner、没报错」（issue 现象）。
			// 这里合成一个 error 事件广播给所有 subscribe() 拿过 handler 的
			// 订阅者，然后照原样把异常再向上抛，scheduler / batch-tasks 等
			// 已经自带 try/catch 的调用方仍然能拿到 reject 做重试 / 落账。
			const message = err instanceof Error ? err.message : String(err);
			console.error(`[RuntimeHost.prompt] session=${sessionId} pre-stream error: ${message}`);
			this.broadcastSyntheticEvent(sessionId, {
				...this.baseEvent(sessionId, "agent"),
				type: "error",
				error: runtimeError("INTERNAL_ERROR", message, false, "runtime"),
			});
			throw err;
		}
		console.log(`[RuntimeHost.prompt] session=${sessionId} prompt handed to agent`);
	}

	async continue(sessionId: string): Promise<void> {
		const handle = this.requireSession(sessionId);
		await handle.session.agent.continue();
	}

	async abort(sessionId: string): Promise<void> {
		const handle = this.requireSession(sessionId);
		await handle.session.abort();
	}

	/**
	 * 清空 session 的 todo 列表。被 scene 等机制 lock 时拒绝清空。
	 * 返回是否实际执行了清空。
	 */
	async clearTodos(sessionId: string): Promise<boolean> {
		const handle = this.requireSession(sessionId);
		const store = handle.session.todoStore;
		if (store.isLocked()) return false;
		if (store.getAll().length === 0) return false;
		store.clear();
		return true;
	}

	subscribe(sessionId: string, handler: (event: SessionEvent) => void): () => void {
		const handle = this.requireSession(sessionId);
		handler(this.lifecycleEvent(sessionId, "created"));

		// Push current todo state so late subscribers (e.g., user navigating into
		// an already-running session) see the todo panel immediately.
		const todoItems = handle.session.todoStore.getAll();
		if (todoItems.length > 0) {
			handler({
				...this.baseEvent(sessionId, "agent"),
				type: "todo_update",
				items: [...todoItems],
			} as SessionEvent);
		}

		// Replay in-flight assistant deltas accumulated since agent_start so that
		// a renderer reconnecting mid-stream (e.g. after switching sessions away
		// and back) sees the partial assistant content. Without this, any text
		// produced before reconnection would be lost (the runtime only persists
		// assistant messages on message_end, and a fresh subscribe only forwards
		// future events).
		const buffer = this.inFlightBuffers.get(sessionId);
		if (buffer?.isActive) {
			if (buffer.thinking) {
				handler({
					...this.baseEvent(sessionId, "agent"),
					type: "thinking.delta",
					delta: buffer.thinking,
				});
			}
			if (buffer.text) {
				handler({
					...this.baseEvent(sessionId, "agent"),
					type: "message.delta",
					delta: buffer.text,
				});
			}
			for (const tc of buffer.toolCallStarts) {
				handler({
					...this.baseEvent(sessionId, "agent"),
					type: "toolcall.start",
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
				});
			}
		}

		// 登记到外部订阅者表，便于 prompt() 等同步路径直接广播合成事件
		// （session.subscribe 链路要求事件先经过 session.emit → mapEvent，
		// 而 prompt 期的 throw 拿不到 session emit 这一条线）。
		let externals = this.externalSubscribers.get(sessionId);
		if (!externals) {
			externals = new Set();
			this.externalSubscribers.set(sessionId, externals);
		}
		externals.add(handler);

		const unsubscribeSession = handle.session.subscribe((event) => {
			for (const mapped of this.mapEvent(sessionId, event, handle.session)) {
				handler(mapped);
			}
		});

		return () => {
			unsubscribeSession();
			const set = this.externalSubscribers.get(sessionId);
			if (set) {
				set.delete(handler);
				if (set.size === 0) this.externalSubscribers.delete(sessionId);
			}
		};
	}

	/**
	 * 向某个 session 当前所有的外部订阅者广播一个合成事件。仅用于 RuntimeHost
	 * 内部，覆盖那些 session 事件流本身覆盖不到的边界（例如 prompt 入参校验
	 * 同步 throw 的场景）。
	 */
	private broadcastSyntheticEvent(sessionId: string, event: SessionEvent): void {
		const subscribers = this.externalSubscribers.get(sessionId);
		if (!subscribers || subscribers.size === 0) return;
		for (const handler of subscribers) {
			try {
				handler(event);
			} catch (err) {
				console.warn(`[RuntimeHost.broadcastSyntheticEvent] subscriber threw:`, err);
			}
		}
	}

	async updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void> {
		const handle = this.requireSession(sessionId);
		if (partialSettings.modelKey) {
			const [provider, ...rest] = partialSettings.modelKey.split("/");
			const modelId = rest.join("/");
			// 见 prompt() 中的同名注释：getAvailable() 会因为 hasAuth 误判把本地 provider 过滤
			// 掉，导致用户的显式选择被静默丢弃。先尝试 available，再回退到 registry.find()。
			const available = handle.session.modelRegistry.getAvailable();
			const model =
				available.find((m) => m.provider === provider && m.id === modelId) ??
				handle.session.modelRegistry.find(provider, modelId);
			if (model) {
				await handle.session.setModel(model);
			}
		}
		if (partialSettings.thinkingLevel) {
			handle.session.setThinkingLevel(partialSettings.thinkingLevel);
		}
		if (partialSettings.steeringMode) {
			handle.session.setSteeringMode(partialSettings.steeringMode);
		}
		if (partialSettings.followUpMode) {
			handle.session.setFollowUpMode(partialSettings.followUpMode);
		}
	}

	updateGlobalThinkingLevel(level: ThinkingLevel): void {
		for (const handle of this.sessions.values()) {
			handle.session.setThinkingLevel(level);
		}
	}

	getState(sessionId: string): SessionStateSnapshot {
		const handle = this.requireSession(sessionId);
		const contextUsage = handle.session.getContextUsage();
		return {
			sessionId,
			model: handle.session.model,
			thinkingLevel: handle.session.thinkingLevel,
			executionMode: handle.executionMode,
			isStreaming: handle.session.isStreaming,
			currentTurnStartedAt: this.currentTurnStartedAt.get(sessionId),
			messageCount: handle.session.messages.length,
			contextPercent: contextUsage?.percent ?? null,
			contextWindow: contextUsage?.contextWindow ?? 0,
		};
	}

	getMessages(sessionId: string): Message[] {
		const handle = this.requireSession(sessionId);
		return handle.session.messages.filter((message): message is Message => {
			return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
		});
	}

	getFullHistory(sessionId: string): HistoryEntry[] {
		const handle = this.requireSession(sessionId);
		return this.entriesToHistory(handle.session.getSessionBranch());
	}

	/**
	 * Read a session .jsonl directly from disk and translate to HistoryEntry[].
	 * Does NOT acquire the session-file lock — used by the desktop sidebar's
	 * read-only viewer for IM sessions (origin="im") where the sidecar may be
	 * actively writing to the same file. Caller decides what to do with the
	 * origin tag (e.g. render an IM badge / disable the input bar).
	 */
	readSessionHistoryFromFile(path: string): { history: HistoryEntry[]; origin?: SessionHeader["origin"] } {
		const fileEntries = loadEntriesFromFile(path);
		const header = fileEntries.find((e) => e.type === "session") as SessionHeader | undefined;
		const branch = branchFromFileEntries(fileEntries);
		return { history: this.entriesToHistory(branch), origin: header?.origin };
	}

	private entriesToHistory(branch: CodingSessionEntry[]): HistoryEntry[] {
		const entries: HistoryEntry[] = [];
		for (const entry of branch) {
			if (entry.type === "message") {
				const msg = entry.message;
				if (msg.role === "user" || msg.role === "assistant" || msg.role === "toolResult") {
					entries.push({ type: "message", message: msg as Message });
				}
			} else if (entry.type === "compaction") {
				entries.push({
					type: "compaction",
					summary: entry.summary,
					tokensBefore: entry.tokensBefore,
					timestamp: entry.timestamp,
				});
			} else if (entry.type === "custom" && entry.customType === ASSISTANT_TURN_TIMING_TYPE) {
				const timing = this.parseAssistantTurnTiming(entry);
				if (timing) {
					entries.push({
						type: "assistant_turn_timing",
						timing,
						timestamp: entry.timestamp,
					});
				}
			} else if (entry.type === "tool_timing") {
				entries.push({
					type: "tool_timing",
					toolCallId: entry.toolCallId,
					toolName: entry.toolName,
					startedAt: entry.startedAt,
					durationMs: entry.durationMs,
					phases: entry.phases,
					timestamp: entry.timestamp,
				});
			}
		}
		return entries;
	}

	async listProjects(): Promise<ProjectInfo[]> {
		const sessions = await SessionManager.listAll();
		const byCwd = new Map<string, number>();
		for (const session of sessions) {
			const key = session.cwd || process.cwd();
			byCwd.set(key, (byCwd.get(key) ?? 0) + 1);
		}
		return Array.from(byCwd.entries())
			.map(([cwd, sessionCount]) => ({ cwd, sessionCount }))
			.sort((a, b) => a.cwd.localeCompare(b.cwd));
	}

	async listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]> {
		const sessions = await SessionManager.list(cwd, sessionDir);
		return sessions.map((session: SessionInfo) => ({
			id: session.id,
			path: session.path,
			cwd: session.cwd,
			name: session.name,
			firstMessage: session.firstMessage,
			modifiedAt: session.modified.getTime(),
			origin: session.origin,
		}));
	}

	async deleteSession(sessionPath: string): Promise<void> {
		// If we currently hold this session open, dispose it first so the file
		// lock is released and the in-memory handle does not outlive the file.
		const existing = this.findHandleBySessionPath(sessionPath);
		if (existing) {
			this.inFlightUnsubscribers.get(existing.sessionId)?.();
			this.inFlightUnsubscribers.delete(existing.sessionId);
			this.inFlightBuffers.delete(existing.sessionId);
			this.markRunning(existing.handle.session.sessionFile, false);
			existing.handle.session.dispose();
			this.sessions.delete(existing.sessionId);
		}
		await rm(sessionPath, { force: true });
		// Clean up any orphaned sentinel lock file (sibling .lock).
		await rm(`${sessionPath}.lock`, { force: true });
	}

	async renameSession(sessionPath: string, name: string): Promise<void> {
		// Prefer the live handle if we already hold one — opening a second
		// SessionManager on the same file would deadlock against our own lock.
		const existing = this.findHandleBySessionPath(sessionPath);
		if (existing) {
			existing.handle.session.setSessionName(name);
			return;
		}
		const manager = SessionManager.open(sessionPath);
		try {
			manager.appendSessionInfo(name);
		} finally {
			manager.close();
		}
	}

	/** Snapshot of session paths whose agent loop is currently active. */
	getRunningSessionPaths(): string[] {
		return Array.from(this.runningSessionPaths);
	}

	/**
	 * Subscribe to running-set changes. Handler receives (sessionPath, running).
	 * Returns an unsubscribe function.
	 */
	onRunningChanged(handler: (sessionPath: string, running: boolean) => void): () => void {
		this.runningChangedHandlers.add(handler);
		return () => {
			this.runningChangedHandlers.delete(handler);
		};
	}

	private markRunning(sessionPath: string | undefined, running: boolean): void {
		if (!sessionPath) return;
		const had = this.runningSessionPaths.has(sessionPath);
		if (running && had) return;
		if (!running && !had) return;
		if (running) this.runningSessionPaths.add(sessionPath);
		else this.runningSessionPaths.delete(sessionPath);
		for (const h of this.runningChangedHandlers) {
			try {
				h(sessionPath, running);
			} catch (err) {
				console.warn("[RuntimeHost.markRunning] handler threw:", err);
			}
		}
	}

	getSessionPath(sessionId: string): string | undefined {
		const handle = this.sessions.get(sessionId);
		if (!handle) return undefined;
		return handle.session.sessionFile;
	}

	renameSessionById(sessionId: string, name: string): void {
		// We already hold the live AgentSession — rename through it directly so
		// we never open a second SessionManager (and second lock) on the file.
		const handle = this.requireSession(sessionId);
		handle.session.setSessionName(name);
	}

	/**
	 * Generate a short title from the first round of conversation and persist it
	 * onto the session. Returns the persisted name, or null when the model/key
	 * is not available or the LLM produced no usable text.
	 */
	async autoTitleSession(sessionId: string, userText: string, assistantText: string): Promise<string | null> {
		const handle = this.requireSession(sessionId);
		const model = handle.session.model;
		if (!model) {
			console.warn(`[autoTitleSession] session=${sessionId} skipped: no model on session`);
			return null;
		}
		const apiKey = await handle.session.modelRegistry.getApiKey(model);
		if (!apiKey) {
			console.warn(
				`[autoTitleSession] session=${sessionId} skipped: no apiKey for model ${model.provider}/${model.id}`,
			);
			return null;
		}
		console.log(
			`[autoTitleSession] session=${sessionId} model=${model.provider}/${model.id} userLen=${userText.length} assistantLen=${assistantText.length}`,
		);

		const trimmedUser = userText.trim().slice(0, 800);
		const trimmedAssistant = assistantText.trim().slice(0, 1500);
		const promptText =
			`请为下面这段对话生成一个 6 到 14 个字符之间的中文短标题，用来在侧边栏标识这个会话。\n` +
			`要求：只输出标题本身；不要引号、书名号、句号、感叹号或其他标点；不要任何解释或前后缀。\n\n` +
			`<用户消息>\n${trimmedUser}\n</用户消息>\n\n` +
			`<助手回复>\n${trimmedAssistant}\n</助手回复>`;

		try {
			const response = await completeSimple(
				model,
				{
					systemPrompt: "你是会话标题生成器。严格按用户要求只输出一个简短中文标题。",
					messages: [
						{
							role: "user" as const,
							content: [{ type: "text" as const, text: promptText }],
							timestamp: Date.now(),
						},
					],
				},
				// reasoning: "minimal" — for reasoning-capable models (e.g. gpt-oss)
				// minimise the thinking budget so the answer comes out as text
				// instead of being consumed entirely by the thinking channel.
				{ apiKey, maxTokens: 256, reasoning: "minimal" },
			);
			if (response.stopReason === "error") {
				console.warn(
					`[autoTitleSession] session=${sessionId} stopReason=error message=${
						(response as { errorMessage?: string }).errorMessage ?? "(none)"
					}`,
				);
				return null;
			}
			const rawText = response.content
				.filter((c): c is TextContent => c.type === "text")
				.map((c) => c.text)
				.join("")
				.trim();
			// Fallback: some reasoning models (e.g. gpt-oss) route the whole short
			// answer through the thinking channel. Use thinking content as a
			// candidate when no plain text was produced.
			const rawThinking = response.content
				.filter((c): c is { type: "thinking"; thinking: string } => c.type === "thinking")
				.map((c) => c.thinking)
				.join("\n")
				.trim();
			const raw = rawText || rawThinking;
			const cleaned = sanitizeAutoTitle(raw);
			console.log(
				`[autoTitleSession] session=${sessionId} textLen=${rawText.length} thinkingLen=${rawThinking.length} cleaned=${JSON.stringify(cleaned)}`,
			);
			if (!cleaned) return null;
			handle.session.setSessionName(cleaned);
			return cleaned;
		} catch (err) {
			console.warn(`[RuntimeHost.autoTitleSession] generation failed for session=${sessionId}:`, err);
			return null;
		}
	}

	async disposeSession(sessionId: string): Promise<void> {
		const handle = this.sessions.get(sessionId);
		if (!handle) return;
		this.inFlightUnsubscribers.get(sessionId)?.();
		this.inFlightUnsubscribers.delete(sessionId);
		this.inFlightBuffers.delete(sessionId);
		this.externalSubscribers.delete(sessionId);
		this.markRunning(handle.session.sessionFile, false);
		handle.session.dispose();
		this.sessions.delete(sessionId);
		this.currentTurnStartedAt.delete(sessionId);
		clearSessionGrants(sessionId);
	}

	/**
	 * Dispose every open session this host owns and release all file locks.
	 * Call from the IPC layer when its host (e.g. an Electron WebContents) is
	 * being torn down — otherwise SessionManager locks survive until process exit.
	 */
	async disposeAllSessions(): Promise<void> {
		for (const [sessionId, handle] of this.sessions) {
			try {
				this.inFlightUnsubscribers.get(sessionId)?.();
				handle.session.dispose();
			} catch (err) {
				console.error(`[RuntimeHost.disposeAllSessions] failed to dispose ${sessionId}:`, err);
			}
			clearSessionGrants(sessionId);
		}
		const wasRunning = Array.from(this.runningSessionPaths);
		this.sessions.clear();
		this.currentTurnStartedAt.clear();
		this.inFlightUnsubscribers.clear();
		this.inFlightBuffers.clear();
		this.externalSubscribers.clear();
		this.runningSessionPaths.clear();
		for (const p of wasRunning) {
			for (const h of this.runningChangedHandlers) {
				try {
					h(p, false);
				} catch {
					// 忽略，下游接收方异常不影响其他处理器
				}
			}
		}
	}

	private requireSession(sessionId: string): SessionHandle {
		const handle = this.sessions.get(sessionId);
		if (!handle) {
			throw runtimeError("SESSION_NOT_FOUND", `Session not found: ${sessionId}`, false);
		}
		return handle;
	}

	private assertCanSwitchExecutionMode(handle: SessionHandle): void {
		if (handle.session.isStreaming || handle.session.isBashRunning) {
			throw runtimeError(
				"EXECUTION_MODE_SWITCH_BLOCKED",
				"Cannot switch execution mode while the agent is running.",
				true,
			);
		}
	}

	private resolveExecutionModeTools(
		executionMode: SessionExecutionMode,
		cwd: string,
		getSessionId: () => string | undefined,
	): CreateAgentSessionOptions["customTools"] {
		if (executionMode !== "sandbox") return undefined;
		return buildSandboxToolDefinitions({
			cwd,
			windowsSandboxHostPath: this.sandboxHostPath,
			linuxBubblewrapPath: this.linuxBubblewrapPath,
			macosSandboxExecPath: this.macosSandboxExecPath,
			getSessionId,
		});
	}

	private createExtensionUIContext(sessionIdRef: { current?: string }): ExtensionUIContext {
		return {
			select: async () => undefined,
			confirm: async (title, message, opts) => {
				const handler = this.userConfirmationHandler;
				if (!handler || opts?.signal?.aborted) return false;
				return handler(
					{
						requestId: randomUUID(),
						sessionId: sessionIdRef.current ?? "",
						title,
						message,
					},
					opts?.signal,
				);
			},
			input: async () => undefined,
			notify: () => {},
			onTerminalInput: () => () => {},
			setStatus: () => {},
			setWorkingMessage: () => {},
			setWidget: () => {},
			setFooter: () => {},
			setHeader: () => {},
			setTitle: () => {},
			custom: async () => undefined as never,
			pasteToEditor: () => {},
			setEditorText: () => {},
			getEditorText: () => "",
			editor: async () => undefined,
			setEditorComponent: () => {},
			theme: {} as ExtensionUIContext["theme"],
			getAllThemes: () => [],
			getTheme: () => undefined,
			setTheme: () => ({ success: false, error: "Desktop runtime theme switching is unavailable." }),
			getToolsExpanded: () => false,
			setToolsExpanded: () => {},
			requestSandboxGrant: async (request) => {
				const handler = this.userSandboxGrantHandler;
				if (!handler) return "deny";
				return handler({
					requestId: randomUUID(),
					sessionId: sessionIdRef.current ?? "",
					title: request.title,
					message: request.message,
					toolName: request.toolName,
					capability: request.capability,
					target: request.target,
					resolvedTarget: request.resolvedTarget,
					grantRoot: request.grantRoot,
					command: request.command,
					sensitive: request.sensitive,
				});
			},
		};
	}

	private baseEvent(sessionId: string, source: SessionEventBase["source"], timestamp = Date.now()): SessionEventBase {
		return {
			schemaVersion: 1,
			sessionId,
			eventId: randomUUID(),
			timestamp,
			source,
		};
	}

	private lifecycleEvent(
		sessionId: string,
		phase: "created" | "agent_start" | "turn_start" | "turn_end" | "agent_end" | "aborted",
		timestamp?: number,
	): SessionEvent {
		return {
			...this.baseEvent(sessionId, "runtime-core", timestamp),
			type: "session.lifecycle",
			phase,
		};
	}

	private mapEvent(sessionId: string, event: AgentSessionEvent, session: AgentSession): SessionEvent[] {
		const events: SessionEvent[] = [];

		if (event.type === "agent_start") {
			console.log(`[RuntimeHost.event] session=${sessionId} type=agent_start`);
			const startedAt = Date.now();
			this.currentTurnStartedAt.set(sessionId, startedAt);
			events.push(this.lifecycleEvent(sessionId, "agent_start", startedAt));
			return events;
		}

		if (event.type === "turn_start") {
			console.log(`[RuntimeHost.event] session=${sessionId} type=turn_start`);
			events.push(this.lifecycleEvent(sessionId, "turn_start"));
			return events;
		}

		if (event.type === "turn_end") {
			console.log(`[RuntimeHost.event] session=${sessionId} type=turn_end`);
			events.push(this.lifecycleEvent(sessionId, "turn_end"));
			return events;
		}

		if (event.type === "agent_end") {
			console.log(`[RuntimeHost.event] session=${sessionId} type=agent_end`);
			const endedAt = Date.now();
			this.persistAssistantTurnTiming(sessionId, session, endedAt);
			events.push(this.lifecycleEvent(sessionId, "agent_end", endedAt));
			return events;
		}

		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "message.delta",
				delta: event.assistantMessageEvent.delta,
			});
			return events;
		}

		if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "thinking.delta",
				delta: event.assistantMessageEvent.delta,
			});
			return events;
		}

		if (event.type === "message_update" && event.assistantMessageEvent.type === "toolcall_start") {
			const partial = event.assistantMessageEvent.partial;
			const contentIndex = event.assistantMessageEvent.contentIndex;
			const toolContent = partial?.content?.[contentIndex];
			if (toolContent && toolContent.type === "toolCall") {
				events.push({
					...this.baseEvent(sessionId, "agent"),
					type: "toolcall.start",
					toolCallId: String(toolContent.id ?? ""),
					toolName: String(toolContent.name ?? ""),
				});
			}
			return events;
		}

		if (event.type === "message_end" && event.message.role === "assistant") {
			const textLength = this.extractAssistantText(event.message.content).length;
			const toolCallCount = event.message.content.filter((item) => item.type === "toolCall").length;
			console.log(
				`[RuntimeHost.event] session=${sessionId} type=message_end stopReason=${event.message.stopReason} textLength=${textLength} toolCalls=${toolCallCount} input=${event.message.usage.input} output=${event.message.usage.output}`,
			);
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "message.final",
				message: event.message as Message,
			});

			const contextUsage = session.getContextUsage();
			console.log(
				`[RuntimeHost.event] session=${sessionId} type=usage_update input=${event.message.usage.input} output=${event.message.usage.output} contextPercent=${contextUsage?.percent ?? null} contextWindow=${contextUsage?.contextWindow ?? 0}`,
			);
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "usage.update",
				input: event.message.usage.input,
				output: event.message.usage.output,
				cacheRead: event.message.usage.cacheRead,
				cacheWrite: event.message.usage.cacheWrite,
				costTotal: event.message.usage.cost.total,
				contextPercent: contextUsage?.percent ?? null,
				contextWindow: contextUsage?.contextWindow ?? 0,
			});

			if (event.message.stopReason === "error") {
				const errorText =
					this.extractAssistantText(event.message.content) ||
					(event.message as Message & { errorMessage?: string }).errorMessage ||
					"Assistant response ended with error";
				console.error(`[RuntimeHost.event] session=${sessionId} type=assistant_error message=${errorText}`);
				events.push({
					...this.baseEvent(sessionId, "agent"),
					type: "error",
					error: runtimeError("INTERNAL_ERROR", errorText, true, "provider"),
				});
			} else if (event.message.stopReason === "aborted") {
				console.warn(`[RuntimeHost.event] session=${sessionId} type=aborted`);
				const endedAt = Date.now();
				events.push(this.lifecycleEvent(sessionId, "aborted", endedAt));
			}
			// NOTE: Do NOT emit agent_end here. In a multi-turn agent loop,
			// message_end fires after each LLM call, not just the final one.
			// The real agent_end comes from the "agent_end" session event.
			return events;
		}

		if (event.type === "tool_execution_start") {
			console.log(
				`[RuntimeHost.event] session=${sessionId} type=tool_start toolCallId=${event.toolCallId} toolName=${event.toolName}`,
			);
			events.push({
				...this.baseEvent(sessionId, "tool"),
				type: "tool.start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				startedAt: event.startedAt,
			});
			return events;
		}

		if (event.type === "tool_execution_update") {
			events.push({
				...this.baseEvent(sessionId, "tool"),
				type: "tool.update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				partialResult: event.partialResult,
			});
			return events;
		}

		if (event.type === "tool_execution_phase") {
			events.push({
				...this.baseEvent(sessionId, "tool"),
				type: "tool.phase",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				label: event.label,
				atMs: event.atMs,
			});
			return events;
		}

		if (event.type === "tool_execution_end") {
			console.log(
				`[RuntimeHost.event] session=${sessionId} type=tool_end toolCallId=${event.toolCallId} toolName=${event.toolName} isError=${event.isError} durationMs=${event.durationMs}`,
			);
			events.push({
				...this.baseEvent(sessionId, "tool"),
				type: "tool.end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				isError: event.isError,
				result: event.result,
				startedAt: event.startedAt,
				durationMs: event.durationMs,
				phases: event.phases,
			});
			return events;
		}

		if (event.type === "auto_retry_start") {
			console.warn(
				`[RuntimeHost.event] session=${sessionId} type=auto_retry_start attempt=${event.attempt}/${event.maxAttempts} delayMs=${event.delayMs} message=${event.errorMessage}`,
			);
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "error",
				error: runtimeError("INTERNAL_ERROR", event.errorMessage, true, "provider"),
			});
			return events;
		}

		if (event.type === "todo_update") {
			console.log(`[RuntimeHost.event] session=${sessionId} type=todo_update items=${event.items.length}`);
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "todo_update",
				items: event.items as any[],
			});
			return events;
		}

		if (event.type === "auto_compaction_start") {
			console.log(`[RuntimeHost.event] session=${sessionId} type=compaction_start reason=${event.reason}`);
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "compaction.start",
				reason: event.reason,
			});
			return events;
		}

		if (event.type === "mcp_reload_start") {
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "mcp.reload.start",
			});
			return events;
		}

		if (event.type === "mcp_reload_end") {
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "mcp.reload.end",
				changed: event.changed,
				errorMessage: event.errorMessage,
			});
			return events;
		}

		if (event.type === "auto_compaction_end") {
			console.log(
				`[RuntimeHost.event] session=${sessionId} type=compaction_end success=${!!event.result && !event.aborted} aborted=${event.aborted} error=${event.errorMessage ?? ""}`,
			);
			events.push({
				...this.baseEvent(sessionId, "agent"),
				type: "compaction.end",
				success: !!event.result && !event.aborted,
				errorMessage: event.errorMessage,
			});
			return events;
		}

		return events;
	}

	private parseAssistantTurnTiming(entry: CustomEntry): AssistantTurnTiming | null {
		const data = entry.data;
		if (!data || typeof data !== "object") return null;
		const candidate = data as Record<string, unknown>;
		const { startedAt, endedAt, durationMs } = candidate;
		if (
			typeof startedAt !== "number" ||
			typeof endedAt !== "number" ||
			typeof durationMs !== "number" ||
			!Number.isFinite(startedAt) ||
			!Number.isFinite(endedAt) ||
			!Number.isFinite(durationMs)
		) {
			return null;
		}
		return { startedAt, endedAt, durationMs };
	}

	private persistAssistantTurnTiming(sessionId: string, session: AgentSession, endedAt: number): void {
		const startedAt = this.currentTurnStartedAt.get(sessionId);
		if (!startedAt) return;
		this.currentTurnStartedAt.delete(sessionId);
		session.sessionManager.appendCustomEntry(ASSISTANT_TURN_TIMING_TYPE, {
			startedAt,
			endedAt,
			durationMs: Math.max(0, endedAt - startedAt),
		});
	}

	private extractAssistantText(content: Message["content"]): string {
		if (typeof content === "string") return content;
		return content
			.filter((item): item is TextContent => item.type === "text")
			.map((item) => item.text)
			.join("");
	}
}

function sanitizeAutoTitle(raw: string): string {
	if (!raw) return "";
	// Reasoning models often emit a long internal monologue ending with the
	// final short answer. Heuristic: prefer the LAST non-empty line if it is
	// reasonably short (≤ 30 chars), else fall back to the first non-empty line.
	const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
	if (lines.length === 0) return "";
	const lastLine = lines[lines.length - 1];
	const firstLine = lines[0];
	const candidate = Array.from(lastLine.trim()).length <= 30 ? lastLine : firstLine;
	// Strip wrapping quotes/brackets/punctuation that the model commonly adds.
	const stripped = candidate
		.replace(/^[\s"'`「『《<[(（【“”‘’]+/, "")
		.replace(/[\s"'`」』》>\])）】“”‘’。．.!?！？，,、；;：:]+$/, "")
		.trim();
	if (!stripped) return "";
	// Hard cap at 14 chars (Array.from to count code points correctly).
	const chars = Array.from(stripped);
	return chars.length > 14 ? chars.slice(0, 14).join("") : stripped;
}

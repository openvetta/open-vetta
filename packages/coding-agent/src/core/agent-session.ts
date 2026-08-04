/**
 * AgentSession - Core abstraction for agent lifecycle and session management.
 *
 * This class is shared between all run modes (interactive, print, rpc).
 * It encapsulates:
 * - Agent state access
 * - Event subscription with automatic session persistence
 * - Model and thinking level management
 * - Compaction (manual and auto)
 * - Bash execution
 * - Session switching and branching
 *
 * Modes use this class and add their own I/O layer on top.
 */

import { join } from "node:path";
import type { Agent, AgentMessage, AgentState, ThinkingLevel } from "@vetta/agent-core";
import type { ImageContent, Model, TextContent } from "@vetta/ai";
import type { CompactionResult } from "../compaction/index.js";
import type { AgentPluginRuntimeConfig, CustomMessage } from "../model-context/index.js";
import { theme } from "../modes/interactive/theme/theme.js";
import { BackgroundTaskManager, buildTaskNotification } from "./background-tasks/index.js";
import type { BashResult } from "./bash-executor.js";
import { exportSessionToHtml, type ToolHtmlRenderer } from "./export-html/index.js";
import { createToolHtmlRenderer } from "./export-html/tool-renderer.js";
import type { ContextUsage, ExtensionRunner, ToolDefinition, ToolInfo } from "./extensions/index.js";
import { createEcosystemHookRuntime, type EcosystemHookRuntime } from "./hooks/index.js";
import type { McpManager } from "./mcp/index.js";
import { DEFAULT_MEMORY_CHAR_LIMIT, readMemoryContent } from "./memory/memory-store.js";
import type { ModelRegistry } from "./model-registry.js";
import type { PromptTemplate } from "./prompt-templates.js";
import type { ResourceLoader } from "./resource-loader.js";
import { SessionBackgroundTaskController } from "./session/background-task-controller.js";
import { BashController } from "./session/bash-controller.js";
import { CompactionController } from "./session/compaction-controller.js";
import { EPHEMERAL_PREFIX, EventRouter } from "./session/event-router.js";
import { InputPipeline } from "./session/input-pipeline.js";
import { ModelController, type ModelCycleResult } from "./session/model-controller.js";
import { QueueController } from "./session/queue-controller.js";
import { RetryController } from "./session/retry-controller.js";
import { RuntimeManager } from "./session/runtime-manager.js";
import type { SessionContext } from "./session/session-context.js";
import { SessionNavigator } from "./session/session-navigator.js";
import {
	computeContextUsage,
	computeSessionStats,
	getLastAssistantText as readLastAssistantText,
	type SessionStats,
} from "./session/session-stats.js";
import { type ParsedSkillBlock, parseSkillBlock } from "./session/skill-expansion.js";
import { SessionSubagentController } from "./session/subagent-controller.js";
import { restoreTodoFromSession } from "./session/todo-continuation.js";
import { SessionTodoController } from "./session/todo-controller.js";
import type {
	AgentSessionConfig,
	AgentSessionEvent,
	AgentSessionEventListener,
	ExtensionBindings,
	PromptOptions,
	PromptResourceRef,
} from "./session/types.js";
import type { BranchSummaryEntry, SessionManager } from "./session-manager/index.js";
import type { SettingsManager } from "./settings-manager.js";
import { createDefaultSubagentTypeRegistry, SubagentCoordinator, type SubagentSnapshot } from "./subagents/index.js";
import { TODO_SNAPSHOT_TYPE, TodoStore } from "./todo-store.js";
import type { BashOperations } from "./tools/bash/index.js";

// ============================================================================
// Skill Block Parsing
// ============================================================================

// parseSkillBlock / ParsedSkillBlock moved to ./session/skill-expansion.ts.
// Re-exported here to preserve the existing import path for external consumers.
export { type ParsedSkillBlock, parseSkillBlock };
export type {
	AgentSessionConfig,
	AgentSessionEvent,
	AgentSessionEventListener,
	ExtensionBindings,
	ModelCycleResult,
	PromptOptions,
	PromptResourceRef,
	SessionStats,
};

// Types (AgentSessionConfig/Event/PromptOptions/…), ModelCycleResult, and SessionStats
// were moved to ./session/*; all are re-exported above to preserve import paths.

// ============================================================================
// AgentSession Class
// ============================================================================

export class AgentSession {
	readonly agent: Agent;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;

	// Model + thinking level. Scoped-model state owned by the controller.
	private _model: ModelController;

	// Event subscription state
	private _unsubscribeAgent?: () => void;
	private _eventListeners: AgentSessionEventListener[] = [];

	// Steering / follow-up / next-turn queues. State owned by the controller.
	private _queue: QueueController;

	// Compaction (manual + auto). State owned by the controller.
	private _compaction: CompactionController;
	/** Shared context handed to sub-controllers. */
	private _ctx: SessionContext;

	// Session navigation (new/switch/fork/tree + branch summary). State in the controller.
	private _nav: SessionNavigator;

	// Agent event routing (dequeue / persistence / extension fan-out / retry + compaction dispatch).
	private _events: EventRouter;

	// Retry (auto-retry with backoff). State owned by the controller.
	private _retry: RetryController;

	// Bash execution. State owned by the controller.
	private _bash: BashController;

	// Subagent coordinator (optional, root sessions only).
	private _subagents?: SubagentCoordinator;
	private _subagentController?: SessionSubagentController;
	private _createSubagentCoordinator?: () => SubagentCoordinator;

	// Tool runtime + extension lifecycle + MCP. State owned by the manager.
	private _runtime: RuntimeManager;

	// Input/turn pipeline (prompt / steer / follow-up / send + todo continuation).
	private _input: InputPipeline;

	private _resourceLoader: ResourceLoader;
	// memory-mode (ADR-0009)
	private _memoryMode: boolean = false;
	private _memoryFile: string | undefined;
	private _memoryCharLimit: number = DEFAULT_MEMORY_CHAR_LIMIT;
	/** Frozen MEMORY.md snapshot captured at session start; injected into the
	 * system prompt and never re-read mid-session (preserves the prompt cache). */
	private _memorySnapshot: string = "";
	private _cwd: string;

	// Model registry for API key resolution
	private _modelRegistry: ModelRegistry;

	// Todo list
	private _todoStore: TodoStore;
	private _todoController: SessionTodoController;

	// Background bash tasks (run_in_background)
	private _backgroundTasks: BackgroundTaskManager;
	private _backgroundTaskController: SessionBackgroundTaskController;
	private _hookRuntime: EcosystemHookRuntime;
	private _closePromise?: Promise<void>;

	constructor(config: AgentSessionConfig) {
		this.agent = config.agent;
		this.sessionManager = config.sessionManager;
		this.settingsManager = config.settingsManager;
		this._resourceLoader = config.resourceLoader;
		this._cwd = config.cwd;
		this._modelRegistry = config.modelRegistry;
		this._hookRuntime = createEcosystemHookRuntime({
			host: {
				cwd: this._cwd,
				getSessionId: () => this.sessionManager.getSessionId(),
				getTranscriptPath: () => this.sessionManager.getSessionFile() ?? null,
				getModelId: () => this.model?.id ?? this.agent.state.model?.id ?? "unknown",
				abortCurrentRun: () => this.agent.abort(),
				recordAdditionalContexts: (contexts) => {
					for (const content of contexts) {
						const message: CustomMessage = {
							role: "custom",
							customType: "ecosystem-hook-context",
							content,
							display: false,
							timestamp: Date.now(),
						};
						this.agent.appendMessage(message);
						this.sessionManager.appendMessage(message);
					}
				},
			},
			initialSessionStartSource: this.sessionManager.getEntries().length > 0 ? "resume" : "startup",
			additionalAdapterFactories: config.additionalHookAdapterFactories,
			configLayers: config.hookConfigLayers,
		});

		// memory-mode: capture the frozen MEMORY.md snapshot once, here at
		// construction. im-gateway spawns a fresh process per message burst, so
		// "once at construction" ≈ once per inbound message — memory edits land
		// in the next message's prompt without busting the in-process cache.
		this._memoryMode = config.memoryMode ?? false;
		this._memoryFile = config.memoryFile ?? (this._memoryMode ? join(this._cwd, "MEMORY.md") : undefined);
		this._memoryCharLimit = config.memoryCharLimit ?? DEFAULT_MEMORY_CHAR_LIMIT;
		if (this._memoryMode && this._memoryFile) {
			this._memorySnapshot = readMemoryContent(this._memoryFile);
		}

		// Shared context for sub-controllers. model / extensionRunner are accessors
		// so controllers always read the current (mutable) values.
		const session = this;
		this._ctx = {
			agent: this.agent,
			sessionManager: this.sessionManager,
			settingsManager: this.settingsManager,
			modelRegistry: this._modelRegistry,
			cwd: this._cwd,
			hookRuntime: this._hookRuntime,
			get model() {
				return session.model;
			},
			get extensionRunner() {
				return session._runtime?.extensionRunner;
			},
			get memoryMode() {
				return session._memoryMode;
			},
			get memoryFile() {
				return session._memoryFile;
			},
			get memoryCharLimit() {
				return session._memoryCharLimit;
			},
			get memorySnapshot() {
				return session._memorySnapshot;
			},
			emit: (event) => session._emit(event),
			abort: () => session.abort(),
			disconnectFromAgent: () => session._disconnectFromAgent(),
			reconnectToAgent: () => session._reconnectToAgent(),
			quiesceSessionIdentityResources: () => session.quiesceSessionIdentityResources(),
			activateSessionIdentityResources: () => session.activateSessionIdentityResources(),
			rebindSessionStorageIdentity: () => session.rebindSessionStorageIdentity(),
		};
		this._compaction = new CompactionController(this._ctx);
		this._retry = new RetryController(this._ctx);
		this._bash = new BashController(this._ctx);
		this._model = new ModelController(this._ctx, config.scopedModels ?? []);
		this._queue = new QueueController(this._ctx);
		this._nav = new SessionNavigator(this._ctx, this._queue, this._model);

		// Initialize TodoStore with session persistence
		this._todoStore = new TodoStore((snapshot) => {
			this.sessionManager.appendCustomEntry(TODO_SNAPSHOT_TYPE, snapshot);
			this._emit({ type: "todo_update", items: snapshot.items });
		});

		// Restore todo state from session if resuming
		restoreTodoFromSession(this.sessionManager, this._todoStore);
		this._todoController = new SessionTodoController(this._todoStore, this._nav);

		this._events = new EventRouter(this._ctx, {
			todoStore: this._todoStore,
			queue: this._queue,
			retry: this._retry,
			compaction: this._compaction,
		});

		if (config.enableSubagents && config.subagentSessionFactory) {
			const factory = config.subagentSessionFactory;
			const typeRegistry = config.subagentTypeRegistry ?? createDefaultSubagentTypeRegistry();
			this._createSubagentCoordinator = () =>
				this.createSubagentCoordinator(factory, typeRegistry, {
					cwd: config.cwd,
					scenario: config.scenario ?? "cli",
					maxConcurrent: config.subagentMaxConcurrent,
				});
		}
		this._backgroundTasks = this.createBackgroundTaskManager();
		this._subagents = this._createSubagentCoordinator?.();
		this._backgroundTaskController = new SessionBackgroundTaskController(this._backgroundTasks, this._nav);
		this._subagentController = this._subagents
			? new SessionSubagentController(() => this._subagents, this._nav)
			: undefined;

		this._runtime = new RuntimeManager(this._ctx, this, {
			resourceLoader: this._resourceLoader,
			todoStore: this._todoStore,
			backgroundTasks: this._backgroundTasks,
			getBackgroundTasks: () => this._backgroundTasks,
			enableBackgroundTasks: config.enableBackgroundTasks !== false,
			getSubagentCoordinator: () => this._subagents,
			customTools: config.customTools ?? [],
			baseToolsOverride: config.baseToolsOverride,
			envOverlay: config.envOverlay,
			scenario: config.scenario,
			agentMode: config.agentMode,
			initialActiveToolNames: config.initialActiveToolNames,
			extensionRunnerRef: config.extensionRunnerRef,
			enableMcp: config.enableMcp !== undefined ? config.enableMcp : true,
			mcpDebug: config.mcpDebug || false,
			askUserQuestion: config.askUserQuestion,
			agentPlugins: config.agentPlugins,
			invokePluginTool: config.invokePluginTool,
			invokePluginContinuation: config.invokePluginContinuation,
			invokePluginSystemPrompt: config.invokePluginSystemPrompt,
		});

		this._input = new InputPipeline(this._ctx, {
			runtime: this._runtime,
			queue: this._queue,
			bash: this._bash,
			retry: this._retry,
			compaction: this._compaction,
			todoStore: this._todoStore,
			resourceLoader: this._resourceLoader,
		});

		// Initialize MCP manager (async; rebuilds runtime when servers are ready).
		this._runtime.initMcp();

		// Always subscribe to agent events for internal handling
		// (session persistence, extensions, auto-compaction, retry logic)
		this._unsubscribeAgent = this.agent.subscribe((event) => {
			if (event.type === "agent_start") {
				this._runtime.resetPluginContinuationRun();
			}
			this._events.handle(event);
		});

		// Build runtime initially (will be rebuilt after MCP initialization if MCP is enabled)
		this._runtime.buildRuntime({
			activeToolNames: config.initialActiveToolNames,
			includeAllExtensionTools: true,
		});

		// Register the continuation policy for todo continuation.
		// This runs INSIDE the agent loop (before follow-up queue is consumed),
		// ensuring the agent cannot exit the loop while todo items remain.
		this.agent.continuationProvider = async (signal) => {
			const todoMessages = this._input.buildTodoContinuationMessages();
			if (todoMessages.length > 0) return todoMessages;
			const pluginMessages = await this._runtime.collectPluginContinuationMessages(signal);
			if (pluginMessages.length > 0) return pluginMessages;
			const fragments = await this._hookRuntime.runStop(
				readLastAssistantText(this.agent.state.messages) ?? null,
				signal,
			);
			return fragments.map((text) => ({
				role: "user" as const,
				content: [{ type: "text" as const, text }],
				timestamp: Date.now(),
			}));
		};
	}

	private createBackgroundTaskManager(): BackgroundTaskManager {
		const manager = new BackgroundTaskManager();
		// Forward state changes to the current session UI and inject completion
		// notifications into the agent loop. Stale managers are ignored during
		// Session identity replacement.
		manager.subscribe(() => {
			if (this._backgroundTasks !== manager) return;
			this._emit({ type: "background_tasks_update", tasks: manager.list() });
		});
		manager.onNotify = (task) => {
			if (this._backgroundTasks !== manager) return;
			void this.sendCustomMessage(
				{ customType: "task-notification", content: buildTaskNotification(task), display: true },
				{ triggerTurn: true, deliverAs: "followUp" },
			).catch((err) => {
				console.error(`[BackgroundTasks] Failed to deliver task notification for ${task.id}:`, err);
			});
		};
		return manager;
	}

	private createSubagentCoordinator(
		factory: NonNullable<AgentSessionConfig["subagentSessionFactory"]>,
		typeRegistry: NonNullable<AgentSessionConfig["subagentTypeRegistry"]>,
		options: { cwd: string; scenario: NonNullable<AgentSessionConfig["scenario"]>; maxConcurrent?: number },
	): SubagentCoordinator {
		let coordinator: SubagentCoordinator;
		coordinator = new SubagentCoordinator({
			factory,
			typeRegistry,
			parentSessionId: this.sessionManager.getSessionId(),
			parentSessionFile: this.sessionManager.getSessionFile(),
			cwd: options.cwd,
			scenario: options.scenario,
			getModel: () => this.model,
			getThinkingLevel: () => this.thinkingLevel,
			getModelRegistry: () => this._modelRegistry,
			getParentMcpTools: () => this._runtime?.mcpManager?.getTools() ?? [],
			// Fork snapshot for workflow children (ADR-0044): the parent's live
			// message state, which already reflects the current branch.
			getParentContextMessages: () => [...this.agent.state.messages],
			agentDir: undefined,
			maxConcurrent: options.maxConcurrent,
			hookRuntime: this._hookRuntime,
			onUpdate: (agents) => {
				if (this._subagents === coordinator) this._emit({ type: "subagents_update", agents });
			},
			onNotify: (payload) => {
				if (this._subagents !== coordinator) return;
				void this.sendCustomMessage(
					{ customType: "subagent-notification", content: payload.text, display: true },
					{ triggerTurn: true, deliverAs: "followUp" },
				).catch((err) => {
					console.error("[Subagents] Failed to deliver subagent notification:", err);
				});
			},
		});
		return coordinator;
	}

	private async quiesceSessionIdentityResources(): Promise<void> {
		const subagents = this._subagents;
		const backgroundTasks = this._backgroundTasks;
		this._subagents = undefined;
		backgroundTasks.onNotify = undefined;
		const results = await Promise.allSettled([
			this._compaction.quiesceSessionIdentity(),
			this._bash.quiesceSessionIdentity(),
			subagents?.dispose(),
			backgroundTasks.shutdown(),
		]);
		const failures = this.collectCloseFailures(results);
		if (failures.length > 0) {
			throw new AggregateError(failures, "Failed to quiet outgoing Session identity resources");
		}
	}

	private async activateSessionIdentityResources(): Promise<void> {
		const backgroundTasks = this.createBackgroundTaskManager();
		let subagents: SubagentCoordinator | undefined;
		try {
			subagents = this._createSubagentCoordinator?.();
			this._backgroundTasks = backgroundTasks;
			this._subagents = subagents;
			this._backgroundTaskController = new SessionBackgroundTaskController(backgroundTasks, this._nav);
			this._subagentController = subagents
				? new SessionSubagentController(() => this._subagents, this._nav)
				: undefined;
			this._compaction.activateSessionIdentity();
			this._runtime.resetSessionIdentityState();
			this._input.resetSessionIdentityState();
			this._events.resetSessionIdentityState();
			restoreTodoFromSession(this.sessionManager, this._todoStore);
		} catch (error) {
			backgroundTasks.onNotify = undefined;
			if (this._subagents === subagents) {
				this._subagents = undefined;
				this._subagentController = undefined;
			}
			const cleanup = await Promise.allSettled([subagents?.dispose(), backgroundTasks.shutdown()]);
			const cleanupFailures = this.collectCloseFailures(cleanup);
			if (cleanupFailures.length > 0) {
				throw new AggregateError([error, ...cleanupFailures], "Failed to activate Session identity resources");
			}
			throw error;
		}
		this.emitIdentityState({ type: "background_tasks_update", tasks: [] });
		this.emitIdentityState({ type: "subagents_update", agents: [] });
		this.emitIdentityState({ type: "todo_update", items: this._todoStore.getAll() });
	}

	private rebindSessionStorageIdentity(): void {
		this.agent.sessionId = this.sessionManager.getSessionId();
		this._subagents?.rebindParentSession(this.sessionId, this.sessionFile);
	}

	private emitIdentityState(event: AgentSessionEvent): void {
		this._emit(event);
	}

	/** Model registry for API key resolution and model discovery */
	get modelRegistry(): ModelRegistry {
		return this._modelRegistry;
	}

	/** Host-facing Subagent commands when enableSubagents is on; undefined otherwise. */
	get subagents(): SessionSubagentController | undefined {
		return this._subagentController;
	}

	/** Snapshot list of child subagents (empty when disabled). */
	listSubagents(): ReadonlyArray<SubagentSnapshot> {
		return this._subagentController?.list() ?? [];
	}

	/** Interrupt a child by id / task_name / path (UI / host control). */
	interruptSubagent(target: string): SubagentSnapshot | undefined {
		return this._subagentController?.interrupt(target);
	}

	/**
	 * Drop terminal subagents from the live registry (UI "clear finished").
	 * Does not delete child transcript files on disk.
	 */
	clearFinishedSubagents(): number {
		return this._subagentController?.clearFinished() ?? 0;
	}

	/** MCP manager for managing MCP servers and tools */
	get mcpManager(): McpManager | undefined {
		return this._runtime.mcpManager;
	}

	// =========================================================================
	// Event Subscription
	// =========================================================================

	/** Emit an event to all listeners */
	private _emit(event: AgentSessionEvent): void {
		for (const l of this._eventListeners) {
			try {
				l(event);
			} catch (error) {
				console.warn("[AgentSession] Event listener failed", error);
			}
		}
	}

	/** @deprecated kept for compatibility; see event-router EPHEMERAL_PREFIX. */
	static readonly EPHEMERAL_PREFIX = EPHEMERAL_PREFIX;

	/**
	 * Subscribe to agent events.
	 * Session persistence is handled internally (saves messages on message_end).
	 * Multiple listeners can be added. Returns unsubscribe function for this listener.
	 */
	subscribe(listener: AgentSessionEventListener): () => void {
		this._eventListeners.push(listener);

		// Return unsubscribe function for this specific listener
		return () => {
			const index = this._eventListeners.indexOf(listener);
			if (index !== -1) {
				this._eventListeners.splice(index, 1);
			}
		};
	}

	/**
	 * Temporarily disconnect from agent events.
	 * User listeners are preserved and will receive events again after resubscribe().
	 * Used internally during operations that need to pause event processing.
	 */
	private _disconnectFromAgent(): void {
		if (this._unsubscribeAgent) {
			this._unsubscribeAgent();
			this._unsubscribeAgent = undefined;
		}
	}

	/**
	 * Reconnect to agent events after _disconnectFromAgent().
	 * Preserves all existing listeners.
	 */
	private _reconnectToAgent(): void {
		if (this._closePromise) return;
		if (this._unsubscribeAgent) return; // Already connected
		this._unsubscribeAgent = this.agent.subscribe((event) => {
			if (event.type === "agent_start") {
				this._runtime.resetPluginContinuationRun();
			}
			this._events.handle(event);
		});
	}

	/**
	 * Remove all listeners and disconnect from agent.
	 * Call this when completely done with the session.
	 *
	 * Releases the session file lock so another process can take ownership.
	 * After dispose(), the underlying SessionManager must not be reused.
	 */
	dispose(): void {
		void this.close().catch((error) => {
			console.warn("[AgentSession] Close failed", error);
		});
	}

	/**
	 * Close the session and wait for all session-owned work to become quiet
	 * before releasing the session file lock. Repeated calls share one Promise.
	 */
	close(): Promise<void> {
		if (this._closePromise) return this._closePromise;
		this._disconnectFromAgent();
		this._eventListeners = [];
		const identityOperations = this._nav.closeAdmission();
		this._closePromise = this.performClose(identityOperations);
		return this._closePromise;
	}

	private async performClose(identityOperations: Promise<void>): Promise<void> {
		const criticalFailures: unknown[] = [];
		try {
			await identityOperations;
			const subagents = this._subagents;
			this._subagents = undefined;
			// Stop producers before waiting so no new child work can attach while closing.
			const stopResults = await Promise.allSettled([
				this.runCloseOperation(() => this._retry.abortRetry()),
				this.runCloseOperation(() => this._compaction.quiesceSessionIdentity()),
				this.runCloseOperation(() => this._nav.abortBranchSummary()),
				this.runCloseOperation(() => this._bash.quiesceSessionIdentity()),
				this.runCloseOperation(() => this.agent.abort()),
			]);
			this._disconnectFromAgent();
			this.logCloseFailures("work producers", stopResults);
			criticalFailures.push(...this.collectCloseFailures(stopResults));

			const resourceResults = await Promise.allSettled([
				this.runCloseOperation(() => this.agent.waitForIdle()),
				this.runCloseOperation(() => this._hookRuntime.runSessionEnd("dispose")),
				this.runCloseOperation(() => subagents?.dispose()),
				this.runCloseOperation(() => this._backgroundTasks.shutdown()),
			]);
			this.logCloseFailures("owned resources", resourceResults);
			// SessionEnd remains best-effort for compatibility; the other entries
			// represent resources whose failed close invalidates a successful result.
			criticalFailures.push(
				...this.collectCloseFailures([resourceResults[0], resourceResults[2], resourceResults[3]]),
			);

			// Parent MCP remains available until foreground and child work are quiet.
			const runtimeResults = await Promise.allSettled([this.runCloseOperation(() => this._runtime.close())]);
			this.logCloseFailures("runtime", runtimeResults);
			criticalFailures.push(...this.collectCloseFailures(runtimeResults));
			if (criticalFailures.length > 0) {
				throw new AggregateError(criticalFailures, "AgentSession failed to close all owned resources");
			}
		} finally {
			// Ownership is released last; another process cannot acquire the session
			// while this instance still owns children or MCP connections.
			this.sessionManager.close();
		}
	}

	private collectCloseFailures(results: PromiseSettledResult<unknown>[]): unknown[] {
		return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	}

	private runCloseOperation(operation: () => unknown): Promise<void> {
		try {
			return Promise.resolve(operation()).then(() => undefined);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	private logCloseFailures(label: string, results: PromiseSettledResult<unknown>[]): void {
		for (const result of results) {
			if (result.status === "rejected") {
				console.warn(`[AgentSession] Failed to close ${label}`, result.reason);
			}
		}
	}

	// =========================================================================
	// Read-only State Access
	// =========================================================================

	/** Full agent state */
	get state(): AgentState {
		return this.agent.state;
	}

	/** Current model (may be undefined if not yet selected) */
	get model(): Model<any> | undefined {
		return this.agent.state.model;
	}

	/** Current thinking level */
	get thinkingLevel(): ThinkingLevel {
		return this.agent.state.thinkingLevel;
	}

	/** Whether agent is currently streaming a response */
	get isStreaming(): boolean {
		return this.agent.state.isStreaming;
	}

	/** Current effective system prompt (includes any per-turn extension modifications) */
	get systemPrompt(): string {
		return this.agent.state.systemPrompt;
	}

	/** Current retry attempt (0 if not retrying) */
	get retryAttempt(): number {
		return this._retry.retryAttempt;
	}

	/** Names of currently active tools. */
	getActiveToolNames(): string[] {
		return this._runtime.getActiveToolNames();
	}

	/** All configured tools with name, description, and parameter schema. */
	getAllTools(): ToolInfo[] {
		return this._runtime.getAllTools();
	}

	/** Set active tools by name (unknown names ignored); rebuilds the system prompt. */
	setActiveToolsByName(toolNames: string[]): void {
		this._runtime.setActiveToolsByName(toolNames);
	}

	/** Reconfigure SDK custom tools and rebuild runtime. */
	reconfigureCustomTools(customTools: ToolDefinition[] | undefined): void {
		this._runtime.reconfigureCustomTools(customTools);
	}

	/** Reconfigure plugin-provided runtime resources and rebuild tools/system prompt. */
	async reconfigureAgentPlugins(agentPlugins: AgentPluginRuntimeConfig | undefined): Promise<void> {
		await this._runtime.reconfigureAgentPlugins(agentPlugins);
	}

	/** 当前工作模式（agent_mode 轴）。 */
	get agentMode(): string | undefined {
		return this._runtime.agentMode;
	}

	/** 切换工作模式并重建 runtime（工具集 + 系统提示词）。调用方须在 turn 边界调用。见 ADR-0046。 */
	setAgentMode(mode: string | undefined): void {
		this._runtime.setAgentMode(mode);
	}

	async prepareSystemPromptForAgentRun(messages: AgentMessage[], signal?: AbortSignal): Promise<string> {
		return this._runtime.prepareSystemPromptForAgentRun(messages, signal);
	}

	/** Whether auto-compaction is currently running */
	get isCompacting(): boolean {
		return this._compaction.isCompacting;
	}

	/** All messages including custom types like BashExecutionMessage */
	get messages(): AgentMessage[] {
		return this.agent.state.messages;
	}

	/** Current steering mode */
	get steeringMode(): "all" | "one-at-a-time" {
		return this.agent.getSteeringMode();
	}

	/** Current follow-up mode */
	get followUpMode(): "all" | "one-at-a-time" {
		return this.agent.getFollowUpMode();
	}

	/** Current session file path, or undefined if sessions are disabled */
	get sessionFile(): string | undefined {
		return this.sessionManager.getSessionFile();
	}

	/** Current session ID */
	get sessionId(): string {
		return this.sessionManager.getSessionId();
	}

	/** Current session display name, if set */
	get sessionName(): string | undefined {
		return this.sessionManager.getSessionName();
	}

	/** Full branch entries from root to current leaf (for UI history display). */
	getSessionBranch(): import("./session-manager/index.js").SessionEntry[] {
		return this.sessionManager.getBranch();
	}

	/** Scoped models for cycling (from --models flag) */
	get scopedModels(): ReadonlyArray<{ model: Model<any>; thinkingLevel: ThinkingLevel }> {
		return this._model.scopedModels;
	}

	/** Update scoped models for cycling */
	setScopedModels(scopedModels: Array<{ model: Model<any>; thinkingLevel: ThinkingLevel }>): void {
		this._model.setScopedModels(scopedModels);
	}

	/** File-based prompt templates */
	get promptTemplates(): ReadonlyArray<PromptTemplate> {
		return this._resourceLoader.getPrompts().prompts;
	}

	/** Host-facing Todo commands for task planning and tracking */
	get todoStore(): SessionTodoController {
		return this._todoController;
	}

	/** Host-facing background Bash task commands (run_in_background) */
	get backgroundTasks(): SessionBackgroundTaskController {
		return this._backgroundTaskController;
	}

	/** memory-mode enabled? (ADR-0009) */
	get memoryMode(): boolean {
		return this._memoryMode;
	}

	/** Absolute MEMORY.md path, or undefined when memory-mode is off. */
	get memoryFile(): string | undefined {
		return this._memoryFile;
	}

	/** MEMORY.md character budget. */
	get memoryCharLimit(): number {
		return this._memoryCharLimit;
	}

	// =========================================================================
	// Prompting
	// =========================================================================

	/**
	 * Send a prompt to the agent. Handles extension commands, expands templates,
	 * queues during streaming, validates model/API key, and drives the turn.
	 */
	async prompt(text: string, options?: PromptOptions): Promise<void> {
		return this._nav.startSessionOperation(() => this._input.prompt(text, options));
	}

	/**
	 * Queue a steering message to interrupt the agent mid-run.
	 * @throws Error if text is an extension command
	 */
	async steer(text: string, images?: ImageContent[]): Promise<void> {
		return this._nav.startSessionOperation(() => this._input.steer(text, images));
	}

	/**
	 * Queue a follow-up message to be processed after the agent finishes.
	 * @throws Error if text is an extension command
	 */
	async followUp(text: string, images?: ImageContent[]): Promise<void> {
		return this._nav.startSessionOperation(() => this._input.followUp(text, images));
	}

	/** Send a custom message to the session (streaming-aware; optional turn trigger). */
	async sendCustomMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void> {
		return this._nav.startSessionOperation(() => this._input.sendCustomMessage(message, options));
	}

	/** Send a user message to the agent. Always triggers a turn. */
	async sendUserMessage(
		content: string | (TextContent | ImageContent)[],
		options?: { deliverAs?: "steer" | "followUp" },
	): Promise<void> {
		return this._nav.startSessionOperation(() => this._input.sendUserMessage(content, options));
	}

	/**
	 * Clear all queued messages and return them.
	 * Useful for restoring to editor when user aborts.
	 * @returns Object with steering and followUp arrays
	 */
	clearQueue(): { steering: string[]; followUp: string[] } {
		return this._nav.runImmediateSessionOperation(() => this._queue.clear());
	}

	/** Number of pending messages (includes both steering and follow-up) */
	get pendingMessageCount(): number {
		return this._queue.pendingCount;
	}

	/** Get pending steering messages (read-only) */
	getSteeringMessages(): readonly string[] {
		return this._queue.steeringMessages;
	}

	/** Get pending follow-up messages (read-only) */
	getFollowUpMessages(): readonly string[] {
		return this._queue.followUpMessages;
	}

	get resourceLoader(): ResourceLoader {
		return this._resourceLoader;
	}

	/**
	 * Abort current operation and wait for agent to become idle.
	 */
	async abort(): Promise<void> {
		this.abortRetry();
		this.agent.abort();
		await this.agent.waitForIdle();
	}

	/** Start a new session (optionally branched from a parent). */
	async newSession(options?: {
		parentSession?: string;
		setup?: (sessionManager: SessionManager) => Promise<void>;
	}): Promise<boolean> {
		return this._nav.newSession(options);
	}

	// =========================================================================
	// Model Management
	// =========================================================================

	/**
	 * Set model directly. Validates API key, saves to session and settings.
	 * @throws Error if no API key available for the model
	 */
	async setModel(model: Model<any>): Promise<void> {
		return this._nav.startSessionOperation(() => this._model.setModel(model));
	}

	/**
	 * Cycle to next/previous model (scoped models if --models was set, else all available).
	 */
	async cycleModel(direction: "forward" | "backward" = "forward"): Promise<ModelCycleResult | undefined> {
		return this._nav.startSessionOperation(() => this._model.cycleModel(direction));
	}

	// =========================================================================
	// Thinking Level Management
	// =========================================================================

	/** Set thinking level (clamped to current model capabilities). */
	setThinkingLevel(level: ThinkingLevel): void {
		this._nav.runImmediateSessionOperation(() => this._model.setThinkingLevel(level));
	}

	/** Cycle to next thinking level. Returns undefined if the model doesn't support thinking. */
	cycleThinkingLevel(): ThinkingLevel | undefined {
		return this._nav.runImmediateSessionOperation(() => this._model.cycleThinkingLevel());
	}

	/** Get available thinking levels for the current model. */
	getAvailableThinkingLevels(): ThinkingLevel[] {
		return this._model.getAvailableThinkingLevels();
	}

	/** Check if current model supports xhigh thinking level. */
	supportsXhighThinking(): boolean {
		return this._model.supportsXhighThinking();
	}

	/** Check if current model supports thinking/reasoning. */
	supportsThinking(): boolean {
		return this._model.supportsThinking();
	}

	// =========================================================================
	// Queue Mode Management
	// =========================================================================

	/**
	 * Set steering message mode.
	 * Saves to settings.
	 */
	setSteeringMode(mode: "all" | "one-at-a-time"): void {
		this.agent.setSteeringMode(mode);
		this.settingsManager.setSteeringMode(mode);
	}

	/**
	 * Set follow-up message mode.
	 * Saves to settings.
	 */
	setFollowUpMode(mode: "all" | "one-at-a-time"): void {
		this.agent.setFollowUpMode(mode);
		this.settingsManager.setFollowUpMode(mode);
	}

	// =========================================================================
	// Compaction
	// =========================================================================

	/**
	 * Manually compact the session context.
	 * Aborts current agent operation first.
	 * @param customInstructions Optional instructions for the compaction summary
	 */
	async compact(customInstructions?: string, signal?: AbortSignal): Promise<CompactionResult> {
		return this._nav.startSessionOperation(() => this._compaction.compact(customInstructions, signal));
	}

	/**
	 * Cancel in-progress compaction (manual or auto).
	 */
	abortCompaction(): void {
		this._compaction.abort();
	}

	/** Cancel in-progress branch summarization. */
	abortBranchSummary(): void {
		this._nav.abortBranchSummary();
	}

	/**
	 * Consolidate durable facts from the CURRENT context into MEMORY.md on demand
	 * (ADR-0009). Unlike the automatic flush that runs before a rollover, this is
	 * an explicit consolidation point — the host calls it before discarding the
	 * session (e.g. the user's `/new`), so a short session that never hit the
	 * rollover threshold still gets its memory凝结. memory-mode only; best-effort;
	 * returns the number of entries written.
	 */
	async flushMemory(signal?: AbortSignal): Promise<number> {
		return this._nav.startSessionOperation(() => this._compaction.flushMemory(signal));
	}

	/**
	 * Pre-LLM-call compaction. Called from transformContext before each LLM call.
	 */
	async preCallCompaction(messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> {
		return this._compaction.preCallCompaction(messages, signal);
	}

	/**
	 * Toggle auto-compaction setting.
	 */
	setAutoCompactionEnabled(enabled: boolean): void {
		this.settingsManager.setCompactionEnabled(enabled);
	}

	/** Whether auto-compaction is enabled */
	get autoCompactionEnabled(): boolean {
		return this.settingsManager.getCompactionEnabled();
	}

	async bindExtensions(bindings: ExtensionBindings): Promise<void> {
		return this._runtime.bindExtensions(bindings);
	}

	/** Reload MCP servers from disk and rebuild the runtime. */
	async reloadMcp(): Promise<void> {
		return this._runtime.reloadMcp();
	}

	/** Reload settings, resources, and extensions, then rebuild the runtime. */
	async reload(): Promise<void> {
		return this._runtime.reload();
	}

	// =========================================================================
	// Auto-Retry
	// =========================================================================

	/** Cancel in-progress retry. */
	abortRetry(): void {
		this._retry.abortRetry();
	}

	/** Whether auto-retry is currently in progress */
	get isRetrying(): boolean {
		return this._retry.isRetrying;
	}

	/** Whether auto-retry is enabled */
	get autoRetryEnabled(): boolean {
		return this.settingsManager.getRetryEnabled();
	}

	/**
	 * Toggle auto-retry setting.
	 */
	setAutoRetryEnabled(enabled: boolean): void {
		this.settingsManager.setRetryEnabled(enabled);
	}

	// =========================================================================
	// Bash Execution
	// =========================================================================

	/**
	 * Execute a bash command. Adds result to agent context and session.
	 */
	async executeBash(
		command: string,
		onChunk?: (chunk: string) => void,
		options?: { excludeFromContext?: boolean; operations?: BashOperations },
	): Promise<BashResult> {
		return this._nav.startSessionOperation(() => this._bash.executeBash(command, onChunk, options));
	}

	/**
	 * Record a bash execution result in session history.
	 * Used by executeBash and by extensions that handle bash execution themselves.
	 */
	recordBashResult(command: string, result: BashResult, options?: { excludeFromContext?: boolean }): void {
		this._nav.runImmediateSessionOperation(() => this._bash.recordBashResult(command, result, options));
	}

	/** Cancel running bash command. */
	abortBash(): void {
		this._bash.abortBash();
	}

	/** Whether a bash command is currently running */
	get isBashRunning(): boolean {
		return this._bash.isBashRunning;
	}

	/** Whether there are pending bash messages waiting to be flushed */
	get hasPendingBashMessages(): boolean {
		return this._bash.hasPendingBashMessages;
	}

	// =========================================================================
	// Session Management
	// =========================================================================

	/**
	 * Switch to a different session file. Aborts current operation, loads
	 * messages, restores model/thinking. Returns false if cancelled by extension.
	 */
	async switchSession(sessionPath: string): Promise<boolean> {
		return this._nav.switchSession(sessionPath);
	}

	/**
	 * Set a display name for the current session.
	 */
	setSessionName(name: string): void {
		this._nav.runImmediateSessionOperation(() => this.sessionManager.appendSessionInfo(name));
	}

	/**
	 * Create a fork from a specific entry.
	 * @returns selectedText (for editor pre-fill) and cancelled (true if an extension cancelled).
	 */
	async fork(entryId: string): Promise<{ selectedText: string; cancelled: boolean }> {
		return this._nav.fork(entryId);
	}

	// =========================================================================
	// Tree Navigation
	// =========================================================================

	/** Navigate to a different node in the session tree (stays in the same file). */
	async navigateTree(
		targetId: string,
		options: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string } = {},
	): Promise<{ editorText?: string; cancelled: boolean; aborted?: boolean; summaryEntry?: BranchSummaryEntry }> {
		return this._nav.navigateTree(targetId, options);
	}

	/**
	 * Switch to another branch tip under the same session file (view sibling paths).
	 * Does not put text in the editor.
	 */
	switchBranch(targetId: string): { leafId: string } {
		return this._nav.runImmediateSessionOperation(() => this._nav.switchBranch(targetId));
	}

	/** Append a branch summary and synchronize the active Agent history. */
	appendBranchSummary(
		parentId: string | null,
		summary: string,
		details?: unknown,
		fromHook?: boolean,
	): { entryId: string } {
		return this._nav.runImmediateSessionOperation(() => {
			const entryId = this.sessionManager.branchWithSummary(parentId, summary, details, fromHook);
			this.agent.replaceMessages(this.sessionManager.buildSessionContext().messages);
			return { entryId };
		});
	}

	/** Permanently delete one message while preserving and reparenting its descendants. */
	deleteMessage(entryId: string): { leafId: string | null } {
		return this._nav.runImmediateSessionOperation(() => {
			const result = this.sessionManager.deleteMessage(entryId);
			this.agent.replaceMessages(this.sessionManager.buildSessionContext().messages);
			return result;
		});
	}

	/** Replace the last user message and synchronize the active Agent history. */
	replaceLastUserMessage(entryId: string): { leafId: string | null } {
		return this._nav.runImmediateSessionOperation(() => {
			const result = this.sessionManager.replaceLastUserMessage(entryId);
			this.agent.replaceMessages(this.sessionManager.buildSessionContext().messages);
			return result;
		});
	}

	/**
	 * Export a fork as a new session file without leaving the current session.
	 * History is copied up to the parent of the selected user message.
	 */
	exportForkToNewFile(entryId: string): { path: string; text: string } {
		return this._nav.runImmediateSessionOperation(() => this._nav.exportForkToNewFile(entryId));
	}

	/** Get all user messages from session for fork selector. */
	getUserMessagesForForking(): Array<{ entryId: string; text: string }> {
		return this._nav.getUserMessagesForForking();
	}

	/**
	 * Get session statistics.
	 */
	getSessionStats(): SessionStats {
		return computeSessionStats({
			messages: this.state.messages,
			sessionFile: this.sessionFile,
			sessionId: this.sessionId,
		});
	}

	getContextUsage(): ContextUsage | undefined {
		return computeContextUsage({
			model: this.model,
			messages: this.messages,
			sessionManager: this.sessionManager,
		});
	}

	/**
	 * Export session to HTML.
	 * @param outputPath Optional output path (defaults to session directory)
	 * @returns Path to exported file
	 */
	async exportToHtml(outputPath?: string): Promise<string> {
		const themeName = this.settingsManager.getTheme();

		// Create tool renderer if we have an extension runner (for custom tool HTML rendering)
		let toolRenderer: ToolHtmlRenderer | undefined;
		const exportRunner = this._runtime.extensionRunner;
		if (exportRunner) {
			toolRenderer = createToolHtmlRenderer({
				getToolDefinition: (name) => exportRunner.getToolDefinition(name),
				theme,
			});
		}

		return await exportSessionToHtml(this.sessionManager, this.state, {
			outputPath,
			themeName,
			toolRenderer,
		});
	}

	// =========================================================================
	// Utilities
	// =========================================================================

	/**
	 * Get text content of last assistant message.
	 * Useful for /copy command.
	 * @returns Text content, or undefined if no assistant message exists
	 */
	getLastAssistantText(): string | undefined {
		return readLastAssistantText(this.messages);
	}

	// =========================================================================
	// Extension System
	// =========================================================================

	hasExtensionHandlers(eventType: string): boolean {
		return this._runtime.hasExtensionHandlers(eventType);
	}

	get extensionRunner(): ExtensionRunner | undefined {
		return this._runtime.extensionRunner;
	}
}

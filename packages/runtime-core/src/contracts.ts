import type { ThinkingLevel, ToolPhase } from "@vetta/agent-core";
import type { Message, Model } from "@vetta/ai";
import type { ConversationScenario } from "@vetta/coding-agent";

export type RuntimeEventSource = "runtime-core" | "agent" | "tool" | "mcp";

export type SystemPromptBlockType =
	| "subconscious"
	| "base"
	| "tools"
	| "mcp"
	| "guidelines"
	| "append"
	| "context"
	| "memory"
	| "skills"
	| "personalization"
	| "footer"
	| "plugin";

export interface SystemPromptBlock {
	id: string;
	type: SystemPromptBlockType;
	source: {
		kind: "core" | "plugin";
		pluginId?: string;
	};
	content: string;
	priority: number;
	enabled: boolean;
}

export type SystemPromptBlockPatch = Partial<Omit<SystemPromptBlock, "id">>;

export type SystemPromptOperation =
	| { type: "addBlock"; block: SystemPromptBlock }
	| { type: "replaceBlock"; blockId: string; block: SystemPromptBlock }
	| { type: "updateBlock"; blockId: string; patch: SystemPromptBlockPatch }
	| { type: "removeBlock"; blockId: string }
	| { type: "setBlockEnabled"; blockId: string; enabled: boolean };

export interface SystemPromptContribution {
	pluginId: string;
	operations: SystemPromptOperation[];
}

export interface SkillPathContribution {
	pluginId: string;
	paths: string[];
}

export interface ToolPolicyContribution {
	pluginId: string;
	allow?: string[];
	deny?: string[];
}

export type JsonSchema = Record<string, unknown>;

export interface AgentPluginToolContribution {
	pluginId: string;
	id: string;
	name: string;
	label?: string;
	description: string;
	parameters: JsonSchema;
	handlerId: string;
	timeoutMs?: number;
	/** 允许出现的对话场景 slug（fail-closed：缺省/空 = 所有场景都不激活）。由插件 registerTool 声明。 */
	scope_use?: string[];
	/** 需要的会话能力 slug（如 "knowledge"）。 */
	requires?: string[];
	context?: { conversation?: "summary" | "messages" };
}

export interface AgentPluginStateContribution {
	pluginId: string;
	id: string;
	schema?: JsonSchema;
	initialValue?: unknown;
	persist?: boolean;
}

export interface AgentPluginContinuationContribution {
	pluginId: string;
	id: string;
	handlerId: string;
	timeoutMs?: number;
	context?: { conversation?: "summary" | "messages" };
}

export interface AgentPluginSystemPromptProviderContribution {
	pluginId: string;
	id: string;
	handlerId: string;
	timeoutMs?: number;
	context?: {
		systemPrompt?: "none" | "blocks" | "rendered" | "full";
		conversation?: "summary" | "messages";
	};
}

export interface AgentPluginSystemPromptMessage {
	role: string;
	text: string;
	timestamp?: number;
	toolName?: string;
}

export interface AgentPluginSystemPromptInvocation {
	pluginId: string;
	providerId: string;
	handlerId: string;
	session: { id: string; cwd: string; scenario: string };
	model: {
		provider: string;
		id: string;
		api: string;
		input: string[];
		contextWindow?: number;
		maxTokens?: number;
	};
	conversation: { messages: AgentPluginSystemPromptMessage[]; messageCount: number };
	runtime: { activeToolNames: string[]; availableToolNames: string[]; runIndex: number };
	trigger: { kind: "agent-run"; timestamp: number };
	systemPrompt?: {
		base: { blocks?: SystemPromptBlock[]; rendered?: string };
		current: { blocks?: SystemPromptBlock[]; rendered?: string };
	};
}

export type AgentPluginRuntimeEffect =
	| SystemPromptOperation
	| { type: "setToolEnabled"; toolName: string; enabled: boolean }
	| { type: "requestContinuation"; result: AgentPluginContinuationResult };

export interface AgentPluginHandlerResult<T> {
	value: T;
	effects: AgentPluginRuntimeEffect[];
}

export type AgentPluginSystemPromptInvoker = (
	invocation: AgentPluginSystemPromptInvocation,
	signal?: AbortSignal,
) => Promise<AgentPluginRuntimeEffect[]>;

export interface AgentPluginRuntimeConfig {
	systemPromptContributions?: SystemPromptContribution[];
	skillPathContributions?: SkillPathContribution[];
	toolPolicyContributions?: ToolPolicyContribution[];
	toolContributions?: AgentPluginToolContribution[];
	stateContributions?: AgentPluginStateContribution[];
	continuationContributions?: AgentPluginContinuationContribution[];
	systemPromptProviderContributions?: AgentPluginSystemPromptProviderContribution[];
}

export interface AgentPluginToolInvocation {
	pluginId: string;
	toolId: string;
	toolName: string;
	handlerId: string;
	input: unknown;
	session: AgentPluginSystemPromptInvocation["session"];
	model: AgentPluginSystemPromptInvocation["model"];
	conversation: AgentPluginSystemPromptInvocation["conversation"];
	runtime: AgentPluginSystemPromptInvocation["runtime"];
	trigger: { kind: "tool-call"; timestamp: number; toolCallId: string };
}

export type AgentPluginToolInvoker = (
	invocation: AgentPluginToolInvocation,
	signal?: AbortSignal,
) => Promise<AgentPluginHandlerResult<unknown>>;

export interface AgentPluginContinuationInvocation {
	pluginId: string;
	providerId: string;
	handlerId: string;
	session: AgentPluginSystemPromptInvocation["session"];
	model: AgentPluginSystemPromptInvocation["model"];
	conversation: AgentPluginSystemPromptInvocation["conversation"];
	runtime: AgentPluginSystemPromptInvocation["runtime"];
	trigger: { kind: "continuation"; timestamp: number };
}

export interface AgentPluginContinuationResult {
	text: string;
	idempotencyKey?: string;
}

export type AgentPluginContinuationInvoker = (
	invocation: AgentPluginContinuationInvocation,
	signal?: AbortSignal,
) => Promise<AgentPluginHandlerResult<AgentPluginContinuationResult | null>>;

export interface SessionEventBase {
	schemaVersion: 1;
	sessionId: string;
	eventId: string;
	timestamp: number;
	source: RuntimeEventSource;
}

export interface SessionLifecycleEvent extends SessionEventBase {
	type: "session.lifecycle";
	phase: "created" | "agent_start" | "turn_start" | "turn_end" | "agent_end" | "aborted";
}

export interface MessageDeltaEvent extends SessionEventBase {
	type: "message.delta";
	delta: string;
}

export interface ThinkingDeltaEvent extends SessionEventBase {
	type: "thinking.delta";
	delta: string;
}

export interface MessageFinalEvent extends SessionEventBase {
	type: "message.final";
	message: Message;
}

export interface ToolCallGeneratingEvent extends SessionEventBase {
	type: "toolcall.start";
	toolCallId: string;
	toolName: string;
}

export interface ToolStartEvent extends SessionEventBase {
	type: "tool.start";
	toolCallId: string;
	toolName: string;
	args: unknown;
	/** Absolute timestamp (ms) when the tool began executing. */
	startedAt: number;
}

export interface ToolUpdateEvent extends SessionEventBase {
	type: "tool.update";
	toolCallId: string;
	toolName: string;
	partialResult: unknown;
}

/**
 * Emitted when a tool reports a phase boundary via ctx.phase(label) during
 * execution. Out-of-band metadata — UI-only, never sent to LLMs.
 */
export interface ToolPhaseEvent extends SessionEventBase {
	type: "tool.phase";
	toolCallId: string;
	toolName: string;
	label: string;
	/** Offset (ms) from the tool's startedAt. */
	atMs: number;
}

export interface ToolEndEvent extends SessionEventBase {
	type: "tool.end";
	toolCallId: string;
	toolName: string;
	isError: boolean;
	result: unknown;
	/** Absolute timestamp (ms) when the tool began executing. */
	startedAt: number;
	/** Total execution duration in milliseconds. */
	durationMs: number;
	/** Phases reported by the tool via ctx.phase(label) — possibly empty. */
	phases: ToolPhase[];
}

export interface McpStatusEvent extends SessionEventBase {
	type: "mcp.status";
	status: "connected" | "degraded" | "disconnected";
	details?: string;
}

/**
 * MCP 懒重载启动：用户提交 prompt 时检测到 mcp.json 变化，开始 diff-reload。
 * UI 可据此显示一个轻提示，不应阻塞用户。
 */
export interface McpReloadStartEvent extends SessionEventBase {
	type: "mcp.reload.start";
}

/**
 * MCP 懒重载结束。changed=false 表示真正的工具集合没变（少见，比如 stop/start
 * 后服务器输出相同 tools），UI 一般什么都不用显示；errorMessage 仅在异常时存在。
 */
export interface McpReloadEndEvent extends SessionEventBase {
	type: "mcp.reload.end";
	changed: boolean;
	errorMessage?: string;
}

export interface UsageUpdateEvent extends SessionEventBase {
	type: "usage.update";
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
	/** Context window usage percentage (0-100), or null if unknown (e.g. after compaction) */
	contextPercent: number | null;
	/** Total context window size in tokens */
	contextWindow: number;
}

export interface SessionError {
	code: string;
	message: string;
	retryable: boolean;
	origin: "runtime" | "provider" | "tool" | "mcp";
	details?: unknown;
}

export interface ErrorEvent extends SessionEventBase {
	type: "error";
	error: SessionError;
}

export interface TodoItem {
	id: number;
	content: string;
	status: "pending" | "in_progress" | "done";
}

export interface TodoUpdateEvent extends SessionEventBase {
	type: "todo_update";
	items: TodoItem[];
}

/** 后台 bash 任务（run_in_background）的可序列化状态，随事件全量推送。 */
export interface BackgroundTaskInfo {
	id: string;
	command: string;
	cwd: string;
	status: "running" | "completed" | "failed" | "killed";
	outputFile: string;
	exitCode: number | undefined;
	startedAt: number;
	endedAt?: number;
	toolCallId?: string;
	/** 输出尾部（约 2KB），用于 UI 实时滚动显示。 */
	tail: string;
}

export interface BackgroundTasksUpdateEvent extends SessionEventBase {
	type: "background_tasks_update";
	tasks: BackgroundTaskInfo[];
}

export interface CompactionStartEvent extends SessionEventBase {
	type: "compaction.start";
	reason: "threshold" | "overflow";
}

export interface CompactionEndEvent extends SessionEventBase {
	type: "compaction.end";
	success: boolean;
	errorMessage?: string;
}

export interface RuntimeUserConfirmationRequest {
	requestId: string;
	sessionId: string;
	title: string;
	message: string;
}

export interface RuntimeQuestionOption {
	label: string;
	description: string;
	badges?: string[];
}

export interface RuntimeQuestionItem {
	question: string;
	header: string;
	options: RuntimeQuestionOption[];
	multiSelect?: boolean;
}

export interface RuntimeUserQuestionRequest {
	requestId: string;
	sessionId: string;
	questions: RuntimeQuestionItem[];
}

export interface RuntimeUserQuestionAnswer {
	question: string;
	answers: string[];
}

export interface RuntimeUserQuestionResult {
	cancelled: boolean;
	answers: RuntimeUserQuestionAnswer[];
}

export type RuntimeSandboxGrantDecision = "deny" | "allow_once" | "allow_session";

export interface RuntimeSandboxGrantRequest {
	requestId: string;
	sessionId: string;
	title: string;
	message: string;
	toolName: string;
	capability: "file.read" | "file.write" | "network";
	target: string;
	resolvedTarget: string;
	grantRoot?: string;
	command?: string;
	/** True when the request involves a sensitive deny-root (e.g. ~/.ssh) — UI must hide the "allow for session" choice. */
	sensitive: boolean;
}

export interface RuntimeSandboxGrantInfo {
	id: string;
	sessionId: string;
	toolName: string;
	capability: "file.read" | "file.write" | "network";
	grantRoot: string;
	firstTarget: string;
	createdAt: number;
}

export type SessionEvent =
	| SessionLifecycleEvent
	| MessageDeltaEvent
	| ThinkingDeltaEvent
	| MessageFinalEvent
	| ToolCallGeneratingEvent
	| ToolStartEvent
	| ToolUpdateEvent
	| ToolPhaseEvent
	| ToolEndEvent
	| McpStatusEvent
	| McpReloadStartEvent
	| McpReloadEndEvent
	| UsageUpdateEvent
	| ErrorEvent
	| TodoUpdateEvent
	| BackgroundTasksUpdateEvent
	| CompactionStartEvent
	| CompactionEndEvent;

export interface SessionStateSnapshot {
	sessionId: string;
	model?: Model<any>;
	thinkingLevel: ThinkingLevel;
	executionMode: SessionExecutionMode;
	isStreaming: boolean;
	/** Timestamp (ms) for the current agent_start, if this session is streaming. */
	currentTurnStartedAt?: number;
	messageCount: number;
	/** Context window usage percentage (0-100), or null if unknown */
	contextPercent: number | null;
	/** Total context window size in tokens */
	contextWindow: number;
	/** 当前激活（模型可见）的工具名集合。renderer 据此让输入栏 badge 跟随工具 scope。 */
	activeToolNames: string[];
	/**
	 * 本会话的对话场景。renderer 据此让会话页插槽（活动面板插件标签卡 / 输入栏插件 toggle）
	 * 按对话类型显隐——与工具 scope_use 同一套场景轴。缺省（未显式传入）时为
	 * coding-agent 的 DEFAULT_SCENARIO（"cli"）。
	 */
	scenario: ConversationScenario;
}

export interface ProjectInfo {
	cwd: string;
	sessionCount: number;
}

export interface SessionHistoryInfo {
	id: string;
	path: string;
	cwd: string;
	name?: string;
	firstMessage: string;
	modifiedAt: number;
	/** Trimmed preview (~120 chars) of the most recent user/assistant message text. */
	lastMessagePreview?: string;
}

export type SessionExecutionMode = "sandbox" | "full-access";

export interface SessionConfig {
	cwd?: string;
	agentDir?: string;
	sessionPath?: string;
	sessionDir?: string;
	model?: Model<any>;
	thinkingLevel?: ThinkingLevel;
	executionMode?: SessionExecutionMode;
	/**
	 * 对话场景：决定按 scope_use 激活哪些工具（隔离的唯一轴）。不传则用 coding-agent 的
	 * DEFAULT_SCENARIO("cli")。desktop 各入口（普通对话/项目/批量/自动化）显式传入。
	 */
	scenario?: ConversationScenario;
	/** 追加到 system prompt 末尾的文本，不会被上下文压缩 */
	appendSystemPrompt?: string;
	/**
	 * 注入到 bash/shell 工具子进程的环境变量覆盖层（如 TMPDIR/TEMP/TMP）。
	 * 仅对该 session 内的命令执行生效；不传则行为等同旧版。
	 */
	env?: Record<string, string>;
	/**
	 * 是否允许该 session 注册 ask_user_question 工具。
	 * 宿主仍可通过 setUserQuestionHandler 动态启停实际能力。
	 */
	askUserQuestion?: boolean;
	/**
	 * 是否启用后台 bash 任务（run_in_background）。默认 true。
	 * 按 session 生命周期编排执行的宿主场景（如批量任务）应置 false，
	 * 避免 agent 提前结束而进程仍在跑、完成通知凭空唤醒新 turn 干扰队列判定。
	 */
	enableBackgroundTasks?: boolean;
	/**
	 * 是否发现通用 Agent Skill 目录（`~/.agents/skills`、`<cwd>/.agents/skills`）。默认 true。
	 * desktop「适配通用 Agent Skill」开关关闭时置 false。
	 */
	includeAgentSkills?: boolean;
	/** Whether this session should receive Desktop plugin agent contributions on live plugin changes. */
	enableAgentPlugins?: boolean;
	/** Runtime plugin contributions applied while building agent prompts/resources. */
	agentPlugins?: AgentPluginRuntimeConfig;
}

export interface PromptRequest {
	text: string;
	images?: Array<{ type: "image"; data: string; mimeType: string }>;
	streamingBehavior?: "steer" | "followUp";
	/** Model key in "provider/modelId" format — ensures the prompt uses exactly this model */
	modelKey?: string;
	/**
	 * Per-turn metadata bag carried alongside the prompt. Not sent to the model
	 * as content; consumed host-side / by tools to gate turn behavior (e.g.
	 * `{ imageMode: true }` set by a plugin input action to route this turn to
	 * image generation). Opaque to the runtime — pass-through only.
	 */
	metadata?: Record<string, unknown>;
}

export interface SettingsPatch {
	thinkingLevel?: ThinkingLevel;
	steeringMode?: "all" | "one-at-a-time";
	followUpMode?: "all" | "one-at-a-time";
	/** Model key in "provider/modelId" format */
	modelKey?: string;
}

export interface AssistantTurnTiming {
	startedAt: number;
	endedAt: number;
	durationMs: number;
}

/**
 * A history entry for UI display. Includes messages AND compaction boundaries.
 * The UI uses this to render complete conversation history (even after compaction).
 */
export type HistoryEntry =
	| { type: "message"; message: Message }
	| { type: "compaction"; summary: string; tokensBefore: number; timestamp: string }
	| { type: "assistant_turn_timing"; timing: AssistantTurnTiming; timestamp: string }
	| {
			type: "tool_timing";
			toolCallId: string;
			toolName: string;
			startedAt: number;
			durationMs: number;
			phases: ToolPhase[];
			timestamp: string;
	  };

export interface SessionFacade {
	setUserConfirmationHandler(
		handler: ((request: RuntimeUserConfirmationRequest, signal?: AbortSignal) => Promise<boolean>) | undefined,
	): void;
	setUserQuestionHandler(
		handler:
			| ((request: RuntimeUserQuestionRequest, signal?: AbortSignal) => Promise<RuntimeUserQuestionResult>)
			| undefined,
	): void;
	setUserSandboxGrantHandler(
		handler:
			| ((request: RuntimeSandboxGrantRequest, signal?: AbortSignal) => Promise<RuntimeSandboxGrantDecision>)
			| undefined,
	): void;
	setPluginToolInvoker(handler: AgentPluginToolInvoker | undefined): void;
	setPluginContinuationInvoker(handler: AgentPluginContinuationInvoker | undefined): void;
	setPluginSystemPromptInvoker(handler: AgentPluginSystemPromptInvoker | undefined): void;
	reconfigureAgentPlugins(agentPlugins: AgentPluginRuntimeConfig | undefined): void;
	listSandboxGrants(sessionId: string): RuntimeSandboxGrantInfo[];
	revokeSandboxGrant(sessionId: string, grantId: string): boolean;
	revokeAllSandboxGrants(sessionId: string): number;
	createSession(config?: SessionConfig): Promise<{ sessionId: string }>;
	setExecutionMode(sessionId: string, mode: SessionExecutionMode): Promise<void>;
	setGlobalExecutionMode(mode: SessionExecutionMode): Promise<void>;
	prompt(sessionId: string, request: PromptRequest): Promise<void>;
	continue(sessionId: string): Promise<void>;
	abort(sessionId: string): Promise<void>;
	subscribe(sessionId: string, handler: (event: SessionEvent) => void): () => void;
	updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void>;
	/** Update thinking level for ALL open sessions at once. */
	updateGlobalThinkingLevel(level: ThinkingLevel): void;
	getState(sessionId: string): SessionStateSnapshot;
	getMessages(sessionId: string): Message[];
	/** Full conversation history including compaction boundaries (for UI display). */
	getFullHistory(sessionId: string): HistoryEntry[];
	/**
	 * Read a session .jsonl directly from disk and translate to
	 * HistoryEntry[] without acquiring the session-file lock. Used by the
	 * desktop sidebar's read-only viewer for sessions written by other
	 * processes (e.g. IM gateway). The caller infers whether the session
	 * is IM-owned from the path (it lives under the IM conversation cwd).
	 */
	readSessionHistoryFromFile(path: string): { history: HistoryEntry[] };
	listProjects(): Promise<ProjectInfo[]>;
	listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]>;
	deleteSession(sessionPath: string): Promise<void>;
	renameSession(sessionPath: string, name: string): Promise<void>;
	getSessionPath(sessionId: string): string | undefined;
	renameSessionById(sessionId: string, name: string): void;
	autoTitleSession(sessionId: string, userText: string, assistantText: string): Promise<string | null>;
	disposeSession(sessionId: string): Promise<void>;
	disposeAllSessions(): Promise<void>;
}

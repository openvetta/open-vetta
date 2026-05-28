import type { ThinkingLevel, ToolPhase } from "@mariozechner/pi-agent-core";
import type { Message, Model } from "@mariozechner/pi-ai";

export type RuntimeEventSource = "runtime-core" | "agent" | "tool" | "mcp";

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
	/**
	 * Entrypoint that created the session ("im" if originated from
	 * im-gateway, "desktop" or undefined for sessions created by
	 * desktop-app). Used by the sidebar to render an IM badge.
	 */
	origin?: "im" | "desktop";
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
	/** 追加到 system prompt 末尾的文本，不会被上下文压缩 */
	appendSystemPrompt?: string;
	/**
	 * 注入到 bash/shell 工具子进程的环境变量覆盖层（如 TMPDIR/TEMP/TMP）。
	 * 仅对该 session 内的命令执行生效；不传则行为等同旧版。
	 */
	env?: Record<string, string>;
}

export interface PromptRequest {
	text: string;
	images?: Array<{ type: "image"; data: string; mimeType: string }>;
	streamingBehavior?: "steer" | "followUp";
	/** Model key in "provider/modelId" format — ensures the prompt uses exactly this model */
	modelKey?: string;
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
	setUserSandboxGrantHandler(
		handler:
			| ((request: RuntimeSandboxGrantRequest, signal?: AbortSignal) => Promise<RuntimeSandboxGrantDecision>)
			| undefined,
	): void;
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
	 * processes (e.g. IM gateway). Returns the SessionHeader.origin tag so
	 * the renderer can render an "IM" badge / disable inputs.
	 */
	readSessionHistoryFromFile(path: string): { history: HistoryEntry[]; origin?: "im" | "desktop" };
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

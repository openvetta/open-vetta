import type { Message } from "@mariozechner/pi-ai";
import type {
	HistoryEntry,
	ProjectInfo,
	PromptRequest,
	RuntimeSandboxGrantDecision,
	RuntimeSandboxGrantInfo,
	RuntimeSandboxGrantRequest,
	RuntimeUserConfirmationRequest,
	RuntimeUserQuestionRequest,
	RuntimeUserQuestionResult,
	SessionConfig,
	SessionEvent,
	SessionExecutionMode,
	SessionHistoryInfo,
	SessionStateSnapshot,
	SettingsPatch,
} from "../../../../runtime-core/src/index.js";

/** 个性化人设选项（由 coding-agent 注册表下发，不含提示词正文）。 */
export interface PersonaOption {
	id: string;
	label: string;
	description: string;
}

/** 个性化配置：选中的人设 id + 自定义指令文本。 */
export interface PersonalizationConfig {
	personaId: string;
	customPrompt: string;
}

export interface DesktopSessionApi {
	create(config?: SessionConfig): Promise<{ sessionId: string; cwd?: string }>;
	listProjects(): Promise<ProjectInfo[]>;
	listSessions(cwd: string): Promise<SessionHistoryInfo[]>;
	prompt(sessionId: string, request: PromptRequest): Promise<void>;
	continue(sessionId: string): Promise<void>;
	abort(sessionId: string): Promise<void>;
	/** 清空 session 的 todo 列表（被 scene 等 lock 时返回 false）。 */
	clearTodos(sessionId: string): Promise<boolean>;
	subscribe(sessionId: string, handler: (event: SessionEvent) => void): Promise<() => void>;
	onConfirmationRequest(handler: (request: RuntimeUserConfirmationRequest) => void): () => void;
	respondToConfirmation(requestId: string, confirmed: boolean): Promise<void>;
	/** ask_user_question：监听主进程发来的提问请求（携 sessionId + questions）。 */
	onQuestionRequest(handler: (request: RuntimeUserQuestionRequest) => void): () => void;
	/** 回传用户对某次提问的答案 / 取消。 */
	respondToQuestion(requestId: string, result: RuntimeUserQuestionResult): Promise<void>;
	/** 实验性开关切换：开 → 注入问答 handler（能力=注册），关 → 清除。 */
	setQuestionEnabled(enabled: boolean): Promise<void>;
	onSandboxGrantRequest(handler: (request: RuntimeSandboxGrantRequest) => void): () => void;
	respondToSandboxGrant(requestId: string, decision: RuntimeSandboxGrantDecision): Promise<void>;
	listSandboxGrants(sessionId: string): Promise<RuntimeSandboxGrantInfo[]>;
	revokeSandboxGrant(sessionId: string, grantId: string): Promise<boolean>;
	revokeAllSandboxGrants(sessionId: string): Promise<number>;
	getSessionPath(sessionId: string): Promise<string | undefined>;
	updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void>;
	setExecutionMode(sessionId: string, mode: SessionExecutionMode): Promise<void>;
	setGlobalExecutionMode(mode: SessionExecutionMode): Promise<void>;
	setGlobalThinkingLevel(level: string): Promise<void>;
	getGlobalThinkingLevel(): Promise<string>;
	setMaxRecentImages(count: number): Promise<void>;
	getMaxRecentImages(): Promise<number>;
	getPersonas(): Promise<PersonaOption[]>;
	getPersonalization(): Promise<PersonalizationConfig>;
	setPersonalization(input: PersonalizationConfig): Promise<void>;
	getState(sessionId: string): Promise<SessionStateSnapshot>;
	getMessages(sessionId: string): Promise<Message[]>;
	getFullHistory(sessionId: string): Promise<HistoryEntry[]>;
	delete(sessionPath: string): Promise<void>;
	rename(sessionPath: string, name: string): Promise<void>;
	autoTitle(sessionId: string, userText: string, assistantText: string): Promise<string | null>;
	dispose(sessionId: string): Promise<void>;
	/** Snapshot of session paths currently in the agent loop. */
	listRunning(): Promise<string[]>;
	/** Subscribe to running-set changes. Fires for each toggle (running=true|false). */
	onRunningChanged(handler: (payload: { sessionPath: string; running: boolean }) => void): () => void;
	/**
	 * 清空默认「对话」或 Claw 项目的全部会话（保留产物），按 scope 分流（物理 cwd 分家，ADR-0005）：
	 * - "conversation"：清桌面「对话」cwd 的 .vetta/sessions
	 * - "claw"：清 IM cwd 的 .vetta/sessions
	 * 主进程会先 dispose 本 scope 涉及的 session handle；若该 scope 仍有运行中的会话则抛错拒绝。
	 */
	clearDefaultConversation(scope: "conversation" | "claw"): Promise<void>;
	/**
	 * 清空默认「对话」或 Claw 项目 cwd 下的产物文件（保留 .vetta 目录，会话不受影响）。
	 */
	clearDefaultArtifacts(scope: "conversation" | "claw"): Promise<void>;
	/**
	 * Open a session for read-only viewing. Does NOT acquire the
	 * session-file lock, so IM-owned sessions (sidecar may be actively
	 * writing) can be viewed live without conflict.
	 */
	openViewer(path: string): Promise<{ history: HistoryEntry[] }>;
	/**
	 * Subscribe to live updates for a viewer-mode session. Handler fires
	 * whenever the underlying .jsonl is written. Returns an unsubscribe
	 * function — caller MUST call it on unmount to release the fs.watch.
	 */
	subscribeViewer(path: string, handler: (snapshot: { history: HistoryEntry[] }) => void): Promise<() => void>;
}

import type { CardDescriptor } from "@vetta/plugin-sdk";
import { atom } from "jotai";
import { runningSessionPathsAtom } from "./running-sessions-atoms";

// ─── Rich content blocks ───

export interface TextBlock {
	type: "text";
	/** Stable id for React keying — survives reorder of surrounding blocks. */
	id: string;
	text: string;
}

export interface ThinkingBlock {
	type: "thinking";
	/** Stable id for React keying. */
	id: string;
	text: string;
}

export interface ToolPhaseInfo {
	label: string;
	atMs: number;
}

export interface ToolImagePreview {
	data: string;
	mimeType: string;
	originalPath?: string;
	originalMimeType?: string;
	originalSizeBytes?: number;
	originalWidth?: number;
	originalHeight?: number;
	processedSizeBytes?: number;
	processedWidth?: number;
	processedHeight?: number;
	wasResized?: boolean;
}

export interface ToolCallUiDetails {
	/** Unified diff for UI rendering only. Never sent back to the model. */
	diff?: string;
	/** First changed line in the new file, for compact path display. */
	firstChangedLine?: number;
	/** ask_user_question 的用户作答结果，供 transcript 富视图回显（不回传模型）。 */
	askUserQuestion?: AskUserQuestionResolution;
	/** 知识库工具（kb_*）的结构化结果，供富视图渲染（不回传模型）。 */
	knowledge?: KnowledgeToolUiDetails;
}

/** 知识库工具结果的 UI 结构（来自工具的 details）。 */
export type KnowledgeToolUiDetails =
	| {
			kind: "filter";
			count: number;
			pages: Array<{ id: string; absolutePath: string; title: string; summary: string; tags: string[] }>;
	  }
	| { kind: "tags"; tags: Array<{ tag: string; count: number }> }
	| { kind: "write"; action: string; id: string; absolutePath: string; movedFrom?: string };

/** ask_user_question：单个选项。 */
export interface QuestionOption {
	label: string;
	description: string;
	badges?: string[];
}

/** ask_user_question：单个问题（问题组成员）。 */
export interface QuestionItem {
	question: string;
	header: string;
	options: QuestionOption[];
	multiSelect?: boolean;
}

/** ask_user_question：一次提问的用户作答（每题选中的标签 / 自由文本）。 */
export interface QuestionAnswer {
	question: string;
	answers: string[];
}

/** ask_user_question：作答结果（取消 or 各题答案）。 */
export interface AskUserQuestionResolution {
	cancelled: boolean;
	answers: QuestionAnswer[];
}

/** 一次待答的 ask_user_question 请求，绑定到发起它的 session。 */
export interface PendingQuestion {
	requestId: string;
	sessionId: string;
	questions: QuestionItem[];
}

export interface ToolCallBlock {
	type: "tool_call";
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	/** "pending" = waiting for result, "success" = completed, "error" = failed */
	status: "pending" | "success" | "error";
	result?: string;
	imagePreview?: ToolImagePreview;
	uiDetails?: ToolCallUiDetails;
	/**
	 * Settled card descriptors this tool produced (from the result's out-of-band
	 * `details.cards`). The per-message card host resolves each by `type` to a
	 * plugin card renderer. Never sent to the LLM.
	 */
	cards?: CardDescriptor[];
	isError?: boolean;
	/**
	 * Out-of-band timing metadata. Never sent to LLMs.
	 * - startedAt: absolute ms when execution began (from tool.start event)
	 * - durationMs: total execution time (from tool.end event or ToolTimingEntry)
	 * - phases: tool-reported phase boundaries; each phase ends when the next
	 *   one starts (or when execution ends)
	 * - currentPhase: only set while status === "pending" — the most recent
	 *   tool.phase event's label, for live display.
	 */
	startedAt?: number;
	durationMs?: number;
	phases?: ToolPhaseInfo[];
	currentPhase?: string;
}

export interface ToolResultBlock {
	type: "tool_result";
	toolCallId: string;
	toolName: string;
	content: string;
	isError: boolean;
}

export interface ErrorBlock {
	type: "error";
	/** Stable id for React keying. */
	id: string;
	text: string;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock | ToolResultBlock | ErrorBlock;

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "compaction";
	/** Plain text for user messages; for assistant messages this is the concatenated text blocks */
	text: string;
	/** Rich content blocks for assistant messages */
	blocks?: ContentBlock[];
	/** Attached images for user messages */
	images?: Array<{ data: string; mimeType: string; name: string }>;
	/** Timestamp when the message was created (Date.now()) */
	timestamp?: number;
	/** Timestamp when this assistant turn started (agent_start) */
	startedAt?: number;
	/** Timestamp when this assistant turn ended (agent_end/aborted) */
	endedAt?: number;
	/** Total duration of this assistant turn in seconds (agent_start → agent_end) */
	durationSeconds?: number;
}

export interface ActiveSession {
	cwd: string;
	sessionPath: string;
	runtimeId: string;
}

export interface LastActiveSession {
	cwd: string;
	sessionPath: string;
}

export type SessionExecutionMode = "sandbox" | "full-access";
export type ExecutionModeOverride = "inherit" | SessionExecutionMode;

// ─── Attached images ───

export interface AttachedImage {
	/** Unique ID for React key */
	id: string;
	/** Base64-encoded image data (no data URI prefix) */
	data: string;
	/** MIME type, e.g. "image/png" */
	mimeType: string;
	/** Display name (file name or "Pasted image") */
	name: string;
}

// ─── Usage tracking ───

export interface TurnUsageData {
	/** Output speed: tokens per second */
	outputSpeed: number;
	/** Duration of this turn in seconds */
	durationSeconds: number;
}

export interface ContextUsageData {
	/** Context usage percentage (0-100), or null if unknown */
	percent: number | null;
	/** Context window size in tokens */
	contextWindow: number;
}

// ─── Slash panel (skill/scene selection) ───

export interface SelectedSkill {
	name: string;
	alias?: string;
	type: "skill" | "scene";
}

// ─── Mentioned files (@file selection) ───

export interface MentionedFile {
	/** Absolute path */
	path: string;
	/** Display name (file or dir name) */
	name: string;
	isDirectory: boolean;
}

export const chatMessagesAtom = atom<ChatMessage[]>([]);

export const inputValueAtom = atom<string>("");
export const attachedImagesAtom = atom<AttachedImage[]>([]);
export const activeSessionAtom = atom<ActiveSession | null>(null);

const LAST_ACTIVE_SESSION_STORAGE_KEY = "vetta-last-active-session";

function readLastActiveSession(): LastActiveSession | null {
	try {
		const raw = localStorage.getItem(LAST_ACTIVE_SESSION_STORAGE_KEY);
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<LastActiveSession>;
		if (typeof value.cwd !== "string" || !value.cwd || typeof value.sessionPath !== "string" || !value.sessionPath) {
			localStorage.removeItem(LAST_ACTIVE_SESSION_STORAGE_KEY);
			return null;
		}
		return { cwd: value.cwd, sessionPath: value.sessionPath };
	} catch {
		localStorage.removeItem(LAST_ACTIVE_SESSION_STORAGE_KEY);
		return null;
	}
}

const lastActiveSessionStorageAtom = atom<LastActiveSession | null>(readLastActiveSession());

/**
 * 可跨 renderer 刷新恢复的会话定位信息。
 * runtimeId 仅在当前进程有效，因此这里只持久化可交给 session.create 重新打开的 cwd + sessionPath。
 */
export const lastActiveSessionAtom = atom(
	(get) => get(lastActiveSessionStorageAtom),
	(_get, set, value: LastActiveSession | null) => {
		set(lastActiveSessionStorageAtom, value);
		if (value) {
			localStorage.setItem(LAST_ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(value));
		} else {
			localStorage.removeItem(LAST_ACTIVE_SESSION_STORAGE_KEY);
		}
	},
);

/**
 * 「当前 active session 正在 streaming」的本地直读信号。
 *
 * 由 useSessionManager 的 IPC subscribe 在收到 agent_start/agent_end 时写入。
 * 它能 cover 一个场景：brand-new session 创建后第一次 streaming —— 此时
 * activeSession.sessionPath 可能还没解析完，runningSessionPathsAtom 也尚未
 * 同步到当前会话，但 in-renderer subscribe 已经能直接听到 agent_start。
 *
 * 切走会话再切回的丢失场景由 runningSessionPathsAtom 兜底（main 进程全局广播，
 * 不依赖单一 subscribe 的存活）。两路 OR 起来即可。
 */
export const activeSessionStreamingAtom = atom<boolean>(false);

/**
 * 当前 active session 是否处于 streaming（agent_start..agent_end）。
 * = 本地信号 OR (runningSessionPathsAtom 中存在当前 sessionPath)
 */
export const isStreamingAtom = atom<boolean>((get) => {
	// 没有 activeSession 时一律视为非 streaming，避免上一个会话残留的
	// activeSessionStreamingAtom=true 信号污染 NewSessionPage 等无会话场景。
	const active = get(activeSessionAtom);
	if (!active) return false;
	if (get(activeSessionStreamingAtom)) return true;
	if (!active.sessionPath) return false;
	return get(runningSessionPathsAtom).has(active.sessionPath);
});
function getStoredExecutionMode(): SessionExecutionMode {
	return localStorage.getItem("vetta-session-execution-mode") === "sandbox" ? "sandbox" : "full-access";
}

export const sessionExecutionModeAtom = atom<SessionExecutionMode>(getStoredExecutionMode());

/** Per-turn stats (speed, duration) for the last completed turn */
export const lastTurnUsageAtom = atom<TurnUsageData | null>(null);

/** Current context window usage */
export const contextUsageAtom = atom<ContextUsageData | null>(null);

/** Whether context compaction is currently in progress */
export const isCompactingAtom = atom<boolean>(false);

/** 当前 session 是否正在懒重载 MCP 配置（用户发 prompt 后 ~1-3s）。
 * 仅由 mcp.reload.start/end 驱动；UI 用一条非阻塞的小提示告知用户。 */
export const isReloadingMcpAtom = atom<boolean>(false);

/**
 * 待答的 ask_user_question 请求，按发起 session 的 runtimeId 索引。
 * InputBar 据此把对应 session 的输入栏接管为「问答面板」；切换 session 只是隐藏，
 * 切回恢复（该 session 的 agent 仍阻塞等回答）。提交/取消后由面板删除对应项。
 */
export const pendingQuestionsAtom = atom<Record<string, PendingQuestion>>({});

/**
 * 输入预测建议，按发起会话的 runtimeId 索引（仿 pendingQuestionsAtom 的 Record 形态）。
 * agent 一轮正常完成后异步生成 0-3 条；该会话发出下一个 prompt 即清空。切会话只是
 * 隐藏、切回恢复；纯内存态，不持久化。首条同时作为 InputBar placeholder。
 */
export const promptSuggestionsAtom = atom<Record<string, string[]>>({});

/**
 * 输入预测「生成中」状态，按会话 runtimeId 索引。生成调用在飞时为 true，
 * 用于在该会话末条 assistant 消息的操作栏右侧显示「Vetta 正在预测…」闪光提示。
 */
export const promptPredictingAtom = atom<Record<string, boolean>>({});

/** Selected model identifier: "provider/modelId" */
export const selectedModelAtom = atom<string | null>(localStorage.getItem("vetta-selected-model"));

/**
 * Per-model reasoning level memory: maps modelKey ("provider/modelId") → chosen level value.
 * Persisted to localStorage so each model remembers its last-chosen level across sessions/restart.
 */
const REASONING_BY_MODEL_KEY = "vetta-reasoning-by-model";
function loadReasoningByModel(): Record<string, string> {
	try {
		const raw = localStorage.getItem(REASONING_BY_MODEL_KEY);
		return raw ? (JSON.parse(raw) as Record<string, string>) : {};
	} catch {
		return {};
	}
}
const reasoningByModelBaseAtom = atom<Record<string, string>>(loadReasoningByModel());
export const reasoningByModelAtom = atom(
	(get) => get(reasoningByModelBaseAtom),
	(_get, set, next: Record<string, string>) => {
		set(reasoningByModelBaseAtom, next);
		try {
			localStorage.setItem(REASONING_BY_MODEL_KEY, JSON.stringify(next));
		} catch {
			// ignore persistence errors (private mode / quota)
		}
	},
);

/** Whether the current session model supports image input */
export const modelSupportsImagesAtom = atom<boolean>(true);

export const selectedSkillAtom = atom<SelectedSkill | null>(null);
export const mentionedFilesAtom = atom<MentionedFile[]>([]);

// ─── Action button bar ───

export interface ActionButtonDef {
	/** Unique identifier */
	id: string;
	/** Display label */
	label: string;
	/** MDI icon class name, e.g. "icon-[mdi--swap-horizontal]" */
	icon?: string;
	/** Sort weight — lower values appear first (default 0) */
	order?: number;
}

/** Registered button definitions */
export const actionButtonDefsAtom = atom<ActionButtonDef[]>([]);

/** Set of hidden button ids for visibility control */
export const hiddenActionButtonsAtom = atom<Set<string>>(new Set<string>());

/** Derived: visible buttons sorted by order */
export const visibleActionButtonsAtom = atom((get) => {
	const defs = get(actionButtonDefsAtom);
	const hidden = get(hiddenActionButtonsAtom);
	return defs.filter((d) => !hidden.has(d.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

/** Registry mapping button id → click handler */
export const actionButtonHandlersAtom = atom<Map<string, () => void>>(new Map());

/** Global callback to open a session (set by useSessionManager, consumed by other pages) */
// Use a module-level ref instead of atom to avoid structured clone issues with functions
export const openSessionFnRef: {
	current: ((cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>) | null;
} = {
	current: null,
};

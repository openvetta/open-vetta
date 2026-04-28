import { atom } from "jotai";

// ─── Rich content blocks ───

export interface TextBlock {
	type: "text";
	text: string;
}

export interface ThinkingBlock {
	type: "thinking";
	text: string;
}

export interface ToolCallBlock {
	type: "tool_call";
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	/** "pending" = waiting for result, "success" = completed, "error" = failed */
	status: "pending" | "success" | "error";
	result?: string;
	isError?: boolean;
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

export type SessionExecutionMode = "sandbox" | "full-access";

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

/** Files modified/created during the last agent turn (set on agent_end, cleared on agent_start) */
export const turnModifiedFilesAtom = atom<string[]>([]);
export const isStreamingAtom = atom<boolean>(false);
export const inputValueAtom = atom<string>("");
export const attachedImagesAtom = atom<AttachedImage[]>([]);
export const activeSessionAtom = atom<ActiveSession | null>(null);
export const sessionExecutionModeAtom = atom<SessionExecutionMode>("sandbox");

/** Per-turn stats (speed, duration) for the last completed turn */
export const lastTurnUsageAtom = atom<TurnUsageData | null>(null);

/** Current context window usage */
export const contextUsageAtom = atom<ContextUsageData | null>(null);

/** Whether context compaction is currently in progress */
export const isCompactingAtom = atom<boolean>(false);

/** Selected model identifier: "provider/modelId" */
export const selectedModelAtom = atom<string | null>(localStorage.getItem("vetta-selected-model"));

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
export const hiddenActionButtonsAtom = atom<Set<string>>(new Set());

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
export const openSessionFnRef: { current: ((cwd: string, sessionPath?: string) => Promise<void>) | null } = {
	current: null,
};

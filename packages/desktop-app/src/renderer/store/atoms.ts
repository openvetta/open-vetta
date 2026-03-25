import { atom } from "jotai";

export interface Project {
	cwd: string;
	sessionCount: number;
}

export interface SessionInfo {
	id: string;
	path: string;
	cwd: string;
	name?: string;
	firstMessage: string;
	modifiedAt: number;
}

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

export type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock | ToolResultBlock;

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	/** Plain text for user messages; for assistant messages this is the concatenated text blocks */
	text: string;
	/** Rich content blocks for assistant messages */
	blocks?: ContentBlock[];
	/** Attached images for user messages */
	images?: Array<{ data: string; mimeType: string; name: string }>;
}

export interface ActiveSession {
	cwd: string;
	sessionPath: string;
	runtimeId: string;
}

export const projectsAtom = atom<Project[]>([]);
export const expandedProjectsAtom = atom<Set<string>>(new Set<string>());
export const sessionsMapAtom = atom<Map<string, SessionInfo[]>>(new Map<string, SessionInfo[]>());
export const activeSessionAtom = atom<ActiveSession | null>(null);
export const chatMessagesAtom = atom<ChatMessage[]>([]);
export const isStreamingAtom = atom<boolean>(false);
export const inputValueAtom = atom<string>("");

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

export const attachedImagesAtom = atom<AttachedImage[]>([]);

// ─── Usage tracking ───

export interface TurnUsageData {
	/** Output speed: tokens per second */
	outputSpeed: number;
	/** Duration of this turn in seconds */
	durationSeconds: number;
}

/** Per-turn stats (speed, duration) for the last completed turn */
export const lastTurnUsageAtom = atom<TurnUsageData | null>(null);

export interface ContextUsageData {
	/** Context usage percentage (0-100), or null if unknown */
	percent: number | null;
	/** Context window size in tokens */
	contextWindow: number;
}

/** Current context window usage */
export const contextUsageAtom = atom<ContextUsageData | null>(null);

// ─── Page navigation ───

export type PageView = "chat" | "automation" | "skills" | "settings";
export const pageViewAtom = atom<PageView>("chat");

// ─── Settings page ───

export type SettingsTab = "general" | "models" | "mcp" | "shortcuts" | "archive";
export const settingsTabAtom = atom<SettingsTab>("general");

// ─── Sidebar tab ───

export type SidebarTab = "projects" | "files";
export const sidebarTabAtom = atom<SidebarTab>("projects");

// ─── File tree state ───

export interface FsEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt: number;
}

export const fileTreeCacheAtom = atom<Map<string, FsEntry[]>>(new Map());
export const expandedDirsAtom = atom<Set<string>>(new Set());
export const selectedFilePathAtom = atom<string | null>(null);
export const activityPanelOpenAtom = atom<boolean>(false);
export const loadingDirsAtom = atom<Set<string>>(new Set());
export const fileContextMenuAtom = atom<{ x: number; y: number; entry: FsEntry } | null>(null);
export const renamingPathAtom = atom<string | null>(null);

// ─── Session context menu ───

export const sessionContextMenuAtom = atom<{ x: number; y: number; session: SessionInfo } | null>(null);
export const renamingSessionPathAtom = atom<string | null>(null);

// ─── Project context menu ───

export const projectContextMenuAtom = atom<{ x: number; y: number; project: Project } | null>(null);

// ─── Confirm dialog ───

export interface ConfirmDialogState {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "danger" | "default";
	onConfirm: () => void;
}

export const confirmDialogAtom = atom<ConfirmDialogState | null>(null);

// ─── Panel widths ───

export const sidebarWidthAtom = atom<number>(220);
export const activityPanelWidthAtom = atom<number>(360);

// ─── Workspace ───

const DEFAULT_WORKSPACE = "~/.vetta/workspace";
export const workspacePathAtom = atom<string>(localStorage.getItem("vetta-workspace-path") || DEFAULT_WORKSPACE);

// ─── Model selection ───

/** Selected model identifier: "provider/modelId" */
export const selectedModelAtom = atom<string | null>(localStorage.getItem("vetta-selected-model"));

/** Whether the current session model supports image input */
export const modelSupportsImagesAtom = atom<boolean>(true);

// ─── Theme ───

export type ThemeMode = "light" | "dark" | "auto";
export const themeModeAtom = atom<ThemeMode>((localStorage.getItem("vetta-theme") as ThemeMode) || "dark");
export const resolvedThemeAtom = atom<"light" | "dark">("dark");

// ─── Slash panel (skill/scene selection) ───

export interface SelectedSkill {
	name: string;
	type: "skill" | "scene";
}

export const selectedSkillAtom = atom<SelectedSkill | null>(null);

// ─── Mentioned files (@file selection) ───

export interface MentionedFile {
	/** Absolute path */
	path: string;
	/** Display name (file or dir name) */
	name: string;
	isDirectory: boolean;
}

export const mentionedFilesAtom = atom<MentionedFile[]>([]);

// ─── Auth ───

export interface AuthUser {
	id: number;
	username: string;
	phone?: string;
	email?: string;
	avatar: string;
}

export const authTokenAtom = atom<string | null>(localStorage.getItem("vetta-auth-token"));
export const authUserAtom = atom<AuthUser | null>(null);
export const loginDialogOpenAtom = atom<boolean>(false);

// ─── Scheduled Tasks ───

export interface ScheduledTask {
	id: string;
	name: string;
	prompt: string;
	cron: string;
	/** Whether this task runs only once and disables itself after execution */
	isOnce: boolean;
	enabled: boolean;
	modelId?: string;
	createdAt: number;
	updatedAt: number;
	lastRunAt: number | null;
	lastRunStatus: "success" | "failed" | null;
}

export interface TaskExecutionRecord {
	id: string;
	taskId: string;
	sessionId: string;
	startedAt: number;
	completedAt: number | null;
	status: "running" | "success" | "failed" | "aborted";
	prompt: string;
	responsePreview: string;
	error?: string;
	durationMs?: number;
}

export const scheduledTasksAtom = atom<ScheduledTask[]>([]);
export const selectedTaskIdAtom = atom<string | null>(null);
export const selectedRecordIdAtom = atom<string | null>(null);
export const formOpenAtom = atom<ScheduledTask | null | undefined>(undefined);

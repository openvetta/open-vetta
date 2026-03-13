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

// ─── Panel widths ───

export const sidebarWidthAtom = atom<number>(220);
export const activityPanelWidthAtom = atom<number>(360);

// ─── Theme ───

export type ThemeMode = "light" | "dark" | "auto";
export const themeModeAtom = atom<ThemeMode>((localStorage.getItem("vetta-theme") as ThemeMode) || "dark");
export const resolvedThemeAtom = atom<"light" | "dark">("dark");

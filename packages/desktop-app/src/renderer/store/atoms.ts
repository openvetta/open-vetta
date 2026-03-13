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

export type ThemeMode = "light" | "dark" | "auto";
export const themeModeAtom = atom<ThemeMode>((localStorage.getItem("vetta-theme") as ThemeMode) || "dark");
export const resolvedThemeAtom = atom<"light" | "dark">("dark");

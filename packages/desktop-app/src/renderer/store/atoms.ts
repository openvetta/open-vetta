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

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
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

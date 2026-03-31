import { atom } from "jotai";

export type ProjectType = "normal" | "flowing" | "schedule" | "batch";

export interface Project {
	cwd: string;
	name?: string;
	sessionCount: number;
	type: ProjectType;
}

export interface SessionInfo {
	id: string;
	path: string;
	cwd: string;
	name?: string;
	firstMessage: string;
	modifiedAt: number;
}

export type SidebarFilter = "all" | "normal" | "schedule" | "batch" | "flowing";
export type SidebarMode = "projects" | "files";
export const sidebarModeAtom = atom<SidebarMode>("projects");

export const projectsAtom = atom<Project[]>([]);
export const expandedProjectsAtom = atom<Set<string>>(new Set<string>());
export const sessionsMapAtom = atom<Map<string, SessionInfo[]>>(new Map<string, SessionInfo[]>());
export const sidebarWidthAtom = atom<number>(220);
export const sidebarFilterAtom = atom<SidebarFilter>("all");

const DEFAULT_WORKSPACE = "~/.vetta/workspace";
export const workspacePathAtom = atom<string>(localStorage.getItem("vetta-workspace-path") || DEFAULT_WORKSPACE);

export const sessionContextMenuAtom = atom<{ x: number; y: number; session: SessionInfo } | null>(null);
export const renamingSessionPathAtom = atom<string | null>(null);
export const projectContextMenuAtom = atom<{ x: number; y: number; project: Project } | null>(null);

import { atom } from "jotai";

export type ProjectType = "normal" | "flowing" | "schedule" | "batch";

export interface Project {
	cwd: string;
	name?: string;
	sessionCount: number;
	type: ProjectType;
	workflowInstanceId?: number;
	/** 流转项目对应的 flowing id（来自 meta.json） */
	flowingId?: number;
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

export const projectsAtom = atom<Project[]>([]);
export const expandedProjectsAtom = atom<Set<string>>(new Set<string>());
export const sessionsMapAtom = atom<Map<string, SessionInfo[]>>(new Map<string, SessionInfo[]>());

export const SIDEBAR_WIDTH_STORAGE_KEY = "vetta-sidebar-width";
const SIDEBAR_WIDTH_DEFAULT = 220;
const readSidebarWidth = (): number => {
	const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
	if (raw == null) return SIDEBAR_WIDTH_DEFAULT;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : SIDEBAR_WIDTH_DEFAULT;
};
export const sidebarWidthAtom = atom<number>(readSidebarWidth());
export const sidebarFilterAtom = atom<SidebarFilter>("all");
// Always start expanded on app launch — collapse state is per-session only.
export const sidebarCollapsedAtom = atom<boolean>(false);

const DEFAULT_WORKSPACE = "~/.vetta/workspace";
export const workspacePathAtom = atom<string>(localStorage.getItem("vetta-workspace-path") || DEFAULT_WORKSPACE);

export const sessionContextMenuAtom = atom<{ x: number; y: number; session: SessionInfo } | null>(null);
export const renamingSessionPathAtom = atom<string | null>(null);
export const projectContextMenuAtom = atom<{ x: number; y: number; project: Project } | null>(null);

import { pathBasename } from "@shared/lib/utils";
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
	/** 是否为默认「对话」项目（运行时虚拟注入，不写入 config.projects）。 */
	isDefault?: boolean;
}

/** 默认「对话」项目的显示名称。 */
export const DEFAULT_CONVERSATION_PROJECT_NAME = "对话";
/**
 * 默认「对话」项目的 cwd（绝对路径）。
 * 启动时由主进程 ConfigGet 返回真实路径并写入此 atom；在收到之前保持空串作为「未就绪」标记。
 */
export const defaultConversationCwdAtom = atom<string>("");

/**
 * im-gateway 的 cwd（绝对路径），与桌面「对话」cwd 物理分离（ADR-0005）。
 * 用于判定一条 session 是否是 Claw（IM）来源：session.cwd === defaultImConversationCwdAtom。
 */
export const defaultImConversationCwdAtom = atom<string>("");

/**
 * 根据 cwd 获取项目展示名：默认「对话」项目返回中文名，其它项目使用 cwd basename。
 * 传入 defaultCwd 来识别默认项目（避免对 atom 的隐式依赖，便于在非 React 环境调用）。
 */
export function getProjectDisplayName(cwd: string, defaultCwd: string): string {
	if (defaultCwd && cwd === defaultCwd) return DEFAULT_CONVERSATION_PROJECT_NAME;
	return pathBasename(cwd);
}

export interface SessionInfo {
	id: string;
	path: string;
	cwd: string;
	name?: string;
	firstMessage: string;
	modifiedAt: number;
}

/**
 * 判断一条 session 是否来自 IM（Claw）。物理来源即身份：会话 cwd 等于 im-gateway cwd
 * 就是 Claw 会话。`imCwd` 由 [[defaultImConversationCwdAtom]] 提供，空串表示 ConfigGet
 * 还没回来，此时一律视为非 IM（避免误把桌面会话归到 Claw tab）。
 */
export function isImSession(session: Pick<SessionInfo, "cwd">, imCwd: string): boolean {
	return imCwd !== "" && session.cwd === imCwd;
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

export type DefaultConversationFilter = "conversation" | "claw";
export const defaultConversationFilterAtom = atom<DefaultConversationFilter>("conversation");
// Always start expanded on app launch — collapse state is per-session only.
export const sidebarCollapsedAtom = atom<boolean>(false);

const DEFAULT_WORKSPACE = "~/.vetta/workspace";
export const workspacePathAtom = atom<string>(localStorage.getItem("vetta-workspace-path") || DEFAULT_WORKSPACE);

export const sessionContextMenuAtom = atom<{ x: number; y: number; session: SessionInfo } | null>(null);
export const renamingSessionPathAtom = atom<string | null>(null);
export const projectContextMenuAtom = atom<{ x: number; y: number; project: Project } | null>(null);

import type { Project, SessionInfo } from "@shared/store/atoms";
import { useEffect, useMemo, useRef } from "react";
import type { SidebarConversationInfo } from "../services/sidebar-conversation-projection";
import { type FlatSidebarConversations, flattenSidebarConversations } from "../services/sidebar-flat-conversations";

interface UseFlatSidebarConversationsArgs {
	/** 平铺且来源为普通对话时才合并项目会话；Claw 只有自己的记录。 */
	enabled: boolean;
	defaultSessions: readonly SidebarConversationInfo[];
	/** 当前工作空间可见的用户项目。 */
	projects: readonly Project[];
	projectSessions: ReadonlyMap<string, SidebarConversationInfo[]>;
	sessionsMap: ReadonlyMap<string, readonly SessionInfo[]>;
	loadSessions: (cwd: string, afterPaint?: boolean) => Promise<void>;
}

/**
 * 平铺展示把各项目会话并入「对话」列表。项目会话平时只在展开项目时才读取，
 * 平铺后改为在首帧绘制之后补读：先切换布局，再逐个项目增量补齐。
 */
export function useFlatSidebarConversations({
	enabled,
	defaultSessions,
	projects,
	projectSessions,
	sessionsMap,
	loadSessions,
}: UseFlatSidebarConversationsArgs): FlatSidebarConversations | null {
	// 每个项目在一次平铺期间只主动读取一次；读取失败不在 effect 里反复重试。
	const requestedRef = useRef(new Set<string>());
	useEffect(() => {
		if (!enabled) {
			requestedRef.current.clear();
			return;
		}
		for (const { cwd } of projects) {
			if (sessionsMap.has(cwd) || requestedRef.current.has(cwd)) continue;
			requestedRef.current.add(cwd);
			void loadSessions(cwd, true);
		}
	}, [enabled, loadSessions, projects, sessionsMap]);

	return useMemo(
		() =>
			enabled
				? flattenSidebarConversations(
						defaultSessions,
						projects.map((project) => ({ project, sessions: projectSessions.get(project.cwd) ?? [] })),
					)
				: null,
		[defaultSessions, enabled, projectSessions, projects],
	);
}

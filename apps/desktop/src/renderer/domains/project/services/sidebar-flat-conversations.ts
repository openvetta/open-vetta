import { pathBasename } from "@shared/lib/utils";
import type { Project } from "@shared/store/atoms";
import { type SidebarConversationInfo, sidebarConversationKey } from "./sidebar-conversation-projection";

/** 平铺列表里来自用户项目的会话：选中、重命名要按所属项目的 cwd 进行，行内标注项目名。 */
export interface SidebarConversationOrigin {
	readonly cwd: string;
	readonly projectLabel: string;
}

export interface FlatSidebarProjectEntry {
	readonly project: Project;
	readonly sessions: readonly SidebarConversationInfo[];
}

export interface FlatSidebarConversations {
	readonly sessions: SidebarConversationInfo[];
	/** 以 `sidebarConversationKey` 为键；不在表里的会话属于默认「对话」区。 */
	readonly projectOrigins: ReadonlyMap<string, SidebarConversationOrigin>;
}

/**
 * 把默认「对话」区与各用户项目的会话合并成一个列表。顺序交给侧栏统一的排序规则，
 * 这里只负责合并与来源标注；同一会话出现在多处时以先出现的来源为准。
 */
export function flattenSidebarConversations(
	defaultSessions: readonly SidebarConversationInfo[],
	projects: readonly FlatSidebarProjectEntry[],
): FlatSidebarConversations {
	const seen = new Set(defaultSessions.map(sidebarConversationKey));
	const sessions = [...defaultSessions];
	const projectOrigins = new Map<string, SidebarConversationOrigin>();
	for (const { project, sessions: projectSessions } of projects) {
		const origin: SidebarConversationOrigin = {
			cwd: project.cwd,
			projectLabel: project.name ?? pathBasename(project.cwd),
		};
		for (const session of projectSessions) {
			const key = sidebarConversationKey(session);
			if (seen.has(key)) continue;
			seen.add(key);
			sessions.push(session);
			projectOrigins.set(key, origin);
		}
	}
	return { sessions, projectOrigins };
}

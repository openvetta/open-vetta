import { TEAM_CONFIGURATION_CHANGED_EVENT, TEAM_SESSIONS_CHANGED_EVENT } from "@shared/agent-teams/team-session-events";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopTeamSidebarConversation } from "../../../../shared/sidebar-conversation";
import { teamSidebarConversationsAtom } from "../store/team-conversations-atom";

export function useTeamSidebarConversations(projectPaths: readonly string[]): {
	readonly conversations: readonly DesktopTeamSidebarConversation[];
	readonly loading: boolean;
} {
	const [conversations, setConversations] = useState<readonly DesktopTeamSidebarConversation[]>([]);
	// 同一份快照也写给工作空间状态汇总，避免它为团队会话另拉一次列表。
	const publishConversations = useSetAtom(teamSidebarConversationsAtom);
	const [loading, setLoading] = useState(true);
	const requestRevisionRef = useRef(0);
	const projectPathsKey = [...projectPaths].sort().join("\u0000");

	const load = useCallback(() => {
		void projectPathsKey;
		const requestRevision = ++requestRevisionRef.current;
		// loading 只代表首次加载：Team 发起会话期间会连续派发多次变更事件，
		// 刷新时若回到 loading，侧栏会整段换成骨架屏再换回，造成闪烁。
		void window.vetta.agentTeams
			.listSidebarConversations()
			.then((next) => {
				if (requestRevisionRef.current !== requestRevision) return;
				setConversations(next);
				publishConversations(next);
			})
			.catch(() => undefined)
			.finally(() => {
				if (requestRevisionRef.current === requestRevision) setLoading(false);
			});
	}, [projectPathsKey, publishConversations]);

	useEffect(() => {
		load();
		window.addEventListener(TEAM_SESSIONS_CHANGED_EVENT, load);
		window.addEventListener(TEAM_CONFIGURATION_CHANGED_EVENT, load);
		return () => {
			requestRevisionRef.current += 1;
			window.removeEventListener(TEAM_SESSIONS_CHANGED_EVENT, load);
			window.removeEventListener(TEAM_CONFIGURATION_CHANGED_EVENT, load);
		};
	}, [load]);

	return { conversations, loading };
}

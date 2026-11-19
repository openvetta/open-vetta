import { activeSessionAtom, defaultConversationCwdAtom, projectsAtom, sessionsMapAtom } from "@shared/store/atoms";
import { pendingInteractionPathsAtom } from "@shared/store/pending-interactions-atoms";
import { runningSessionPathsAtom } from "@shared/store/running-sessions-atoms";
import { MAIN_SPACE, spacesAtom } from "@shared/store/spaces";
import { atom } from "jotai";
import type { SpaceActivity, SpaceActivityEntry } from "../lib/space-activity";
import { projectSpaceOf, summarizeSpaceActivity } from "../lib/space-activity";
import { teamSidebarConversationsAtom } from "./team-conversations-atom";

/**
 * 每个工作空间「有多少会话在跑 / 有多少在等用户」。
 *
 * 侧栏的会话行、项目行与工作空间按钮组都读这一份，避免三处各自判定谁在跑、谁在等。
 * 等用户处理的会话同时也在运行集合里，两个计数分别记，由界面决定先显示哪个。
 */
export const spaceActivityAtom = atom<Map<string, SpaceActivity>>((get) => {
	const runningPaths = get(runningSessionPathsAtom);
	const pendingPaths = get(pendingInteractionPathsAtom);
	const spaces = get(spacesAtom);
	const projects = get(projectsAtom);
	const sessionsMap = get(sessionsMapAtom);
	const teamConversations = get(teamSidebarConversationsAtom);
	const defaultCwd = get(defaultConversationCwdAtom);
	const activeSession = get(activeSessionAtom);

	const cwdByPath = new Map<string, string>();
	for (const sessions of sessionsMap.values()) {
		for (const session of sessions) cwdByPath.set(session.path, session.cwd);
	}
	// 刚打开、还没回填进会话列表的会话也要能参与归因。
	if (activeSession?.sessionPath && activeSession.cwd) cwdByPath.set(activeSession.sessionPath, activeSession.cwd);

	// 团队会话按 placement 归到项目所在的工作空间；它的 coordinationSessionPath 就是运行态里的 key。
	const spaceByPath = new Map<string, string>();
	for (const conversation of teamConversations) {
		const projectPath = conversation.placement.kind === "project" ? conversation.placement.projectPath : undefined;
		spaceByPath.set(
			conversation.coordinationSessionPath,
			projectPath ? (projectSpaceOf(spaces, projectPath) ?? MAIN_SPACE) : MAIN_SPACE,
		);
		cwdByPath.set(conversation.coordinationSessionPath, conversation.cwd);
	}

	const paths = new Set<string>([...runningPaths, ...pendingPaths.keys()]);
	const activity: SpaceActivityEntry[] = [...paths].map((sessionPath) => ({
		sessionPath,
		running: runningPaths.has(sessionPath),
		waiting: (pendingPaths.get(sessionPath) ?? 0) > 0,
		cwd: cwdByPath.get(sessionPath),
	}));

	return summarizeSpaceActivity({
		activity,
		spaces,
		projectCwds: projects.map((project) => project.cwd),
		defaultCwd,
		spaceByPath,
		cwdByPath,
	});
});

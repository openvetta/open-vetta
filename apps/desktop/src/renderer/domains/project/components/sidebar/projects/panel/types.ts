import type {
	DefaultConversationFilter,
	Project,
	SessionContextMenuSession,
	SessionExecutionMode,
	SidebarFilter,
} from "@shared/store/atoms";
import type { SidebarConversationInfo } from "../../../../services/sidebar-conversation-projection";

export interface ProjectsPanelProps {
	defaultSessionListClassName?: string;
	filter: SidebarFilter;
	onOpenSession: (cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>;
}

export interface BatchProjectEntry {
	project: Project;
	sessions: SidebarConversationInfo[];
}

export interface ProjectsPanelModel {
	activeSessionPath: string;
	activeTeamSessionId: string;
	batchProjects: BatchProjectEntry[];
	defaultConversationFilter: DefaultConversationFilter;
	defaultProject: Project | undefined;
	defaultSessions: SidebarConversationInfo[];
	/** 默认区会话真正所属的 cwd：claw 过滤下是 im-gateway 的 cwd，而非 defaultProject.cwd。 */
	defaultSessionsCwd: string;
	expandedBatchProjects: Set<string>;
	expandedProjects: Set<string>;
	filteredProjects: Project[];
	imCwd: string;
	noOtherProjects: boolean;
	projectSessions: (cwd: string) => SidebarConversationInfo[];
	projectSessionsLoading: (cwd: string) => boolean;
	projectsLoading: boolean;
	defaultSessionsLoading: boolean;
	showBatchGroup: boolean;
	actions: {
		archiveProject(cwd: string): void;
		batchNewSession(cwd: string): void;
		clearClaw(cwd: string): void;
		clearConversation(cwd: string): void;
		collapseBatchProject(cwd: string): void;
		collapseProject(cwd: string): void;
		deleteSession(session: SessionContextMenuSession): void;
		defaultNewSession(cwd: string): void;
		defaultSelectSession(cwd: string, session: SidebarConversationInfo): void;
		expandBatchProject(cwd: string): void;
		expandProject(cwd: string): void;
		isProjectActive(cwd: string): boolean;
		/** 拉取某个项目的会话；项目没展开时列表默认是空的，需要主动加载。 */
		loadSessions(cwd: string): void;
		navigateProject(cwd: string): void;
		openClawSettings(): void;
		removeProject(cwd: string): void;
		renameSession(cwd: string, sessionPath: string, name: string): void;
		selectBatchSession(cwd: string, session: SidebarConversationInfo): void;
		selectSession(cwd: string, session: SidebarConversationInfo): void;
	};
}

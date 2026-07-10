import { useAtom, useAtomValue } from "jotai";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Project, ProjectType, SessionInfo } from "@shared/store/atoms";
import {
	projectContextMenuAtom,
	renamingSessionPathAtom,
	runningSessionPathsAtom,
	scheduledSessionPathsAtom,
	sessionContextMenuAtom,
} from "@shared/store/atoms";
import { pathBasename } from "@shared/lib/utils";
import { DEFAULT_VISIBLE_SESSIONS } from "./projectGroupConstants";
import { ProjectRow } from "./ProjectRow";
import { ProjectSessions } from "./ProjectSessions";
import { SessionRow } from "./SessionRow";

interface ProjectGroupProps {
	project: Project;
	scrollParent: HTMLElement | null;
	sessions: SessionInfo[];
	isExpanded: boolean;
	isActive?: boolean;
	activeSessionPath: string;
	onExpand: (cwd: string) => void;
	onCollapse: (cwd: string) => void;
	onNavigateProject: (cwd: string) => void;
	onNewSession: (cwd: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
}

export const ProjectGroup = memo(function ProjectGroup({
	project,
	scrollParent,
	sessions,
	isExpanded,
	isActive = false,
	activeSessionPath,
	onExpand,
	onCollapse,
	onNavigateProject,
	onNewSession,
	onSelectSession,
	onRenameSession,
}: ProjectGroupProps): JSX.Element {
	const { t } = useTranslation("project");
	const sortedSessions = useMemo(
		() => [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt),
		[sessions],
	);
	const [, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [, setProjectContextMenu] = useAtom(projectContextMenuAtom);
	const [renamingSessionPath, setRenamingSessionPath] = useAtom(renamingSessionPathAtom);
	const [showAllSessions, setShowAllSessions] = useState(false);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);
	const scheduledSessionPaths = useAtomValue(scheduledSessionPathsAtom);
	// 兜底用文件名匹配：执行记录里的 sessionPath 与侧栏 listSessions 的 path 理应相等，
	// 但默认「对话」项目存在 sessionDir / per-session 子目录等路径间接层，按 basename
	// 再兜一层，避免个别路径细节导致定时图标不显示。文件名含时间戳+uuid，全局唯一。
	const scheduledBasenames = useMemo(() => {
		const basenames = new Set<string>();
		for (const path of scheduledSessionPaths) basenames.add(path.slice(path.lastIndexOf("/") + 1));
		return basenames;
	}, [scheduledSessionPaths]);
	const projectHasRunning = useMemo(
		() => sessions.some((session) => runningSessionPaths.has(session.path)),
		[sessions, runningSessionPaths],
	);

	useEffect(() => {
		if (!isExpanded) setShowAllSessions(false);
	}, [isExpanded]);

	const hasMoreSessions = sortedSessions.length > DEFAULT_VISIBLE_SESSIONS;
	const visibleSessions = showAllSessions
		? sortedSessions
		: sortedSessions.slice(0, DEFAULT_VISIBLE_SESSIONS);
	const hiddenCount = sortedSessions.length - DEFAULT_VISIBLE_SESSIONS;
	const displayName = project.name ?? pathBasename(project.cwd);
	const projectType = project.type;
	const projectBadge = getProjectBadge(project, projectType, t);

	const renderSession = (session: SessionInfo): JSX.Element => {
		const isActive = activeSessionPath === session.path;
		const isRunning = runningSessionPaths.has(session.path);
		const isSchedule =
			scheduledSessionPaths.has(session.path) ||
			scheduledBasenames.has(session.path.slice(session.path.lastIndexOf("/") + 1));
		return (
			<SessionRow
				active={isActive}
				cwd={project.cwd}
				key={session.path}
				onOpenContextMenu={(event, menuSession) => {
					event.preventDefault();
					setContextMenu({ x: event.clientX, y: event.clientY, session: menuSession });
				}}
				onRename={onRenameSession}
				onRenameDone={() => setRenamingSessionPath(null)}
				onSelect={onSelectSession}
				renaming={renamingSessionPath === session.path}
				running={isRunning}
				scheduled={isSchedule}
				session={session}
			/>
		);
	};

	return (
		<div className="project-group-contain mb-1">
			<ProjectRow
				badge={projectBadge}
				displayName={displayName}
				expanded={isExpanded}
				hasRunning={projectHasRunning}
				isActive={isActive}
				newSessionTitle={t("sidebar.nav.newSession")}
				onCollapse={onCollapse}
				onExpand={onExpand}
				onNavigateProject={onNavigateProject}
				onNewSession={onNewSession}
				onOpenContextMenu={(event, menuProject) => {
					event.preventDefault();
					setProjectContextMenu({ x: event.clientX, y: event.clientY, project: menuProject });
				}}
				project={project}
				projectType={projectType}
			/>
			<ProjectSessions
				expanded={isExpanded}
				hasMore={hasMoreSessions}
				hiddenCount={hiddenCount}
				onToggleShowAll={() => setShowAllSessions((value) => !value)}
				renderEmpty={() => (
					<p className="px-2.5 py-1.5 pl-[36px] text-[12px] text-muted-foreground">
						{t("sidebar.projects.noSessions")}
					</p>
				)}
				scrollParent={scrollParent}
				sessions={visibleSessions}
				showAll={showAllSessions}
			>
				{renderSession}
			</ProjectSessions>
		</div>
	);
});

function getProjectBadge(
	project: Project,
	projectType: ProjectType,
	t: (key: "detail.typeBatch" | "detail.typeFlowing" | "detail.typeWorkflow") => string,
): string | undefined {
	if (projectType === "normal") return undefined;
	if (project.type === "flowing" && typeof project.workflowInstanceId === "number") {
		return t("detail.typeWorkflow");
	}
	if (projectType === "flowing") return t("detail.typeFlowing");
	return t("detail.typeBatch");
}

import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";
import { activeSessionAtom, projectContextMenuAtom, sessionContextMenuAtom } from "../../store/atoms";
import { useProjects } from "../../hooks/useProjects";
import { ProjectGroup } from "./ProjectGroup";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { SessionContextMenu } from "./SessionContextMenu";

interface ProjectsPanelProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
}

export function ProjectsPanel({ onOpenSession }: ProjectsPanelProps): JSX.Element {
	const { projects, sessionsMap, expandedProjects, toggleProject, deleteSession, renameSession, archiveProject } =
		useProjects();
	const activeSession = useAtomValue(activeSessionAtom);
	const [contextMenu, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [projectMenu, setProjectMenu] = useAtom(projectContextMenuAtom);

	const handleDeleteSession = useCallback(
		(session: { cwd: string; path: string }) => {
			void deleteSession(session.cwd, session.path);
			setContextMenu(null);
		},
		[deleteSession, setContextMenu],
	);

	const handleRenameSession = useCallback(
		(cwd: string, sessionPath: string, name: string) => {
			void renameSession(cwd, sessionPath, name);
		},
		[renameSession],
	);

	if (projects.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
				<span className="icon-[mdi--folder-open-outline] h-7 w-7 text-[var(--text-2)]" />
				<p className="text-[11px] text-[var(--text-1)]">还没有项目</p>
				<p className="text-[11px] text-[var(--text-2)]">点击上方 + 新建项目</p>
			</div>
		);
	}

	return (
		<>
			{projects.map((project) => (
				<ProjectGroup
					key={project.cwd}
					project={project}
					sessions={sessionsMap.get(project.cwd) ?? []}
					isExpanded={expandedProjects.has(project.cwd)}
					activeSessionPath={activeSession?.sessionPath ?? ""}
					onToggle={toggleProject}
					onNewSession={(cwd) => void onOpenSession(cwd)}
					onSelectSession={(cwd, path) => void onOpenSession(cwd, path)}
					onRenameSession={handleRenameSession}
				/>
			))}
			{contextMenu && (
				<SessionContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					session={contextMenu.session}
					onClose={() => setContextMenu(null)}
					onDelete={handleDeleteSession}
				/>
			)}
			{projectMenu && (
				<ProjectContextMenu
					x={projectMenu.x}
					y={projectMenu.y}
					project={projectMenu.project}
					onClose={() => setProjectMenu(null)}
					onArchive={(cwd) => {
						void archiveProject(cwd);
						setProjectMenu(null);
					}}
				/>
			)}
		</>
	);
}

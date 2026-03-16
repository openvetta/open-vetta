import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";
import { activeSessionAtom, sessionContextMenuAtom } from "../../store/atoms";
import { useProjects } from "../../hooks/useProjects";
import { ProjectGroup } from "./ProjectGroup";
import { SessionContextMenu } from "./SessionContextMenu";

interface ProjectsPanelProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
}

export function ProjectsPanel({ onOpenSession }: ProjectsPanelProps): JSX.Element {
	const { projects, sessionsMap, expandedProjects, addProject, toggleProject, deleteSession, renameSession } =
		useProjects();
	const activeSession = useAtomValue(activeSessionAtom);
	const [contextMenu, setContextMenu] = useAtom(sessionContextMenuAtom);

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
				<span className="icon-[mdi--folder-open-outline] h-7 w-7 text-[var(--text-3)]" />
				<p className="text-[11px] text-[var(--text-3)]">No projects yet.</p>
				<button
					type="button"
					onClick={() => void addProject()}
					className="text-[11px] font-medium text-[var(--text-2)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text-1)]"
				>
					Add a project
				</button>
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
		</>
	);
}

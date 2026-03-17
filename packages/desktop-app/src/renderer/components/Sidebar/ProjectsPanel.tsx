import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { activeSessionAtom, confirmDialogAtom, projectContextMenuAtom, sessionContextMenuAtom } from "../../store/atoms";

function projectName(cwd: string): string {
	return cwd.split("/").pop() ?? cwd;
}
import { useProjects } from "../../hooks/useProjects";
import { ProjectGroup } from "./ProjectGroup";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { SessionContextMenu } from "./SessionContextMenu";

interface ProjectsPanelProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
}

export function ProjectsPanel({ onOpenSession }: ProjectsPanelProps): JSX.Element {
	const {
		projects,
		sessionsMap,
		expandedProjects,
		toggleProject,
		deleteSession,
		renameSession,
		archiveProject,
		removeProject,
		deleteProjectFromDisk,
	} = useProjects();
	const activeSession = useAtomValue(activeSessionAtom);
	const [contextMenu, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [projectMenu, setProjectMenu] = useAtom(projectContextMenuAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);

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

	const handleArchive = useCallback(
		(cwd: string) => {
			void archiveProject(cwd);
			setProjectMenu(null);
		},
		[archiveProject, setProjectMenu],
	);

	const handleRemove = useCallback(
		(cwd: string) => {
			setProjectMenu(null);
			setConfirm({
				title: "从列表中移除",
				message: `确定要将「${projectName(cwd)}」从项目列表中移除吗？此操作不会删除磁盘上的文件。`,
				confirmLabel: "移除",
				variant: "default",
				onConfirm: () => {
					void removeProject(cwd);
				},
			});
		},
		[removeProject, setProjectMenu, setConfirm],
	);

	const handleDelete = useCallback(
		(cwd: string) => {
			setProjectMenu(null);
			setConfirm({
				title: "删除项目",
				message: `确定要永久删除「${projectName(cwd)}」吗？此操作将从磁盘上彻底删除该项目文件夹，不可恢复。`,
				confirmLabel: "删除",
				variant: "danger",
				onConfirm: () => {
					void deleteProjectFromDisk(cwd);
				},
			});
		},
		[deleteProjectFromDisk, setProjectMenu, setConfirm],
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
					onArchive={handleArchive}
					onRemove={handleRemove}
					onDelete={handleDelete}
				/>
			)}
		</>
	);
}

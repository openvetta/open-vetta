import { useAtom, useAtomValue } from "jotai";
import {
	projectContextMenuAtom,
	runningSessionPathsAtom,
	sessionContextMenuAtom,
} from "@shared/store/atoms";
import { ProjectContextMenu } from "../../../ProjectContextMenu";
import { SessionContextMenu } from "../../../SessionContextMenu";
import type { ProjectsPanelModel } from "./types";

interface ProjectsPanelMenusProps {
	model: ProjectsPanelModel;
}

export function ProjectsPanelMenus({ model }: ProjectsPanelMenusProps): JSX.Element {
	const [contextMenu, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [projectMenu, setProjectMenu] = useAtom(projectContextMenuAtom);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);

	return (
		<>
			{contextMenu && (
				<SessionContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					session={contextMenu.session}
					onClose={() => setContextMenu(null)}
					onDelete={(session) => {
						setContextMenu(null);
						model.actions.deleteSession(session);
					}}
				/>
			)}
			{projectMenu && (
				<ProjectContextMenu
					x={projectMenu.x}
					y={projectMenu.y}
					project={projectMenu.project}
					onClose={() => setProjectMenu(null)}
					onArchive={(cwd) => {
						setProjectMenu(null);
						model.actions.archiveProject(cwd);
					}}
					onRemove={(cwd) => {
						setProjectMenu(null);
						model.actions.removeProject(cwd);
					}}
					onDelete={(cwd) => {
						setProjectMenu(null);
						model.actions.deleteProject(cwd);
					}}
					defaultScope={
						projectMenu.project.isDefault === true ? model.defaultConversationFilter : undefined
					}
					onClearConversation={(cwd) => {
						setProjectMenu(null);
						model.actions.clearConversation(cwd);
					}}
					onClearClaw={(cwd) => {
						setProjectMenu(null);
						model.actions.clearClaw(cwd);
					}}
					onOpenClawSettings={() => {
						setProjectMenu(null);
						model.actions.openClawSettings();
					}}
					clearConversationDisabled={
						projectMenu.project.isDefault === true &&
						model.projectSessions(projectMenu.project.cwd).some((session) =>
							runningSessionPaths.has(session.path),
						)
					}
					clearClawDisabled={
						projectMenu.project.isDefault === true &&
						model.projectSessions(model.imCwd).some((session) => runningSessionPaths.has(session.path))
					}
				/>
			)}
		</>
	);
}

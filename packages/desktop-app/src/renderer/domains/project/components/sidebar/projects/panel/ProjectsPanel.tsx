import { ProjectsPanelEmptyState } from "./ProjectsPanelEmptyState";
import { ProjectGroupsSection } from "./ProjectGroupsSection";
import { DefaultConversationSection } from "./DefaultConversationSection";
import { ProjectsPanelMenus } from "./ProjectsPanelMenus";
import { useProjectsPanelModel } from "./useProjectsPanelModel";
import type { ProjectsPanelProps } from "./types";

export function ProjectsPanel(props: ProjectsPanelProps): JSX.Element {
	const model = useProjectsPanelModel(props);

	return (
		<>
			{model.noOtherProjects && !model.defaultProject && <ProjectsPanelEmptyState />}
			<ProjectGroupsSection model={model} />
			{model.defaultProject && (
				<DefaultConversationSection
					activeSessionPath={model.activeSessionPath}
					defaultConversationFilter={model.defaultConversationFilter}
					project={model.defaultProject}
					scrollParent={props.scrollParent}
					sessions={model.defaultSessions}
					onNewSession={model.actions.defaultNewSession}
					onRenameSession={model.actions.renameSession}
					onSelectSession={model.actions.defaultSelectSession}
				/>
			)}
			<ProjectsPanelMenus model={model} />
		</>
	);
}

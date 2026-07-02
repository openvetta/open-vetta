import { ProjectsPanelEmptyState } from "./ProjectsPanelEmptyState";
import { ProjectGroupsSection } from "./ProjectGroupsSection";
import { DefaultConversationSection } from "./DefaultConversationSection";
import { ProjectsPanelMenus } from "./ProjectsPanelMenus";
import { useProjectsPanelModel } from "./useProjectsPanelModel";
import type { ProjectsPanelProps } from "./types";

export function ProjectsPanel(props: ProjectsPanelProps): JSX.Element {
	const model = useProjectsPanelModel(props);

	return (
		<div className="flex min-h-0 flex-1 flex-col px-1.5 py-0.5">
			{model.noOtherProjects && !model.defaultProject && <ProjectsPanelEmptyState />}
			<ProjectGroupsSection model={model} />
			{model.defaultProject && (
				<DefaultConversationSection
					activeSessionPath={model.activeSessionPath}
					defaultConversationFilter={model.defaultConversationFilter}
					listClassName={props.defaultSessionListClassName}
					project={model.defaultProject}
					sessions={model.defaultSessions}
					onNewSession={model.actions.defaultNewSession}
					onRenameSession={model.actions.renameSession}
					onSelectSession={model.actions.defaultSelectSession}
				/>
			)}
			<ProjectsPanelMenus model={model} />
		</div>
	);
}

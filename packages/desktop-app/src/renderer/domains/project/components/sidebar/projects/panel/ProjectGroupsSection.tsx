import { ProjectGroup } from "../ProjectGroup";
import type { ProjectsPanelModel } from "./types";

interface ProjectGroupsSectionProps {
	model: ProjectsPanelModel;
}

export function ProjectGroupsSection({ model }: ProjectGroupsSectionProps): JSX.Element {
	return (
		<>
			{model.filteredProjects.map((project) => (
				<ProjectGroup
					key={project.cwd}
					project={project}
					sessions={model.projectSessions(project.cwd)}
					isExpanded={model.expandedProjects.has(project.cwd)}
					isActive={model.actions.isProjectActive(project.cwd)}
					activeSessionPath={model.activeSessionPath}
					onExpand={model.actions.expandProject}
					onCollapse={model.actions.collapseProject}
					onNavigateProject={model.actions.navigateProject}
					onNewSession={model.actions.batchNewSession}
					onSelectSession={model.actions.selectSession}
					onRenameSession={model.actions.renameSession}
				/>
			))}
			{model.showBatchGroup &&
				model.batchProjects.map(({ project, sessions }) => (
					<ProjectGroup
						key={project.cwd}
						project={project}
						sessions={sessions}
						isExpanded={model.expandedBatchProjects.has(project.cwd)}
						isActive={model.actions.isProjectActive(project.cwd)}
						activeSessionPath={model.activeSessionPath}
						onExpand={model.actions.expandBatchProject}
						onCollapse={model.actions.collapseBatchProject}
						onNavigateProject={model.actions.navigateProject}
						onNewSession={model.actions.batchNewSession}
						onSelectSession={model.actions.selectBatchSession}
						onRenameSession={model.actions.renameSession}
					/>
				))}
		</>
	);
}

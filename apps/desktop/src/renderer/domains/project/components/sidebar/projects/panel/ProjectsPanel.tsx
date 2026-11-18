import { sidebarProjectsOpenAtom } from "@shared/store/atoms";
import { ProjectsLoadingView } from "@vetta-org/theme-ui/project/ProjectsLoadingView";
import { ProjectsPanelView } from "@vetta-org/theme-ui/project/ProjectsPanelView";
import {
	SidebarProjectDisclosureContent,
	SidebarProjectDisclosureTrigger,
} from "@vetta-org/theme-ui/project/SidebarProjectDisclosure";
import { cn } from "@vetta-org/ui/utils";
import { useAtom } from "jotai";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConversationTagsSync } from "../../../../hooks/useConversationTagsSync";
import { AddProjectMenu } from "../../add-project/AddProjectMenu";
import { DefaultConversationSection } from "./DefaultConversationSection";
import { ProjectGroupsSection } from "./ProjectGroupsSection";
import { ProjectsPanelEmptyState } from "./ProjectsPanelEmptyState";
import { ProjectsPanelMenus } from "./ProjectsPanelMenus";
import type { ProjectsPanelProps } from "./types";
import { useProjectsPanelModel } from "./useProjectsPanelModel";

export function ProjectsPanel(props: ProjectsPanelProps): JSX.Element {
	const { t } = useTranslation("project");
	const model = useProjectsPanelModel(props);
	useConversationTagsSync();
	const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
	const [projectsOpen, setProjectsOpen] = useAtom(sidebarProjectsOpenAtom);
	const projectsContentId = useId();

	const hasUserProjects = model.userProjects.length > 0 || model.batchProjects.length > 0;
	const showDefaultRegion = Boolean(model.defaultProject);
	const showEmpty = !hasUserProjects && !showDefaultRegion;

	const defaultCwd = model.defaultProject?.cwd;
	const newConversation = (): void => {
		if (defaultCwd) model.actions.defaultNewSession(defaultCwd);
	};

	const showStartCard =
		!hasUserProjects &&
		!model.defaultSessionsLoading &&
		model.defaultSessions.length === 0 &&
		model.defaultConversationFilter === "conversation";

	const defaultSection =
		showDefaultRegion && model.defaultProject ? (
			<>
				<DefaultConversationSection
					activeSessionPath={model.activeSessionPath}
					activeTeamSessionId={model.activeTeamSessionId}
					defaultConversationFilter={model.defaultConversationFilter}
					listClassName={props.defaultSessionListClassName}
					project={model.defaultProject}
					scrollParent={scrollEl}
					sessionsCwd={model.defaultSessionsCwd}
					sessions={model.defaultSessions}
					sessionsLoading={model.defaultSessionsLoading}
					onNewSession={model.actions.defaultNewSession}
					onRenameSession={model.actions.renameSession}
					onSelectSession={model.actions.defaultSelectSession}
				/>
				{showStartCard && <ProjectsPanelEmptyState onNewConversation={newConversation} />}
			</>
		) : null;
	if (model.projectsLoading) return <ProjectsLoadingView />;

	return (
		<ProjectsPanelView
			defaultSection={defaultSection}
			emptyState={<ProjectsPanelEmptyState onNewConversation={newConversation} />}
			menus={<ProjectsPanelMenus model={model} />}
			onScrollRef={setScrollEl}
			scrollElement={scrollEl}
			projectsSection={
				hasUserProjects && (
					<>
						<div className={cn("group relative z-20 flex items-center gap-1 pb-1 pr-1", props.projectsToolbarClassName)}>
							<SidebarProjectDisclosureTrigger
								contentId={projectsContentId}
								label={t("sidebar.projects.title")}
								open={projectsOpen}
								onOpenChange={setProjectsOpen}
							/>
							<AddProjectMenu className="ml-auto shrink-0" />
						</div>
						<SidebarProjectDisclosureContent id={projectsContentId} open={projectsOpen}>
							<ProjectGroupsSection model={model} scrollParent={scrollEl} />
						</SidebarProjectDisclosureContent>
					</>
				)
			}
			quickScrollLabels={{
				bottom: t("sidebar.projects.scrollToBottom"),
				top: t("sidebar.projects.scrollToTop"),
			}}
			showDefaultRegion={showDefaultRegion}
			showEmpty={showEmpty}
			showProjectsRegion={hasUserProjects}
		/>
	);
}

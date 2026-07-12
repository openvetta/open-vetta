import {
	clampSidebarProjectsSplitRatio,
	persistSidebarProjectsSplitRatio,
	sidebarProjectsSplitRatioAtom,
} from "@shared/store/atoms";
import { ProjectsPanelView } from "@vetta/theme-ui/project";
import { useAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { DefaultConversationSection } from "./DefaultConversationSection";
import { ProjectGroupsSection } from "./ProjectGroupsSection";
import { ProjectsPanelEmptyState } from "./ProjectsPanelEmptyState";
import { ProjectsPanelMenus } from "./ProjectsPanelMenus";
import { useProjectsPanelModel } from "./useProjectsPanelModel";
import type { ProjectsPanelProps } from "./types";

export function ProjectsPanel(props: ProjectsPanelProps): JSX.Element {
	const model = useProjectsPanelModel(props);
	const [splitRatio, setSplitRatio] = useAtom(sidebarProjectsSplitRatioAtom);
	const splitRatioRef = useRef(splitRatio);
	splitRatioRef.current = splitRatio;
	const splitContainerRef = useRef<HTMLDivElement>(null);
	const [projectsScrollEl, setProjectsScrollEl] = useState<HTMLDivElement | null>(null);

	const showProjectsRegion =
		model.filteredProjects.length > 0 || (model.showBatchGroup && model.batchProjects.length > 0);
	const showDefaultRegion = Boolean(model.defaultProject);
	const showEmpty = !showProjectsRegion && !showDefaultRegion;
	const showSplit = showProjectsRegion && showDefaultRegion;

	const handleSplitResize = useCallback(
		(deltaY: number) => {
			const container = splitContainerRef.current;
			if (!container) return;
			const contentHeight = container.clientHeight - 8;
			if (contentHeight <= 0) return;
			setSplitRatio((prev) => clampSidebarProjectsSplitRatio(prev + deltaY / contentHeight));
		},
		[setSplitRatio],
	);

	const handleSplitResizeEnd = useCallback(() => {
		persistSidebarProjectsSplitRatio(splitRatioRef.current);
	}, []);

	const defaultSection =
		showDefaultRegion && model.defaultProject ? (
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
		) : null;

	return (
		<ProjectsPanelView
			defaultSection={defaultSection}
			emptyState={<ProjectsPanelEmptyState />}
			menus={<ProjectsPanelMenus model={model} />}
			onProjectsScrollRef={setProjectsScrollEl}
			onSplitResize={handleSplitResize}
			onSplitResizeEnd={handleSplitResizeEnd}
			projectsSection={<ProjectGroupsSection model={model} scrollParent={projectsScrollEl} />}
			showDefaultRegion={showDefaultRegion}
			showEmpty={showEmpty}
			showProjectsRegion={showProjectsRegion}
			showSplit={showSplit}
			splitContainerRef={splitContainerRef}
			splitRatio={splitRatio}
		/>
	);
}

import {
	clampSidebarProjectsSplitRatio,
	SIDEBAR_PROJECTS_SPLIT_MAX,
	sidebarProjectsSplitRatioAtom,
} from "@shared/store/atoms";
import { ProjectsPanelView } from "@vetta/theme-ui/project";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { DefaultConversationSection } from "./DefaultConversationSection";
import { ProjectGroupsSection } from "./ProjectGroupsSection";
import { ProjectsPanelEmptyState } from "./ProjectsPanelEmptyState";
import { ProjectsPanelMenus } from "./ProjectsPanelMenus";
import { useProjectsPanelModel } from "./useProjectsPanelModel";
import type { ProjectsPanelProps } from "./types";

const SPLIT_HANDLE_HEIGHT = 10;
const DEFAULT_CONVERSATION_MIN_RATIO = 0.3;
const RESTORED_PROJECTS_RATIO = 0.4;

export function ProjectsPanel(props: ProjectsPanelProps): JSX.Element {
	const model = useProjectsPanelModel(props);
	const [splitRatio, setSplitRatio] = useAtom(sidebarProjectsSplitRatioAtom);
	const splitContainerRef = useRef<HTMLDivElement>(null);
	const [projectsScrollEl, setProjectsScrollEl] = useState<HTMLDivElement | null>(null);
	const [autoFitExpandedProject, setAutoFitExpandedProject] = useState(false);
	const [splitDragging, setSplitDragging] = useState(false);
	const previousExpandedProjectsRef = useRef<Set<string>>(new Set());

	const showProjectsRegion =
		model.filteredProjects.length > 0 || (model.showBatchGroup && model.batchProjects.length > 0);
	const showDefaultRegion = Boolean(model.defaultProject);
	const showEmpty = !showProjectsRegion && !showDefaultRegion;
	const showSplit = showProjectsRegion && showDefaultRegion;

	useEffect(() => {
		const visibleProjectCwds = new Set([
			...model.filteredProjects.map((project) => project.cwd),
			...model.batchProjects.map(({ project }) => project.cwd),
		]);
		const expandedProjects = new Set(
			[...model.expandedProjects, ...model.expandedBatchProjects].filter((cwd) =>
				visibleProjectCwds.has(cwd),
			),
		);
		const openedProject = [...expandedProjects].some(
			(cwd) => !previousExpandedProjectsRef.current.has(cwd),
		);
		previousExpandedProjectsRef.current = expandedProjects;
		if (openedProject) {
			setAutoFitExpandedProject(true);
		} else if (expandedProjects.size === 0) {
			setAutoFitExpandedProject(false);
		}
	}, [model.batchProjects, model.expandedBatchProjects, model.expandedProjects, model.filteredProjects]);

	const handleSplitResizeStart = useCallback(() => {
		setSplitDragging(true);
		if (!autoFitExpandedProject) return;
		setSplitRatio(SIDEBAR_PROJECTS_SPLIT_MAX);
		setAutoFitExpandedProject(false);
	}, [autoFitExpandedProject, setSplitRatio]);

	const handleSplitResize = useCallback(
		(deltaY: number) => {
			const container = splitContainerRef.current;
			if (!container) return;
			const contentHeight = container.clientHeight - SPLIT_HANDLE_HEIGHT;
			if (contentHeight <= 0) return;
			setSplitRatio((prev) => clampSidebarProjectsSplitRatio(prev + deltaY / contentHeight));
		},
		[setSplitRatio],
	);
	const handleSplitResizeEnd = useCallback(() => setSplitDragging(false), []);
	const handleProjectInteract = useCallback(() => {
		const willExpandPanel = !autoFitExpandedProject && splitRatio < SIDEBAR_PROJECTS_SPLIT_MAX;
		setAutoFitExpandedProject(true);
		return willExpandPanel;
	}, [autoFitExpandedProject, splitRatio]);
	const handleDefaultSessionInteract = useCallback(() => {
		const container = splitContainerRef.current;
		if (!container || !projectsScrollEl) return false;
		const contentHeight = container.clientHeight - SPLIT_HANDLE_HEIGHT;
		if (contentHeight <= 0) return false;
		const defaultConversationHeight = contentHeight - projectsScrollEl.clientHeight;
		if (defaultConversationHeight / contentHeight >= DEFAULT_CONVERSATION_MIN_RATIO) return false;

		setAutoFitExpandedProject(false);
		setSplitRatio(RESTORED_PROJECTS_RATIO);
		return true;
	}, [projectsScrollEl, setSplitRatio]);

	const defaultSection =
		showDefaultRegion && model.defaultProject ? (
			<DefaultConversationSection
				activeSessionPath={model.activeSessionPath}
				defaultConversationFilter={model.defaultConversationFilter}
				listClassName={props.defaultSessionListClassName}
				project={model.defaultProject}
				sessions={model.defaultSessions}
				onNewSession={model.actions.defaultNewSession}
				onBeforeSelectSession={handleDefaultSessionInteract}
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
			onSplitResizeStart={handleSplitResizeStart}
			projectsSection={
				<ProjectGroupsSection
					model={model}
					scrollParent={projectsScrollEl}
					onProjectInteract={handleProjectInteract}
				/>
			}
			showDefaultRegion={showDefaultRegion}
			showEmpty={showEmpty}
			showProjectsRegion={showProjectsRegion}
			showSplit={showSplit}
			splitDragging={splitDragging}
			splitContainerRef={splitContainerRef}
			splitRatio={autoFitExpandedProject ? SIDEBAR_PROJECTS_SPLIT_MAX : splitRatio}
		/>
	);
}

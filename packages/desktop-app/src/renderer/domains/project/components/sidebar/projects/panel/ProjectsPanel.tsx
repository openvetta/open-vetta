import { useAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import {
	clampSidebarProjectsSplitRatio,
	persistSidebarProjectsSplitRatio,
	sidebarProjectsSplitRatioAtom,
} from "@shared/store/atoms";
import { ProjectsPanelEmptyState } from "./ProjectsPanelEmptyState";
import { ProjectGroupsSection } from "./ProjectGroupsSection";
import { DefaultConversationSection } from "./DefaultConversationSection";
import { ProjectsPanelMenus } from "./ProjectsPanelMenus";
import { ProjectsPanelSplitHandle } from "./ProjectsPanelSplitHandle";
import { useProjectsPanelModel } from "./useProjectsPanelModel";
import type { ProjectsPanelProps } from "./types";

export function ProjectsPanel(props: ProjectsPanelProps): JSX.Element {
	const model = useProjectsPanelModel(props);
	const [splitRatio, setSplitRatio] = useAtom(sidebarProjectsSplitRatioAtom);
	const splitRatioRef = useRef(splitRatio);
	splitRatioRef.current = splitRatio;
	const splitContainerRef = useRef<HTMLDivElement>(null);
	// 用 state 而非 ref：scroll parent 挂载后触发子树重渲染，Virtuoso 才能拿到 customScrollParent。
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
			// 分隔条本身占高；比例只作用于上下两区剩余高度。
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
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 py-0.5">
			{showEmpty && (
				<div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
					<ProjectsPanelEmptyState />
				</div>
			)}

			{showSplit ? (
				<div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<div
						ref={setProjectsScrollEl}
						className="min-h-0 overflow-y-auto no-scrollbar"
						style={{ flex: `${splitRatio} 1 0%` }}
					>
						<ProjectGroupsSection model={model} scrollParent={projectsScrollEl} />
					</div>
					<ProjectsPanelSplitHandle
						onResize={handleSplitResize}
						onResizeEnd={handleSplitResizeEnd}
					/>
					{/* 外层只负责分区高度，header/列表滚动由 DefaultConversationSection 内部处理 */}
					<div className="flex min-h-0 flex-col overflow-hidden" style={{ flex: `${1 - splitRatio} 1 0%` }}>
						{defaultSection}
					</div>
				</div>
			) : (
				<>
					{showProjectsRegion && (
						<div
							ref={setProjectsScrollEl}
							className="min-h-0 flex-1 overflow-y-auto no-scrollbar"
						>
							<ProjectGroupsSection model={model} scrollParent={projectsScrollEl} />
						</div>
					)}
					{showDefaultRegion && (
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{defaultSection}</div>
					)}
				</>
			)}

			<ProjectsPanelMenus model={model} />
		</div>
	);
}

import type { JSX, ReactNode, RefObject } from "react";
import { ProjectsPanelSplitHandle } from "../sidebar/ProjectsPanelSplitHandle";

export interface ProjectsPanelViewProps {
	defaultSection: ReactNode;
	/** Host-resolved empty state (i18n). */
	emptyState: ReactNode;
	menus: ReactNode;
	onProjectsScrollRef: (el: HTMLDivElement | null) => void;
	onSplitResize: (deltaY: number) => void;
	onSplitResizeEnd: () => void;
	projectsSection: ReactNode;
	showDefaultRegion: boolean;
	showEmpty: boolean;
	showProjectsRegion: boolean;
	showSplit: boolean;
	splitContainerRef: RefObject<HTMLDivElement | null>;
	splitRatio: number;
}

export function ProjectsPanelView({
	defaultSection,
	emptyState,
	menus,
	onProjectsScrollRef,
	onSplitResize,
	onSplitResizeEnd,
	projectsSection,
	showDefaultRegion,
	showEmpty,
	showProjectsRegion,
	showSplit,
	splitContainerRef,
	splitRatio,
}: ProjectsPanelViewProps): JSX.Element {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 py-0.5">
			{showEmpty && <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">{emptyState}</div>}

			{showSplit ? (
				<div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<div
						ref={onProjectsScrollRef}
						className="min-h-0 overflow-y-auto no-scrollbar"
						style={{ flex: `${splitRatio} 1 0%` }}
					>
						{projectsSection}
					</div>
					<ProjectsPanelSplitHandle onResize={onSplitResize} onResizeEnd={onSplitResizeEnd} />
					<div className="flex min-h-0 flex-col overflow-hidden" style={{ flex: `${1 - splitRatio} 1 0%` }}>
						{defaultSection}
					</div>
				</div>
			) : (
				<>
					{showProjectsRegion && (
						<div ref={onProjectsScrollRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
							{projectsSection}
						</div>
					)}
					{showDefaultRegion && (
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{defaultSection}</div>
					)}
				</>
			)}

			{menus}
		</div>
	);
}

import type { CSSProperties, JSX, ReactNode, RefObject } from "react";
import { ScrollFade } from "../shared/ScrollFade";
import { ProjectsPanelSplitHandle } from "../sidebar/ProjectsPanelSplitHandle";
import { QuickScrollOverlay, type QuickScrollLabels } from "./QuickScrollOverlay";

const SPLIT_HANDLE_HEIGHT = 10;

export interface ProjectsPanelViewProps {
	defaultSection: ReactNode;
	/** Host-resolved empty state (i18n). */
	emptyState: ReactNode;
	menus: ReactNode;
	onProjectsScrollRef: (el: HTMLDivElement | null) => void;
	projectsScrollElement: HTMLElement | null;
	onSplitResize: (deltaY: number) => void;
	onSplitResizeEnd: () => void;
	onSplitResizeStart: () => void;
	projectsSection: ReactNode;
	quickScrollLabels: QuickScrollLabels;
	showDefaultRegion: boolean;
	showEmpty: boolean;
	showProjectsRegion: boolean;
	showSplit: boolean;
	splitDragging: boolean;
	splitContainerRef: RefObject<HTMLDivElement | null>;
	splitRatio: number;
}

export function ProjectsPanelView({
	defaultSection,
	emptyState,
	menus,
	onProjectsScrollRef,
	projectsScrollElement,
	onSplitResize,
	onSplitResizeEnd,
	onSplitResizeStart,
	projectsSection,
	quickScrollLabels,
	showDefaultRegion,
	showEmpty,
	showProjectsRegion,
	showSplit,
	splitDragging,
	splitContainerRef,
	splitRatio,
}: ProjectsPanelViewProps): JSX.Element {
	const projectsScroll = (
		<ScrollFade
			data-sidebar-selection-scroll="true"
			onScrollRef={onProjectsScrollRef}
			className="min-h-0 flex-1 overflow-y-auto no-scrollbar"
		>
			{projectsSection}
		</ScrollFade>
	);

	const splitProjectsStyle: CSSProperties = {
		maxHeight: `calc(${splitRatio * 100}% - ${SPLIT_HANDLE_HEIGHT * splitRatio}px)`,
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 py-0.5">
			{showEmpty && <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">{emptyState}</div>}

			{showSplit ? (
				<div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<QuickScrollOverlay
						labels={quickScrollLabels}
						scrollElement={projectsScrollElement}
						className={`min-h-0 shrink-0 motion-reduce:transition-none ${
							splitDragging ? "" : "transition-[max-height] duration-[350ms] ease-out"
						}`}
						style={splitProjectsStyle}
					>
						{projectsScroll}
					</QuickScrollOverlay>
					<ProjectsPanelSplitHandle
						onResize={onSplitResize}
						onResizeEnd={onSplitResizeEnd}
						onResizeStart={onSplitResizeStart}
					/>
					<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{defaultSection}</div>
				</div>
			) : (
				<>
					{showProjectsRegion && (
						<QuickScrollOverlay
							labels={quickScrollLabels}
							scrollElement={projectsScrollElement}
							className="min-h-0 flex-1"
						>
							{projectsScroll}
						</QuickScrollOverlay>
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

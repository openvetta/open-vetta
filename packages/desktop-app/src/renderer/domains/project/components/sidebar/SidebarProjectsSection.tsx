import type { Dispatch, SetStateAction } from "react";
import type { SessionExecutionMode, SidebarFilter } from "@shared/store/atoms";
import { AddProjectMenu } from "./add-project/AddProjectMenu";
import { SidebarFilterSelect } from "./filters/SidebarFilterSelect";
import { ProjectsPanel } from "./projects/panel/ProjectsPanel";

interface SidebarProjectsSectionProps {
	filter: SidebarFilter;
	listScrollParent: HTMLDivElement | null;
	onOpenSession: (cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>;
	setListScrollParent: Dispatch<SetStateAction<HTMLDivElement | null>>;
}

export function SidebarProjectsSection({
	filter,
	listScrollParent,
	onOpenSession,
	setListScrollParent,
}: SidebarProjectsSectionProps): JSX.Element {
	return (
		<>
			{/* Inline z-index keeps the dropdown above the project list below. */}
			<div
				className="group flex items-center justify-between pb-1 pl-2 pr-3 pt-1"
				style={{ position: "relative", zIndex: 20 }}
			>
				<SidebarFilterSelect />
				<AddProjectMenu />
			</div>
			<div
				ref={setListScrollParent}
				className="project-list-containment flex-1 overflow-y-auto px-1.5 py-0.5"
			>
				<ProjectsPanel
					filter={filter}
					onOpenSession={onOpenSession}
					scrollParent={listScrollParent}
				/>
			</div>
		</>
	);
}

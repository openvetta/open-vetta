import type { SessionExecutionMode, SidebarFilter } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { AddProjectMenu } from "./add-project/AddProjectMenu";
import { SidebarFilterSelect } from "./filters/SidebarFilterSelect";
import { ProjectsPanel } from "./projects/panel/ProjectsPanel";

interface SidebarProjectsSectionProps {
	className?: string;
	classNames?: {
		list?: string;
		toolbar?: string;
	};
	filter: SidebarFilter;
	onOpenSession: (cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>;
}

export function SidebarProjectsSection({
	className,
	classNames,
	filter,
	onOpenSession,
}: SidebarProjectsSectionProps): JSX.Element {
	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			{/* Inline z-index keeps the dropdown above the project list below. */}
			<div
				className={cn("group flex items-center justify-between pb-1 pl-2 pr-3 pt-1", classNames?.toolbar)}
				style={{ position: "relative", zIndex: 20 }}
			>
				<SidebarFilterSelect />
				<AddProjectMenu />
			</div>
			<ProjectsPanel
				defaultSessionListClassName={classNames?.list}
				filter={filter}
				onOpenSession={onOpenSession}
			/>
		</div>
	);
}

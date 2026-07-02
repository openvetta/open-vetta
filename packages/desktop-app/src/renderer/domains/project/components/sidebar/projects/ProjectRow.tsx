import type { Project, ProjectType } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { PROJECT_TYPE_ICONS } from "./projectGroupConstants";
import { RunningPulseDot } from "./RunningPulseDot";

interface ProjectRowProps {
	badge?: string;
	displayName: string;
	expanded: boolean;
	hasRunning: boolean;
	isActive: boolean;
	onCollapse: (cwd: string) => void;
	onExpand: (cwd: string) => void;
	onNavigateProject: (cwd: string) => void;
	onNewSession: (cwd: string) => void;
	onOpenContextMenu: (event: React.MouseEvent, project: Project) => void;
	newSessionTitle: string;
	project: Project;
	projectType: ProjectType;
}

export function ProjectRow({
	badge,
	displayName,
	expanded,
	hasRunning,
	isActive,
	onCollapse,
	onExpand,
	onNavigateProject,
	onNewSession,
	onOpenContextMenu,
	newSessionTitle,
	project,
	projectType,
}: ProjectRowProps): JSX.Element {
	return (
		<div
			className={cn(
				"group flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100",
				isActive ? "bg-primary/15 text-foreground" : "hover:bg-accent/50",
			)}
			title={project.cwd}
			onContextMenu={(event) => onOpenContextMenu(event, project)}
		>
			<ProjectExpandButton
				expanded={expanded}
				hasRunning={hasRunning}
				onClick={() => {
					if (expanded) {
						onCollapse(project.cwd);
						return;
					}
					onExpand(project.cwd);
					onNavigateProject(project.cwd);
				}}
				projectType={projectType}
			/>
			<button
				type="button"
				onClick={() => {
					if (!expanded) {
						onExpand(project.cwd);
					}
					onNavigateProject(project.cwd);
				}}
				className={cn(
					"min-w-0 flex-1 truncate text-left text-[13px] font-medium",
					isActive ? "font-semibold text-foreground" : "text-foreground",
				)}
			>
				{displayName}
			</button>
			<div className="relative flex shrink-0 items-center">
				{badge && (
					<span className="rounded-sm bg-accent px-1 py-px text-[10px] text-muted-foreground group-hover:hidden">
						{badge}
					</span>
				)}
				<button
					type="button"
					title={newSessionTitle}
					onClick={(event) => {
						event.stopPropagation();
						onNewSession(project.cwd);
					}}
					className={cn(
						"flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-foreground hover:bg-accent",
						badge ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100",
					)}
				>
					<span className="icon-[solar--add-circle-linear] h-3 w-3" />
				</button>
			</div>
		</div>
	);
}

function ProjectExpandButton({
	expanded,
	hasRunning,
	onClick,
	projectType,
}: {
	expanded: boolean;
	hasRunning: boolean;
	onClick: () => void;
	projectType: ProjectType;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			className="relative flex shrink-0 items-center justify-center"
		>
			<span
				className={cn(
					expanded ? "icon-[solar--alt-arrow-down-linear]" : PROJECT_TYPE_ICONS[projectType],
					"h-4 w-4 text-foreground",
				)}
			/>
			{hasRunning && <RunningPulseDot />}
		</button>
	);
}

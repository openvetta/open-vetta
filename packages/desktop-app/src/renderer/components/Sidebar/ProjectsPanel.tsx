import { useAtomValue } from "jotai";
import { activeSessionAtom } from "../../store/atoms";
import { useProjects } from "../../hooks/useProjects";
import { ProjectGroup } from "./ProjectGroup";

interface ProjectsPanelProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
}

export function ProjectsPanel({ onOpenSession }: ProjectsPanelProps): JSX.Element {
	const { projects, sessionsMap, expandedProjects, addProject, toggleProject } = useProjects();
	const activeSession = useAtomValue(activeSessionAtom);

	if (projects.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
				<span className="icon-[mdi--folder-open-outline] h-7 w-7 text-[var(--text-3)]" />
				<p className="text-[11px] text-[var(--text-3)]">No projects yet.</p>
				<button
					type="button"
					onClick={() => void addProject()}
					className="text-[11px] font-medium text-[var(--text-2)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text-1)]"
				>
					Add a project
				</button>
			</div>
		);
	}

	return (
		<>
			{projects.map((project) => (
				<ProjectGroup
					key={project.cwd}
					project={project}
					sessions={sessionsMap.get(project.cwd) ?? []}
					isExpanded={expandedProjects.has(project.cwd)}
					activeSessionPath={activeSession?.sessionPath ?? ""}
					onToggle={toggleProject}
					onNewSession={(cwd) => void onOpenSession(cwd)}
					onSelectSession={(cwd, path) => void onOpenSession(cwd, path)}
				/>
			))}
		</>
	);
}

import { useAtomValue } from "jotai";
import { activeSessionAtom } from "../../store/atoms";
import { useProjects } from "../../hooks/useProjects";
import { ProjectGroup } from "./ProjectGroup";
import { SettingsMenu } from "./SettingsMenu";

interface SidebarProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
}

export function Sidebar({ onOpenSession }: SidebarProps): JSX.Element {
	const { projects, sessionsMap, expandedProjects, addProject, toggleProject } = useProjects();
	const activeSession = useAtomValue(activeSessionAtom);

	return (
		<aside className="sidebar-vibrancy flex h-full w-[220px] shrink-0 flex-col">
			{/* macOS traffic light spacer + header */}
			<div className="drag-region flex items-center justify-between px-3.5 pb-3 pt-[52px]">
				<div className="no-drag flex items-center gap-2">
					<div className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-[var(--accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
						<span className="icon-[mdi--shimmer] h-3 w-3 text-[var(--accent-fg)]" />
					</div>
					<span className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
						Vetta
					</span>
				</div>
				<button
					type="button"
					title="Add project"
					onClick={() => void addProject()}
					className="no-drag flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-3)] hover:bg-[var(--hover-strong)] hover:text-[var(--text-2)]"
				>
					<span className="icon-[mdi--plus] h-3.5 w-3.5" />
				</button>
			</div>

			{/* Section label */}
			<div className="px-4 pb-1.5 pt-1">
				<span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
					Projects
				</span>
			</div>

			{/* Project list */}
			<div className="flex-1 overflow-y-auto px-1.5 py-0.5">
				{projects.length === 0 ? (
					<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
						<span className="icon-[mdi--folder-open-outline] h-7 w-7 text-[var(--text-3)]" />
						<p className="text-[11px] text-[var(--text-3)]">
							No projects yet.
						</p>
						<button
							type="button"
							onClick={() => void addProject()}
							className="text-[11px] font-medium text-[var(--text-2)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text-1)]"
						>
							Add a project
						</button>
					</div>
				) : (
					projects.map((project) => (
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
					))
				)}
			</div>

			{/* Bottom settings */}
			<div className="border-t border-[var(--border)] px-1.5 py-1.5">
				<SettingsMenu />
			</div>
		</aside>
	);
}

import { useAtomValue } from "jotai";
import { sidebarTabAtom } from "../../store/atoms";
import { useProjects } from "../../hooks/useProjects";
import { SidebarTabs } from "./SidebarTabs";
import { ProjectsPanel } from "./ProjectsPanel";
import { FilesPanel } from "./FileExplorer/FilesPanel";
import { SettingsMenu } from "./SettingsMenu";

interface SidebarProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
}

export function Sidebar({ onOpenSession }: SidebarProps): JSX.Element {
	const tab = useAtomValue(sidebarTabAtom);
	const { addProject } = useProjects();

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

			{/* Tab switcher */}
			<SidebarTabs />

			{/* Panel content */}
			<div className="flex-1 overflow-y-auto px-1.5 py-0.5">
				{tab === "projects" ? (
					<ProjectsPanel onOpenSession={onOpenSession} />
				) : (
					<FilesPanel />
				)}
			</div>

			{/* Bottom settings */}
			<div className="border-t border-[var(--border)] px-1.5 py-1.5">
				<SettingsMenu />
			</div>
		</aside>
	);
}

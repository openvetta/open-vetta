import { useCallback, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { sidebarTabAtom, sidebarWidthAtom, pageViewAtom, type PageView } from "../../store/atoms";
import { useProjects } from "../../hooks/useProjects";
import { isMac, isWindows } from "../../lib/platform";
import { SidebarTabs } from "./SidebarTabs";
import { AddProjectMenu } from "./AddProjectMenu";
import { ProjectsPanel } from "./ProjectsPanel";
import { FilesPanel } from "./FileExplorer/FilesPanel";
import { SettingsMenu } from "./SettingsMenu";
import { ResizeHandle } from "../ResizeHandle";

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;

interface SidebarProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
}

export function Sidebar({ onOpenSession }: SidebarProps): JSX.Element {
	const tab = useAtomValue(sidebarTabAtom);
	const [pageView, setPageView] = useAtom(pageViewAtom);
	const { createProject } = useProjects();
	const [width, setWidth] = useAtom(sidebarWidthAtom);

	const onResize = useCallback(
		(delta: number) => {
			setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));
		},
		[setWidth],
	);

	return (
		<aside className="sidebar-vibrancy relative flex h-full shrink-0 flex-col" style={{ width }}>
			{/* macOS traffic light spacer + header; Windows uses TitleBar */}
			{isMac && (
				<div className="drag-region flex items-center justify-between px-3.5 pb-3 pt-[52px]">
					<div className="no-drag flex items-center gap-2">
						<img
							src="./icon.png"
							alt="Vetta"
							className="h-[22px] w-[22px] rounded-[6px] shadow-[0-1px-3px_rgba(0,0,0,0.2)]"
						/>
						<span className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
							Vetta
						</span>
					</div>
					<AddProjectMenu className="no-drag" />
				</div>
			)}

			{/* Page nav entries */}
			<nav className="flex flex-col gap-0.5 px-1.5 pb-2">
				{([
					{ key: "automation" as PageView, label: "自动化", icon: "icon-[mdi--robot-outline]" },
					{ key: "skills" as PageView, label: "技能广场", icon: "icon-[mdi--puzzle-outline]" },
				]).map(({ key, label, icon }) => (
					<button
						key={key}
						type="button"
						onClick={() => setPageView(key)}
						className={`no-drag flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
							pageView === key
								? "bg-[var(--hover-strong)] font-medium text-[var(--text-1)]"
								: "text-[var(--text-1)] hover:bg-[var(--hover-strong)]"
						}`}
					>
						<span className={`${icon} h-4 w-4 shrink-0`} />
						{label}
					</button>
				))}
			</nav>

			{/* Section header: title + tab toggle */}
			<div className="flex items-center justify-between px-3.5 pb-1 pt-1">
				<span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-1)]">
					{tab === "projects" ? "项目" : "文件"}
				</span>
				<div className="flex items-center gap-1">
					{isWindows && tab === "projects" && <AddProjectMenu />}
					<SidebarTabs />
				</div>
			</div>

			{/* Panel content */}
			<div className="flex-1 overflow-y-auto px-1.5 py-0.5">
				{tab === "projects" ? (
					<ProjectsPanel onOpenSession={onOpenSession} />
				) : (
					<FilesPanel />
				)}
			</div>

			{/* Settings */}
			<div className="border-t border-[var(--border)] px-1.5 py-1.5">
				<SettingsMenu />
			</div>
			<ResizeHandle side="right" onResize={onResize} />
		</aside>
	);
}
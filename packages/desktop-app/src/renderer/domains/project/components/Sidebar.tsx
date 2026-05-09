import { useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useNavigate, useMatches } from "@tanstack/react-router";
import { sidebarFilterAtom, sidebarWidthAtom } from "@shared/store/atoms";
import { isMac } from "@shared/lib/platform";
import { SidebarFilterSelect } from "./SidebarTabs";
import { AddProjectMenu } from "./AddProjectMenu";
import { ProjectsPanel } from "./ProjectsPanel";
import { SettingsMenu } from "./SettingsMenu";
import { MessageCenter } from "@domains/message/components/MessageCenter";
import { ResizeHandle } from "@shared/components/ResizeHandle";

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;

const NAV_ITEMS = [
	{ path: "/automation" as const, label: "自动化", icon: "icon-[mdi--robot-outline]" },
	{ path: "/batch-tasks" as const, label: "批量任务", icon: "icon-[mdi--format-list-bulleted]" },
	{ path: "/skills" as const, label: "技能广场", icon: "icon-[mdi--puzzle-outline]" },
];

interface SidebarProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
	onCollapse?: () => void;
}

export function Sidebar({ onOpenSession, onCollapse }: SidebarProps): JSX.Element {
	const filter = useAtomValue(sidebarFilterAtom);
	const navigate = useNavigate();
	const matches = useMatches();
	const currentPath = matches[matches.length - 1]?.pathname ?? "/";
	const [width, setWidth] = useAtom(sidebarWidthAtom);

	const onResize = useCallback(
		(delta: number) => {
			setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));
		},
		[setWidth],
	);

	return (
		<aside
			className="sidebar-surface relative flex h-full shrink-0 flex-col overflow-hidden rounded-[10px] border border-border bg-muted"
			style={{ width }}
		>
			{/* Top h-11 row — aligns with PageHeader; reserves macOS traffic-light area, collapse button at right */}
			<div
				className="drag-region flex h-11 shrink-0 items-center justify-between"
				style={{ paddingLeft: isMac ? 78 : 12, paddingRight: 6 }}
			>
				{isMac ? (
					<div />
				) : (
					<div className="flex min-w-0 items-center gap-2">
						<img
							src="./icon.png"
							alt="Vetta"
							className="h-5 w-5 shrink-0 rounded-[5px]"
						/>
						<span className="truncate text-[13px] font-semibold text-foreground">Vetta</span>
					</div>
				)}
				{onCollapse && (
					<button
						type="button"
						onClick={onCollapse}
						title="隐藏侧边栏"
						className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[mdi--dock-left] h-4 w-4" />
					</button>
				)}
			</div>

			{/* Page nav entries (with 新建项目 on top) */}
			<nav className="flex flex-col gap-0.5 px-1.5 pb-2 pt-2">
				<AddProjectMenu variant="navItem" />
				{NAV_ITEMS.map(({ path, label, icon }) => (
					<button
						key={path}
						type="button"
						onClick={() => void navigate({ to: path })}
						className={`no-drag flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
							currentPath === path
								? "bg-primary font-medium text-primary-foreground shadow-[0_4px_14px_-6px_color-mix(in_srgb,var(--primary)_70%,transparent)]"
								: "text-foreground hover:bg-accent"
						}`}
					>
						<span className={`${icon} h-4 w-4 shrink-0`} />
						{label}
					</button>
				))}
			</nav>

			{/* Section header: filter dropdown */}
			<div className="flex items-center justify-between px-3.5 pb-1 pt-1">
				<div className="flex min-w-0 items-center gap-1">
					<SidebarFilterSelect />
				</div>
			</div>

			{/* Panel content */}
			<div className="flex-1 overflow-y-auto px-1.5 py-0.5">
				<ProjectsPanel filter={filter} onOpenSession={onOpenSession} />
			</div>

			{/* Bottom bar: Settings + Message Center */}
			<div className="flex items-center gap-1 px-1.5 py-1.5">
				<div className="flex-1">
					<SettingsMenu />
				</div>
				<MessageCenter />
			</div>
			<ResizeHandle side="right" onResize={onResize} />
		</aside>
	);
}

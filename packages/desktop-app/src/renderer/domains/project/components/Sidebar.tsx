import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useNavigate, useMatches } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
	activeSessionAtom,
	defaultConversationCwdAtom,
	runningSessionPathsAtom,
	SIDEBAR_WIDTH_STORAGE_KEY,
	sidebarFilterAtom,
	sidebarWidthAtom,
} from "@shared/store/atoms";
import { isMac } from "@shared/lib/platform";
import { SidebarFilterSelect } from "./SidebarTabs";
import { AddProjectMenu } from "./AddProjectMenu";
import { ProjectsPanel } from "./ProjectsPanel";
import { SettingsMenu } from "./SettingsMenu";
import { SidebarUpdateButton } from "./SidebarUpdateButton";
import { MessageCenter } from "@domains/message/components/MessageCenter";
import { ResizeHandle } from "@shared/components/ResizeHandle";

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;

const NAV_ITEMS = [
	{
		type: "new-session",
		label: "新会话",
		icon: "icon-[solar--pen-new-square-linear]",
		title: "新会话",
	},
	{ type: "route", path: "/automation" as const, label: "自动化", icon: "icon-[solar--magic-stick-3-linear]" },
	{
		type: "route",
		path: "/batch-tasks" as const,
		label: "批量任务",
		icon: "icon-[solar--checklist-minimalistic-linear]",
	},
	{ type: "route", path: "/skills" as const, label: "技能广场", icon: "icon-[solar--shop-linear]" },
] as const;

interface SidebarProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
	onCollapse?: () => void;
}

interface NavIndicatorBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

function getNavIndicatorBounds(element: HTMLButtonElement): NavIndicatorBounds {
	return {
		left: element.offsetLeft,
		top: element.offsetTop,
		width: element.offsetWidth,
		height: element.offsetHeight,
	};
}

export function Sidebar({ onOpenSession, onCollapse }: SidebarProps): JSX.Element {
	const filter = useAtomValue(sidebarFilterAtom);
	const navigate = useNavigate();
	const matches = useMatches();
	const lastMatch = matches[matches.length - 1];
	const currentPath = lastMatch?.pathname ?? "/";
	const activeSession = useAtomValue(activeSessionAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);
	const navItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const [navIndicatorBounds, setNavIndicatorBounds] = useState<NavIndicatorBounds | null>(null);

	// 「新会话」按钮目标 cwd 解析顺序：
	//   1. 当前路由参数 cwd（/project/$cwd 或 /new-session/$cwd）
	//   2. 当前 activeSession 的 cwd（在 / 路径上时）
	//   3. 默认「对话」项目的 cwd
	const newChatCwd = (() => {
		const params = lastMatch?.params as { cwd?: string } | undefined;
		if (params?.cwd) {
			try {
				return decodeURIComponent(params.cwd);
			} catch {
				return params.cwd;
			}
		}
		if (activeSession?.cwd) return activeSession.cwd;
		return defaultConversationCwd || "";
	})();
	const onNewChat = useCallback(() => {
		if (!newChatCwd) return;
		void navigate({
			to: "/new-session/$cwd",
			params: { cwd: encodeURIComponent(newChatCwd) },
		});
	}, [navigate, newChatCwd]);
	const [width, setWidth] = useAtom(sidebarWidthAtom);
	const widthRef = useRef(width);
	widthRef.current = width;
	const setRunningSessionPaths = useSetAtom(runningSessionPathsAtom);
	const activeNavIndex = NAV_ITEMS.findIndex(
		(item) => item.type === "route" && item.path === currentPath,
	);

	useLayoutEffect(() => {
		const activeElement = navItemRefs.current[activeNavIndex];
		if (!activeElement) {
			setNavIndicatorBounds(null);
			return;
		}
		setNavIndicatorBounds(getNavIndicatorBounds(activeElement));
	}, [activeNavIndex, width]);

	const [imOnline, setImOnline] = useState(false);

	useEffect(() => {
		let cancelled = false;
		let unsub: (() => void) | null = null;
		void (async () => {
			try {
				const unsubFn = await window.vetta.im.subscribeStatus(
					(s) => setImOnline(s.transport === "online" || s.transport === "connecting"),
					() => {},
				);
				if (cancelled) {
					unsubFn();
					return;
				}
				unsub = unsubFn;
				// Initial push from subscribeStatus races with our listener
				// attachment, so fetch once explicitly to seed state.
				const current = await window.vetta.im.getStatus();
				if (!cancelled) setImOnline(current.transport === "online" || current.transport === "connecting");
			} catch {
				// ignore; badge stays hidden
			}
		})();
		return () => {
			cancelled = true;
			unsub?.();
		};
	}, []);

	const onOpenClawSettings = useCallback(() => {
		void navigate({ to: "/settings/$tab", params: { tab: "im" } });
	}, [navigate]);

	useEffect(() => {
		let cancelled = false;
		void window.vetta.session.listRunning().then((paths) => {
			if (cancelled) return;
			setRunningSessionPaths(new Set(paths));
		});
		const unsubscribe = window.vetta.session.onRunningChanged(({ sessionPath, running }) => {
			setRunningSessionPaths((prev: Set<string>) => {
				const had = prev.has(sessionPath);
				if (running && had) return prev;
				if (!running && !had) return prev;
				const next = new Set(prev);
				if (running) next.add(sessionPath);
				else next.delete(sessionPath);
				return next;
			});
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [setRunningSessionPaths]);

	const onResize = useCallback(
		(delta: number) => {
			setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));
		},
		[setWidth],
	);
	const onResizeEnd = useCallback(() => {
		localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(widthRef.current));
	}, []);

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
					<div className="flex min-w-0 items-center">
						<SidebarUpdateButton />
					</div>
				) : (
					<div className="flex min-w-0 items-center gap-2">
						<img
							src="./icon.png"
							alt="Vetta"
							className="h-5 w-5 shrink-0 rounded-[5px]"
						/>
						<span className="truncate text-[13px] font-semibold text-foreground">Vetta</span>
						<SidebarUpdateButton />
					</div>
				)}
				<div className="flex items-center gap-1">
					{imOnline && (
						<button
							type="button"
							onClick={onOpenClawSettings}
							title="Claw 已连接 · 点击打开设置"
							className="no-drag relative flex h-5 items-center gap-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/25"
						>
							<span className="relative flex h-1 w-1">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
								<span className="relative inline-flex h-1 w-1 rounded-full bg-primary" />
							</span>
							Claw
						</button>
					)}
					{onCollapse && (
						<button
							type="button"
							onClick={onCollapse}
							title="隐藏侧边栏"
							className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[solar--sidebar-minimalistic-linear] h-4 w-4" />
						</button>
					)}
				</div>
			</div>

			{/* Page nav entries */}
			<nav className="relative flex flex-col gap-0.5 px-1.5 pb-2 pt-2">
				{navIndicatorBounds && (
					<motion.span
						className="pointer-events-none absolute z-10 rounded-md bg-primary/15"
						initial={false}
						animate={{
							left: navIndicatorBounds.left,
							top: navIndicatorBounds.top,
							width: navIndicatorBounds.width,
							height: navIndicatorBounds.height,
						}}
						transition={{ type: "spring", stiffness: 430, damping: 28, mass: 0.75 }}
					/>
				)}
				{NAV_ITEMS.map((item, index) => {
					const active = item.type === "route" && currentPath === item.path;
					const disabled = item.type === "new-session" && !newChatCwd;
					return (
						<button
							key={item.type === "route" ? item.path : item.type}
							ref={(element) => {
								navItemRefs.current[index] = element;
							}}
							type="button"
							onClick={() => {
								if (disabled) return;
								if (item.type === "new-session") {
									onNewChat();
									return;
								}
								void navigate({ to: item.path });
							}}
							aria-disabled={disabled}
							tabIndex={disabled ? -1 : undefined}
							title={item.type === "new-session" ? item.title : undefined}
							className={`no-drag relative z-20 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
								active
									? "font-semibold text-foreground"
									: `text-foreground ${disabled ? "cursor-not-allowed opacity-50" : "hover:bg-accent/50"}`
							}`}
						>
							<span className={`${item.icon} relative z-10 h-4 w-4 shrink-0`} />
							<span className="relative z-10">{item.label}</span>
						</button>
					);
				})}
			</nav>

			{/* Section header: filter dropdown on the left, 新建项目 icon button on the right.
			    Inline z-index overrides `.sidebar-surface > *` which pins children to z:1,
			    so the dropdown can float above the project list below. */}
			<div
				className="flex items-center justify-between pb-1 pl-2 pr-4 pt-1"
				style={{ position: "relative", zIndex: 20 }}
			>
				<SidebarFilterSelect />
				<AddProjectMenu />
			</div>

			{/* Panel content */}
			<div className="project-list-containment flex-1 overflow-y-auto px-1.5 py-0.5">
				<ProjectsPanel filter={filter} onOpenSession={onOpenSession} />
			</div>

			{/* Bottom bar: Settings + Message Center */}
			<div className="flex items-center gap-1 px-1.5 py-1.5">
				<div className="flex-1">
					<SettingsMenu />
				</div>
				<MessageCenter />
			</div>
			<ResizeHandle side="right" onResize={onResize} onResizeEnd={onResizeEnd} />
		</aside>
	);
}

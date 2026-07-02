import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useNavigate, useMatches } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
	activeSessionAtom,
	conversationBucketCwd,
	defaultConversationCwdAtom,
	SIDEBAR_WIDTH_STORAGE_KEY,
	sidebarFilterAtom,
	sidebarWidthAtom,
} from "@shared/store/atoms";
import { isMac } from "@shared/lib/platform";
import { cn } from "@shared/lib/utils";
import { SidebarFilterSelect } from "./SidebarTabs";
import { AddProjectMenu } from "./AddProjectMenu";
import { ProjectsPanel } from "./ProjectsPanel";
import { SettingsMenu } from "./SettingsMenu";
import { SidebarUpdateButton } from "./SidebarUpdateButton";
import { MessageCenter } from "@domains/message/components/MessageCenter";
import { ResizeHandle } from "@shared/components/ResizeHandle";

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;

// label 在渲染期由 t(labelKey) 解析（模块级常量不存中文，见 AGENTS.md i18n 规范）。
const NAV_ITEMS = [
	{
		type: "new-session",
		labelKey: "sidebar.nav.newSession",
		icon: "icon-[solar--pen-new-square-linear]",
	},
	{ type: "route", path: "/automation" as const, labelKey: "sidebar.nav.automation", icon: "icon-[solar--magic-stick-3-linear]" },
	{
		type: "route",
		path: "/batch-tasks" as const,
		labelKey: "sidebar.nav.batchTasks",
		icon: "icon-[solar--clipboard-check-outline]",
	},
	{
		type: "route",
		path: "/knowledge" as const,
		labelKey: "sidebar.nav.knowledge",
		icon: "icon-[solar--library-linear]",
	},
	{ type: "route", path: "/skills" as const, labelKey: "sidebar.nav.skills", icon: "icon-[solar--widget-5-linear]" },
] as const;

interface SidebarProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
	onCollapse?: () => void;
	// 窄屏浮层模式：顶部横条不设为窗口拖拽区，否则 -webkit-app-region: drag
	// 会吞掉鼠标事件，导致悬停顶部时浮层误触 mouseleave 而消失。
	floating?: boolean;
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

function isRouteActive(path: string, currentPath: string): boolean {
	if (path === "/knowledge") {
		return currentPath === path || currentPath.startsWith(`${path}/`);
	}
	return currentPath === path;
}

export function Sidebar({ onOpenSession, onCollapse, floating = false }: SidebarProps): JSX.Element {
	const { t } = useTranslation("project");
	const filter = useAtomValue(sidebarFilterAtom);
	const navigate = useNavigate();
	const matches = useMatches();
	const lastMatch = matches[matches.length - 1];
	const currentPath = lastMatch?.pathname ?? "/";
	const activeSession = useAtomValue(activeSessionAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);
	const setDefaultConversationCwd = useSetAtom(defaultConversationCwdAtom);
	const navItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const [navIndicatorBounds, setNavIndicatorBounds] = useState<NavIndicatorBounds | null>(null);

	// 「新会话」按钮目标 cwd 解析顺序：
	//   1. 当前路由参数 cwd（/project/$cwd 或 /new-session/$cwd）—— 项目详情聚焦
	//   2. 仅在聊天页（/）时，跟随 activeSession 的 cwd —— 聚焦的是「某项目的会话」时落到该项目。
	//      ADR-0007：默认「对话」session 的运行 cwd 是默认项目根下的 per-session 子目录，
	//      必须归一回项目根，否则新会话会挂到子目录 bucket、不在「会话」列表出现。
	//   3. 其余一切场景（自动化/批量任务/Claw 查看器/设置等）落到默认「会话」项目，
	//      不能沿用残留的 activeSession.cwd，否则会把新会话建到上一个项目里。
	const newChatCwd = (() => {
		const params = lastMatch?.params as { cwd?: string } | undefined;
		if (params?.cwd) {
			try {
				return decodeURIComponent(params.cwd);
			} catch {
				return params.cwd;
			}
		}
		if (currentPath === "/" && activeSession?.cwd) {
			return conversationBucketCwd(activeSession.cwd, defaultConversationCwd);
		}
		return defaultConversationCwd || "";
	})();
	const onNewChat = useCallback(() => {
		void (async () => {
			let targetCwd = newChatCwd;
			if (!targetCwd) {
				try {
					const config = await window.vetta.config.get();
					targetCwd = config.defaultConversationCwd ?? "";
					if (targetCwd) setDefaultConversationCwd(targetCwd);
				} catch (error) {
					console.error("[Sidebar] failed to resolve default conversation cwd", error);
				}
			}
			if (!targetCwd) return;
			void navigate({
				to: "/new-session/$cwd",
				params: { cwd: encodeURIComponent(targetCwd) },
			});
		})();
	}, [navigate, newChatCwd, setDefaultConversationCwd]);
	const [width, setWidth] = useAtom(sidebarWidthAtom);
	const widthRef = useRef(width);
	widthRef.current = width;
	const activeNavIndex = NAV_ITEMS.findIndex(
		(item) => item.type === "route" && isRouteActive(item.path, currentPath),
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
	// 项目列表的滚动容器元素，透传给「对话」虚拟列表作为 customScrollParent，
	// 让其复用此滚动条而非自建独立滚动条（否则展开时侧边栏出现两个滚动条）。
	const [listScrollParent, setListScrollParent] = useState<HTMLDivElement | null>(null);

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
				className={cn(
					"flex h-11 shrink-0 items-center justify-between",
					!floating && "drag-region",
				)}
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
							title={t("sidebar.clawConnected")}
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
							title={t("sidebar.hide")}
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
					const active = item.type === "route" && isRouteActive(item.path, currentPath);
					return (
						<button
							key={item.type === "route" ? item.path : item.type}
							ref={(element) => {
								navItemRefs.current[index] = element;
							}}
							type="button"
							onClick={() => {
								if (item.type === "new-session") {
									onNewChat();
									return;
								}
								void navigate({ to: item.path });
							}}
							title={item.type === "new-session" ? t(item.labelKey) : undefined}
							className={`no-drag relative z-20 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
								active
									? "font-semibold text-foreground"
									: "text-foreground hover:bg-accent/50"
							}`}
						>
							<span className={`${item.icon} relative z-10 h-4 w-4 shrink-0`} />
							<span className="relative z-10">{t(item.labelKey)}</span>
						</button>
					);
				})}
			</nav>

			{/* Section header: filter dropdown on the left, 新建项目 icon button on the right.
			    Inline z-index overrides `.sidebar-surface > *` which pins children to z:1,
			    so the dropdown can float above the project list below. */}
			<div
				className="group flex items-center justify-between pb-1 pl-2 pr-3 pt-1"
				style={{ position: "relative", zIndex: 20 }}
			>
				<SidebarFilterSelect />
				<AddProjectMenu />
			</div>

			{/* Panel content */}
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

import type { SidebarFilter } from "@shared/store/atoms";
import type { Dispatch, RefCallback, SetStateAction } from "react";

export type SidebarLabelKey =
	| "sidebar.nav.newSession"
	| "sidebar.nav.automation"
	| "sidebar.nav.batchTasks"
	| "sidebar.nav.knowledge"
	| "sidebar.nav.skills";

export interface SidebarProps {
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
	onCollapse?: () => void;
	// 窄屏浮层模式：顶部横条不设为窗口拖拽区，否则 -webkit-app-region: drag
	// 会吞掉鼠标事件，导致悬停顶部时浮层误触 mouseleave 而消失。
	floating?: boolean;
}

export interface SidebarNavItem {
	key: string;
	type: "new-session" | "route";
	path?: "/automation" | "/batch-tasks" | "/knowledge" | "/skills";
	labelKey: SidebarLabelKey;
	icon: string;
	badge?: string;
	active: boolean;
	titleLabelKey?: SidebarLabelKey;
}

export interface NavIndicatorBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface SidebarModel {
	width: number;
	floating: boolean;
	filter: SidebarFilter;
	navItems: SidebarNavItem[];
	navIndicatorBounds: NavIndicatorBounds | null;
	imOnline: boolean;
	listScrollParent: HTMLDivElement | null;
	setListScrollParent: Dispatch<SetStateAction<HTMLDivElement | null>>;
	setNavItemRef: (index: number) => RefCallback<HTMLButtonElement>;
	actions: {
		openNavItem(item: SidebarNavItem): void;
		openClawSettings(): void;
		resize(delta: number): void;
		resizeEnd(): void;
		collapse?: () => void;
	};
}

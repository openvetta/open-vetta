import type { RefCallback } from "react";

export type SidebarFilter = "all" | "normal" | "batch" | "flowing";

export interface SidebarClassNames {
	readonly bottomBar?: string;
	readonly bottomBarSettings?: string;
	readonly navigation?: string;
	readonly navIndicator?: string;
	readonly navItem?: string;
	readonly navItemBadge?: string;
	readonly navItemIcon?: string;
	readonly navItemLabel?: string;
	readonly panel?: string;
	readonly panelContent?: string;
	readonly projects?: string;
	readonly projectsList?: string;
	readonly projectsToolbar?: string;
	readonly topBar?: string;
	readonly topBarActions?: string;
	readonly topBarBrand?: string;
	readonly topBarClawButton?: string;
	readonly topBarCollapseButton?: string;
}

export type SidebarLabelKey =
	| "sidebar.nav.newSession"
	| "sidebar.nav.automation"
	| "sidebar.nav.batchTasks"
	| "sidebar.nav.knowledge"
	| "sidebar.nav.skills";

export interface SidebarProps {
	readonly onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
	readonly onCollapse?: () => void;
	readonly classNames?: SidebarClassNames;
	readonly floating?: boolean;
}

export type SidebarModelInput = Pick<SidebarProps, "floating" | "onCollapse">;

export interface SidebarRegionProps {
	readonly classNames?: SidebarClassNames;
	readonly model: SidebarModel;
	readonly onOpenSession: SidebarProps["onOpenSession"];
}

export interface SidebarNavItem {
	readonly active: boolean;
	readonly badge?: string;
	readonly icon: string;
	readonly key: string;
	readonly labelKey: SidebarLabelKey;
	readonly path?: "/automation" | "/batch-tasks" | "/knowledge" | "/skills";
	readonly titleLabelKey?: SidebarLabelKey;
	readonly type: "new-session" | "route";
}

export interface NavIndicatorBounds {
	readonly height: number;
	readonly left: number;
	readonly top: number;
	readonly width: number;
}

export interface SidebarModel {
	readonly actions: {
		readonly collapse?: () => void;
		readonly openClawSettings: () => void;
		readonly openNavItem: (item: SidebarNavItem) => void;
		readonly resize: (delta: number) => void;
		readonly resizeEnd: () => void;
	};
	readonly filter: SidebarFilter;
	readonly floating: boolean;
	readonly imOnline: boolean;
	readonly navIndicatorBounds: NavIndicatorBounds | null;
	readonly navItems: readonly SidebarNavItem[];
	readonly setNavItemRef: (index: number) => RefCallback<HTMLButtonElement>;
	readonly width: number;
}

export interface SidebarThemeHost {
	readonly useSidebarModel: (input: SidebarModelInput) => SidebarModel;
}

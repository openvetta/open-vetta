import type { ComponentType } from "react";
import type { SidebarNavItemButton } from "./SidebarNavItemButton";
import type { SidebarNavigationProps } from "./SidebarNavigation";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "sidebar.navItem"?: typeof SidebarNavItemButton;
		readonly "sidebar.navigation"?: ComponentType<SidebarNavigationProps>;
	}
}

export type {
	NavIndicatorBounds,
	SidebarClassNames,
	SidebarFilter,
	SidebarLabelKey,
	SidebarModel,
	SidebarModelInput,
	SidebarNavItem,
	SidebarProps,
	SidebarRegionProps,
} from "@vetta/theme-sdk/sidebar";
export type { DefaultSidebarProps } from "./DefaultSidebar";
export { DefaultSidebar } from "./DefaultSidebar";
export { RunningPulseDot } from "./RunningPulseDot";
export type { SessionStatusIconProps } from "./SessionStatusIcon";
export { SessionStatusIcon } from "./SessionStatusIcon";
export type { ShowMoreSessionsButtonLabels, ShowMoreSessionsButtonProps } from "./ShowMoreSessionsButton";
export { ShowMoreSessionsButton } from "./ShowMoreSessionsButton";
export type { SidebarNavItemButtonProps } from "./SidebarNavItemButton";
export { SidebarNavItemButton } from "./SidebarNavItemButton";
export type { SidebarNavigationProps } from "./SidebarNavigation";
export { SidebarNavigation } from "./SidebarNavigation";
export type { SidebarPanelProps } from "./SidebarPanel";
export { SidebarPanel } from "./SidebarPanel";
export type {
	SidebarTopBarClassNames,
	SidebarTopBarLabels,
	SidebarTopBarProps,
} from "./SidebarTopBar";
export { SidebarTopBar } from "./SidebarTopBar";
export type { SidebarUpdateIconProps } from "./SidebarUpdateIcon";
export { SidebarUpdateIcon } from "./SidebarUpdateIcon";

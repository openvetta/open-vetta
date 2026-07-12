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
export type { AddProjectMenuItemProps } from "./AddProjectMenuItem";
export { AddProjectMenuItem } from "./AddProjectMenuItem";
export type {
	AddProjectMenuPopoverItem,
	AddProjectMenuPopoverViewProps,
} from "./AddProjectMenuPopoverView";
export { AddProjectMenuPopoverView } from "./AddProjectMenuPopoverView";
export type { AddProjectMenuTriggerViewProps } from "./AddProjectMenuTriggerView";
export { AddProjectMenuTriggerView } from "./AddProjectMenuTriggerView";
export type { DefaultSidebarProps } from "./DefaultSidebar";
export { DefaultSidebar } from "./DefaultSidebar";
export type { MessageCenterEmptyStateProps } from "./MessageCenterEmptyState";
export { MessageCenterEmptyState } from "./MessageCenterEmptyState";
export type {
	MessageCenterTabId,
	MessageCenterTabItem,
	MessageCenterTabsProps,
} from "./MessageCenterTabs";
export { MessageCenterTabs } from "./MessageCenterTabs";
export type { MessageCenterToolbarButtonProps } from "./MessageCenterToolbarButton";
export { MessageCenterToolbarButton } from "./MessageCenterToolbarButton";
export type { ProjectsPanelEmptyStateLabels, ProjectsPanelEmptyStateProps } from "./ProjectsPanelEmptyState";
export { ProjectsPanelEmptyState } from "./ProjectsPanelEmptyState";
export type { ProjectsPanelSplitHandleProps } from "./ProjectsPanelSplitHandle";
export { ProjectsPanelSplitHandle } from "./ProjectsPanelSplitHandle";
export { RunningPulseDot } from "./RunningPulseDot";
export type { SessionStatusIconProps } from "./SessionStatusIcon";
export { SessionStatusIcon } from "./SessionStatusIcon";
export type { SettingsMenuAccountSectionProps } from "./SettingsMenuAccountSection";
export { SettingsMenuAccountSection } from "./SettingsMenuAccountSection";
export type { SettingsMenuActionButtonProps } from "./SettingsMenuActionButton";
export { SettingsMenuActionButton } from "./SettingsMenuActionButton";
export { SettingsMenuDivider } from "./SettingsMenuDivider";
export type { SettingsMenuDownloadsItemProps } from "./SettingsMenuDownloadsItem";
export { SettingsMenuDownloadsItem } from "./SettingsMenuDownloadsItem";
export type { SettingsMenuQuotaSectionProps } from "./SettingsMenuQuotaSection";
export { SettingsMenuQuotaSection } from "./SettingsMenuQuotaSection";
export type { SettingsMenuSettingsItemProps } from "./SettingsMenuSettingsItem";
export { SettingsMenuSettingsItem } from "./SettingsMenuSettingsItem";
export type { SettingsMenuThemeOption, SettingsMenuThemeSectionProps } from "./SettingsMenuThemeSection";
export { SettingsMenuThemeSection } from "./SettingsMenuThemeSection";
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

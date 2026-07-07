import type { SidebarNavItemButton } from "@domains/project/components/sidebar/SidebarNavItemButton";
import type { SidebarNavigationProps } from "@domains/project/components/sidebar/SidebarNavigation";
import type { ComponentType } from "react";

export type { SidebarNavItemButtonProps } from "@domains/project/components/sidebar/SidebarNavItemButton";
export { SidebarNavItemButton } from "@domains/project/components/sidebar/SidebarNavItemButton";
export type { SidebarNavigationProps } from "@domains/project/components/sidebar/SidebarNavigation";
export { SidebarNavigation } from "@domains/project/components/sidebar/SidebarNavigation";
export type {
	NavIndicatorBounds,
	SidebarNavItem,
} from "@domains/project/components/sidebar/types";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "sidebar.navItem"?: typeof SidebarNavItemButton;
		readonly "sidebar.navigation"?: ComponentType<SidebarNavigationProps>;
	}
}

import type { SidebarNavItemButton } from "@domains/project/components/sidebar/SidebarNavItemButton";
import type { SettingsMenuTrigger } from "@domains/project/components/sidebar/settings-menu/SettingsMenuTrigger";
import type { SidebarRegionProps } from "@domains/project/components/sidebar/types";
import type {
	PageHeaderRegionProps,
	PageHeaderSidebarTrigger,
	PageHeaderTitle,
	PageHeaderWindowActions,
} from "@shared/app-shell/page-header";
import type { WindowControlButton, WindowControlsComponentProps } from "@shared/app-shell/window-controls";
import type { ThemeSurfaceConfig } from "@vetta/theme-sdk";
import type { ComponentType } from "react";

declare module "@vetta/theme-sdk" {
	interface ThemeRegionRegistry {
		readonly "app.pageHeader"?: ComponentType<PageHeaderRegionProps>;
		readonly sidebar?: ComponentType<SidebarRegionProps>;
	}

	interface ThemeComponentRegistry {
		readonly "app.pageHeaderSidebarTrigger"?: typeof PageHeaderSidebarTrigger;
		readonly "app.pageHeaderTitle"?: typeof PageHeaderTitle;
		readonly "app.pageHeaderWindowActions"?: typeof PageHeaderWindowActions;
		readonly "app.windowControls"?: ComponentType<WindowControlsComponentProps>;
		readonly "app.windowControlButton"?: typeof WindowControlButton;
		readonly "sidebar.navItem"?: typeof SidebarNavItemButton;
		readonly "sidebar.settingsTrigger"?: typeof SettingsMenuTrigger;
	}

	interface ThemeSurfaceRegistry {
		readonly "app.pageHeader"?: ThemeSurfaceConfig;
		readonly "app.windowControls"?: ThemeSurfaceConfig;
		readonly "sidebar.panel"?: ThemeSurfaceConfig;
		readonly "sidebar.topBar"?: ThemeSurfaceConfig;
		readonly "sidebar.navigation"?: ThemeSurfaceConfig;
		readonly "sidebar.projects"?: ThemeSurfaceConfig;
		readonly "sidebar.bottomBar"?: ThemeSurfaceConfig;
		readonly "sidebar.settingsMenu"?: ThemeSurfaceConfig;
		readonly "sidebar.messageCenter"?: ThemeSurfaceConfig;
	}
}

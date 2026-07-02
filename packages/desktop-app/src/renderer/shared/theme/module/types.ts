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
import type { ComponentType } from "react";
import type { ThemeAppearance } from "../appearance";

export interface ThemeMeta {
	readonly id: string;
	readonly name: string;
	readonly sdkVersion: string;
	readonly version: string;
}

export interface ThemeRegionRegistry {
	readonly "app.pageHeader"?: ComponentType<PageHeaderRegionProps>;
	readonly sidebar?: ComponentType<SidebarRegionProps>;
}

export interface ThemeComponentRegistry {
	readonly "app.pageHeaderSidebarTrigger"?: typeof PageHeaderSidebarTrigger;
	readonly "app.pageHeaderTitle"?: typeof PageHeaderTitle;
	readonly "app.pageHeaderWindowActions"?: typeof PageHeaderWindowActions;
	readonly "app.windowControls"?: ComponentType<WindowControlsComponentProps>;
	readonly "app.windowControlButton"?: typeof WindowControlButton;
	readonly "sidebar.navItem"?: typeof SidebarNavItemButton;
	readonly "sidebar.settingsTrigger"?: typeof SettingsMenuTrigger;
}

export type ThemeRegionId = keyof ThemeRegionRegistry;

export type ThemeComponentId = keyof ThemeComponentRegistry;

export interface ThemeModule {
	readonly appearance?: ThemeAppearance;
	readonly components?: ThemeComponentRegistry;
	readonly meta: ThemeMeta;
	readonly regions?: ThemeRegionRegistry;
}

export const DEFAULT_THEME_MODULE: ThemeModule = {
	meta: {
		id: "default",
		name: "Default",
		sdkVersion: "0.1.0",
		version: "0.1.0",
	},
};

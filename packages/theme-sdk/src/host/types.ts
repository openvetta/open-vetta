import type { ReactNode } from "react";
import type { AppShellThemeHost } from "../app-shell";
import type { ThemePagesThemeHost } from "../pages";
import type { RoutingThemeHost } from "../routing";
import type { SidebarThemeHost } from "../sidebar";

export interface ThemeHost {
	readonly appShell?: AppShellThemeHost;
	readonly pages?: ThemePagesThemeHost;
	readonly routing?: RoutingThemeHost;
	readonly sidebar?: SidebarThemeHost;
}

export interface ThemeHostProviderProps {
	readonly children: ReactNode;
	readonly host: ThemeHost;
}

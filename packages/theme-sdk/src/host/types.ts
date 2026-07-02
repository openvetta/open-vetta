import type { ReactNode } from "react";
import type { AppShellThemeHost } from "../app-shell";
import type { SidebarThemeHost } from "../sidebar";

export interface ThemeHost {
	readonly appShell?: AppShellThemeHost;
	readonly sidebar?: SidebarThemeHost;
}

export interface ThemeHostProviderProps {
	readonly children: ReactNode;
	readonly host: ThemeHost;
}

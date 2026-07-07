import type { ComponentType } from "react";

export type ThemePageLayout = "content" | "main" | "app";

export interface ThemePageProps {
	readonly layout: ThemePageLayout;
	readonly pageId: string;
	readonly themeId: string;
}

export interface ThemePageDefinition {
	readonly component: ComponentType<ThemePageProps>;
	readonly id: string;
	readonly layout?: ThemePageLayout;
	readonly nav?: {
		readonly icon?: string;
		readonly order?: number;
	};
	readonly title: Readonly<Record<string, string>>;
}

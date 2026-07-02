import type { ThemeAppearance } from "../appearance";

export interface ThemeMeta {
	readonly id: string;
	readonly name: string;
	readonly sdkVersion: string;
	readonly version: string;
}

export type ThemeRegionRegistry = Record<string, unknown>;

export type ThemeComponentRegistry = Record<string, unknown>;

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

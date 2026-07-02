import type { ThemeAppearance } from "../appearance";

export interface ThemeMeta {
	readonly id: string;
	readonly name: string;
	readonly sdkVersion: string;
	readonly version: string;
}

export interface ThemeRegionRegistry {}

export interface ThemeComponentRegistry {}

export type ThemeRegionId = Extract<keyof ThemeRegionRegistry, string>;

export type ThemeComponentId = Extract<keyof ThemeComponentRegistry, string>;

export interface ThemeModule {
	readonly appearance?: ThemeAppearance;
	readonly components?: Partial<ThemeComponentRegistry>;
	readonly meta: ThemeMeta;
	readonly regions?: Partial<ThemeRegionRegistry>;
}

export const DEFAULT_THEME_MODULE: ThemeModule = {
	meta: {
		id: "default",
		name: "Default",
		sdkVersion: "0.1.0",
		version: "0.1.0",
	},
};

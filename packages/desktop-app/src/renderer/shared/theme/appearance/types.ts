import type { CornerImageFrameDecoration } from "@shared/components/CornerImageFrame";

export type ThemeSurfaceSlot =
	| "sidebar.panel"
	| "sidebar.topBar"
	| "sidebar.navigation"
	| "sidebar.projects"
	| "sidebar.bottomBar"
	| "sidebar.settingsMenu"
	| "sidebar.messageCenter";

export interface CornerImageSurfaceFrame {
	readonly kind: "corner-image";
	readonly decoration: CornerImageFrameDecoration;
	readonly imageUrl: string;
}

export type ThemeSurfaceFrame = CornerImageSurfaceFrame;

export interface ThemeSurfaceConfig {
	readonly frame?: ThemeSurfaceFrame;
	readonly surfaceClassName?: string;
}

export interface ThemeAppearance {
	readonly surfaces?: Partial<Record<ThemeSurfaceSlot, ThemeSurfaceConfig>>;
}

export const DEFAULT_THEME_APPEARANCE: ThemeAppearance = {
	surfaces: {},
};

export interface ThemeSurfaceRegistry {}

export type ThemeSurfaceSlot = Extract<keyof ThemeSurfaceRegistry, string>;

export interface CornerImageFrameCorner {
	readonly backgroundPosition: string;
	readonly id: string;
	readonly position: {
		readonly bottom?: string;
		readonly left?: string;
		readonly right?: string;
		readonly top?: string;
	};
}

export interface CornerImageFrameDecoration {
	readonly backgroundSize: string;
	readonly cornerHeight: string;
	readonly corners: readonly CornerImageFrameCorner[];
	readonly cornerWidth: string;
}

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

import type { ThemeDef } from "../tokens";

// 海洋主题：以深海蓝/青绿为基调，primary 由 indigo 替换为 cyan。
// 字体、阴影、圆角沿用默认主题。

const FONT_SANS = '-apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif';
const FONT_SERIF = "Georgia, serif";
const FONT_MONO = '"SF Mono", "Fira Code", monospace';

const SHADOW_2XS = "0px 1px 2px 0px hsl(0 0% 0% / 0.09)";
const SHADOW_XS = "0px 1px 2px 0px hsl(0 0% 0% / 0.09)";
const SHADOW_SM = "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 1px 2px -1px hsl(0 0% 0% / 0.18)";
const SHADOW = "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 1px 2px -1px hsl(0 0% 0% / 0.18)";
const SHADOW_MD = "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 2px 4px -1px hsl(0 0% 0% / 0.18)";
const SHADOW_LG = "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 4px 6px -1px hsl(0 0% 0% / 0.18)";
const SHADOW_XL = "0px 1px 2px 0px hsl(0 0% 0% / 0.18), 0px 8px 10px -1px hsl(0 0% 0% / 0.18)";
const SHADOW_2XL = "0px 1px 2px 0px hsl(0 0% 0% / 0.45)";

export const oceanTheme: ThemeDef = {
	id: "ocean",
	label: "海洋",
	dark: {
		background: "rgb(13, 24, 33)",
		foreground: "rgb(226, 240, 248)",
		card: "rgb(18, 31, 42)",
		cardForeground: "rgb(226, 240, 248)",
		popover: "rgb(22, 37, 50)",
		popoverForeground: "rgb(226, 240, 248)",
		primary: "rgb(34, 211, 238)",
		primaryForeground: "rgb(8, 18, 26)",
		secondary: "rgb(26, 42, 56)",
		secondaryForeground: "rgb(226, 240, 248)",
		muted: "rgb(19, 33, 45)",
		mutedForeground: "rgb(144, 168, 184)",
		accent: "rgb(28, 50, 66)",
		accentForeground: "rgb(226, 240, 248)",
		destructive: "rgb(248, 113, 113)",
		destructiveForeground: "rgb(0, 0, 0)",
		border: "rgb(32, 52, 68)",
		input: "rgb(36, 58, 76)",
		ring: "rgb(103, 232, 249)",
		chart1: "rgb(255, 174, 4)",
		chart2: "rgb(34, 211, 238)",
		chart3: "rgb(116, 116, 116)",
		chart4: "rgb(82, 82, 82)",
		chart5: "rgb(228, 228, 228)",
		fontSans: FONT_SANS,
		fontSerif: FONT_SERIF,
		fontMono: FONT_MONO,
		radius: "0.5rem",
		shadow2xs: SHADOW_2XS,
		shadowXs: SHADOW_XS,
		shadowSm: SHADOW_SM,
		shadow: SHADOW,
		shadowMd: SHADOW_MD,
		shadowLg: SHADOW_LG,
		shadowXl: SHADOW_XL,
		shadow2xl: SHADOW_2XL,
	},
	light: {
		background: "rgb(246, 251, 253)",
		foreground: "rgb(8, 24, 36)",
		card: "rgb(255, 255, 255)",
		cardForeground: "rgb(8, 24, 36)",
		popover: "rgb(246, 251, 253)",
		popoverForeground: "rgb(8, 24, 36)",
		primary: "rgb(8, 145, 178)",
		primaryForeground: "rgb(255, 255, 255)",
		secondary: "rgb(225, 240, 246)",
		secondaryForeground: "rgb(8, 24, 36)",
		muted: "rgb(241, 245, 247)",
		mutedForeground: "rgb(71, 96, 112)",
		accent: "rgb(217, 236, 244)",
		accentForeground: "rgb(8, 24, 36)",
		destructive: "rgb(220, 38, 38)",
		destructiveForeground: "rgb(255, 255, 255)",
		border: "rgb(196, 220, 230)",
		input: "rgb(196, 220, 230)",
		ring: "rgb(8, 145, 178)",
		chart1: "rgb(255, 174, 4)",
		chart2: "rgb(8, 145, 178)",
		chart3: "rgb(164, 164, 164)",
		chart4: "rgb(228, 228, 228)",
		chart5: "rgb(116, 116, 116)",
		fontSans: FONT_SANS,
		fontSerif: FONT_SERIF,
		fontMono: FONT_MONO,
		radius: "0.5rem",
		shadow2xs: SHADOW_2XS,
		shadowXs: SHADOW_XS,
		shadowSm: SHADOW_SM,
		shadow: SHADOW,
		shadowMd: SHADOW_MD,
		shadowLg: SHADOW_LG,
		shadowXl: SHADOW_XL,
		shadow2xl: SHADOW_2XL,
	},
};

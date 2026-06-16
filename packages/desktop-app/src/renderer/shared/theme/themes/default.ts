import type { ThemeDef } from "../tokens";

// 与 styles.css 中原 [data-theme="dark"] / [data-theme="light"] 字节级一致。
// 这是存量用户升级后的默认外观。

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

export const defaultTheme: ThemeDef = {
	id: "default",
	label: "经典",
	dark: {
		background: "rgb(20, 22, 30)",
		foreground: "rgb(240, 242, 248)",
		card: "rgb(26, 28, 36)",
		cardForeground: "rgb(240, 242, 248)",
		popover: "rgb(50, 53, 67)",
		popoverForeground: "rgb(240, 242, 248)",
		primary: "rgb(99, 102, 241)",
		primaryForeground: "rgb(255, 255, 255)",
		secondary: "rgb(36, 38, 48)",
		secondaryForeground: "rgb(240, 242, 248)",
		muted: "rgb(28, 30, 38)",
		mutedForeground: "rgb(155, 161, 178)",
		accent: "rgb(38, 41, 52)",
		accentForeground: "rgb(240, 242, 248)",
		destructive: "rgb(255, 91, 91)",
		destructiveForeground: "rgb(0, 0, 0)",
		border: "rgb(42, 45, 56)",
		input: "rgb(48, 51, 64)",
		ring: "rgb(129, 132, 248)",
		chart1: "rgb(255, 174, 4)",
		chart2: "rgb(38, 113, 244)",
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
		background: "rgb(252, 252, 252)",
		foreground: "rgb(0, 0, 0)",
		card: "rgb(255, 255, 255)",
		cardForeground: "rgb(0, 0, 0)",
		popover: "rgb(255, 255, 255)",
		popoverForeground: "rgb(0, 0, 0)",
		primary: "rgb(79, 70, 229)",
		primaryForeground: "rgb(255, 255, 255)",
		secondary: "rgb(235, 235, 235)",
		secondaryForeground: "rgb(0, 0, 0)",
		muted: "rgb(242, 242, 245)",
		mutedForeground: "rgb(82, 82, 82)",
		accent: "rgb(235, 235, 235)",
		accentForeground: "rgb(0, 0, 0)",
		destructive: "rgb(229, 75, 79)",
		destructiveForeground: "rgb(255, 255, 255)",
		border: "rgb(213, 213, 216)",
		input: "rgb(213, 213, 216)",
		ring: "rgb(79, 70, 229)",
		chart1: "rgb(255, 174, 4)",
		chart2: "rgb(45, 98, 239)",
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

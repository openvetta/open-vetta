import type { ThemeDef } from "../tokens";

// GitHub 主题：配色参照 GitHub Primer 官方 token。
// light 取 GitHub Light，dark 取 GitHub Dark；primary 用 GitHub 标志性绿色主按钮
// (light #1f883d / dark #238636)，accent 用 Primer 蓝色链接色。
// 字体、阴影沿用其它主题，圆角按 GitHub 习惯使用 0.375rem。

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

export const githubTheme: ThemeDef = {
	id: "github",
	label: "GitHub",
	dark: {
		background: "rgb(13, 17, 23)",
		foreground: "rgb(230, 237, 243)",
		card: "rgb(22, 27, 34)",
		cardForeground: "rgb(230, 237, 243)",
		popover: "rgb(22, 27, 34)",
		popoverForeground: "rgb(230, 237, 243)",
		primary: "rgb(35, 134, 54)",
		primaryForeground: "rgb(255, 255, 255)",
		secondary: "rgb(33, 38, 45)",
		secondaryForeground: "rgb(230, 237, 243)",
		muted: "rgb(22, 27, 34)",
		mutedForeground: "rgb(139, 148, 158)",
		accent: "rgb(28, 51, 38)",
		accentForeground: "rgb(63, 185, 80)",
		destructive: "rgb(248, 81, 73)",
		destructiveForeground: "rgb(255, 255, 255)",
		border: "rgb(48, 54, 61)",
		input: "rgb(48, 54, 61)",
		ring: "rgb(35, 134, 54)",
		chart1: "rgb(63, 185, 80)",
		chart2: "rgb(47, 129, 247)",
		chart3: "rgb(163, 113, 247)",
		chart4: "rgb(210, 153, 34)",
		chart5: "rgb(248, 81, 73)",
		fontSans: FONT_SANS,
		fontSerif: FONT_SERIF,
		fontMono: FONT_MONO,
		radius: "0.375rem",
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
		background: "rgb(255, 255, 255)",
		foreground: "rgb(31, 35, 40)",
		card: "rgb(246, 248, 250)",
		cardForeground: "rgb(31, 35, 40)",
		popover: "rgb(255, 255, 255)",
		popoverForeground: "rgb(31, 35, 40)",
		primary: "rgb(31, 136, 61)",
		primaryForeground: "rgb(255, 255, 255)",
		secondary: "rgb(246, 248, 250)",
		secondaryForeground: "rgb(31, 35, 40)",
		muted: "rgb(246, 248, 250)",
		mutedForeground: "rgb(101, 109, 118)",
		accent: "rgb(218, 251, 225)",
		accentForeground: "rgb(26, 127, 55)",
		destructive: "rgb(207, 34, 46)",
		destructiveForeground: "rgb(255, 255, 255)",
		border: "rgb(208, 215, 222)",
		input: "rgb(208, 215, 222)",
		ring: "rgb(31, 136, 61)",
		chart1: "rgb(31, 136, 61)",
		chart2: "rgb(9, 105, 218)",
		chart3: "rgb(130, 80, 223)",
		chart4: "rgb(191, 135, 0)",
		chart5: "rgb(207, 34, 46)",
		fontSans: FONT_SANS,
		fontSerif: FONT_SERIF,
		fontMono: FONT_MONO,
		radius: "0.375rem",
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

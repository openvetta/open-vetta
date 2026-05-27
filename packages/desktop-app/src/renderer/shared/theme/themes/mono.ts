import type { ThemeDef } from "../tokens";
import { defaultTheme } from "./default";

// 黑白主题：默认主题的基础上把主色替换为黑/白。
// 深色模式 primary = 白，浅色模式 primary = 黑；ring 与 primary 一致。

export const monoTheme: ThemeDef = {
	id: "mono",
	label: "黑白",
	dark: {
		...defaultTheme.dark,
		background: "rgb(8, 8, 10)",
		primary: "rgb(245, 245, 245)",
		primaryForeground: "rgb(8, 8, 10)",
		ring: "rgb(245, 245, 245)",
		// 抬高 accent 与 popover/card 的色差，确保 dropdown hover 可见
		accent: "rgb(58, 62, 78)",
	},
	light: {
		...defaultTheme.light,
		background: "rgb(255, 255, 255)",
		primary: "rgb(0, 0, 0)",
		primaryForeground: "rgb(255, 255, 255)",
		ring: "rgb(0, 0, 0)",
		accent: "rgb(218, 218, 218)",
	},
};

import type { ThemeDef } from "../tokens";
import { defaultTheme } from "./default";

// 「默认」主题：经典色板基础上把主色替换为黑/白。
// 深色模式 primary = 白，浅色模式 primary = 黑；ring 与 primary 一致。

export const monoTheme: ThemeDef = {
	id: "mono",
	label: "默认",
	dark: {
		...defaultTheme.dark,
		background: "rgb(10, 10, 10)",
		muted: "rgb(22, 22, 22)",
		card: "rgb(18, 18, 18)",
		// 覆盖经典偏蓝 popover/border，侧栏设置菜单等浮层保持中性灰
		popover: "rgb(28, 28, 28)",
		popoverForeground: "rgb(245, 245, 245)",
		border: "rgb(42, 42, 42)",
		input: "rgb(48, 48, 48)",
		primary: "rgb(245, 245, 245)",
		primaryForeground: "rgb(8, 8, 10)",
		ring: "rgb(245, 245, 245)",
		// hover（card / popover item 的 hover:bg-accent）；须明显高于 popover(28)
		accent: "rgb(48, 48, 48)",
	},
	light: {
		...defaultTheme.light,
		// 纯白画布；card 略压深以便与 bg 分层
		background: "rgb(255, 255, 255)",
		card: "rgb(248, 248, 248)",
		popover: "rgb(255, 255, 255)",
		muted: "rgb(250, 250, 250)",
		// secondary 略深于 muted，便于 bg-secondary 可辨
		secondary: "rgb(240, 240, 241)",
		// 比经典浅色 border 更浅，避免灰框过重
		border: "rgb(238, 238, 238)",
		input: "rgb(238, 238, 238)",
		primary: "rgb(0, 0, 0)",
		primaryForeground: "rgb(255, 255, 255)",
		ring: "rgb(0, 0, 0)",
		// card hover；略深于 card，但不过重
		accent: "rgb(232, 232, 232)",
	},
};

import type { ThemeDef } from "../tokens";
import { sandTheme } from "./sand";

// 「测试」主题：从「默认」(sand) 复制。
// 主题色 #f76f53；dark/light 各套背景层级见下方常量。
//
// dark accent 刻意抬高：卡片 hover 用 bg-accent，dropdown item 用 hover:bg-accent/50，
// 若 accent 过低则 /50 叠在 popover 上几乎不可辨。popover 与 card 对齐，避免继承 sand 暖灰。

const PRIMARY = "rgb(247, 111, 83)"; // #f76f53
const PRIMARY_FG = "rgb(255, 255, 255)";

// ── dark ──
const DARK_BG = "rgb(32, 32, 32)"; // #202020
const DARK_MUTED = "rgb(30, 30, 30)"; // #1e1e1e
const DARK_SECONDARY = "rgb(26, 26, 26)"; // 略深于 muted
const DARK_CARD = "rgb(28, 28, 28)"; // #1c1c1c
// 下拉面板与 card 同色；hover 在此面上叠 accent/50
const DARK_POPOVER = DARK_CARD;
// 高于 card 足够一档，保证 bg-accent 与 accent/50 都可辨
const DARK_ACCENT = "rgb(69, 69, 69)"; // #454545

// ── light（暖纸色阶）──
const LIGHT_BG = "rgb(242, 240, 227)"; // #f2f0e3
const LIGHT_MUTED = "rgb(238, 236, 223)"; // #eeecdf
// secondary 用于用户消息气泡（bg-secondary）：须明显深于背景，不能跟「略浅于 muted」同档
const LIGHT_SECONDARY = "rgb(232, 226, 208)"; // #e8e2d0
const LIGHT_CARD = "rgb(247, 246, 238)"; // #f7f6ee
const LIGHT_POPOVER = LIGHT_CARD;
const LIGHT_ACCENT = "rgb(232, 230, 218)"; // #e8e6da

export const testTheme: ThemeDef = {
	id: "test",
	label: "测试",
	dark: {
		...sandTheme.dark,
		background: DARK_BG,
		muted: DARK_MUTED,
		secondary: DARK_SECONDARY,
		card: DARK_CARD,
		popover: DARK_POPOVER,
		accent: DARK_ACCENT,
		primary: PRIMARY,
		primaryForeground: PRIMARY_FG,
		ring: PRIMARY,
	},
	light: {
		...sandTheme.light,
		background: LIGHT_BG,
		muted: LIGHT_MUTED,
		secondary: LIGHT_SECONDARY,
		card: LIGHT_CARD,
		popover: LIGHT_POPOVER,
		accent: LIGHT_ACCENT,
		primary: PRIMARY,
		primaryForeground: PRIMARY_FG,
		ring: PRIMARY,
	},
};

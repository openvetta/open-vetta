import { parseThemeTokens } from "../canvas/theme-tokens";
import type { FrameSize } from "../vetd/manifest-types";
import { PLACEHOLDER_THEME_MARK } from "../vetd/scaffold";

/**
 * 顶部条按面板宽度逐级收，保证始终一行、不换行：
 * - 宽于 ICONS_BELOW：全部带文字；
 * - 窄于 ICONS_BELOW：「切换设备」和「浏览器打开」收成图标；
 * - 窄于 HIDE_ROUTE_BELOW：连路由胶囊（后退 / 前进 / 刷新 / 首页 / 路径 / 页面）也收起，
 *   靠页面里的链接点着走。
 *
 * 阈值按「开关 + 路由胶囊 + 两个按钮」在各档下的实际占宽估出来，留了余量：宁可早收，
 * 也不要让头部掉到第二行把舞台压矮。
 */
export const ICONS_BELOW = 780;
export const HIDE_ROUTE_BELOW = 540;

export interface ToolbarLevel {
	/** 设备 / 浏览器打开只留图标。 */
	iconOnly: boolean;
	/** 路由胶囊整组收起。 */
	hideRoute: boolean;
}

/** width 为 0 表示还没量到，按最宽处理，免得首帧闪一下收起再展开。 */
export function toolbarLevel(width: number): ToolbarLevel {
	if (width <= 0) return { iconOnly: false, hideRoute: false };
	return { iconOnly: width < ICONS_BELOW, hideRoute: width < HIDE_ROUTE_BELOW };
}

/** 视口四周留给舞台底色的边距（px）。 */
export const STAGE_PADDING = 24;

/**
 * 让 `content` 整体装进 `container`（各留 `padding`）的缩放比。只缩小不放大：
 * 设计稿尺寸就是真实尺寸，面板再宽也不该把 393px 的手机拉成 2 倍。
 */
export function fitScale(container: FrameSize, content: FrameSize, padding = STAGE_PADDING): number {
	if (content.width <= 0 || content.height <= 0) return 1;
	const room = {
		width: Math.max(1, container.width - padding * 2),
		height: Math.max(1, container.height - padding * 2),
	};
	return Math.min(1, room.width / content.width, room.height / content.height);
}

/** 底部渐变起点的不透明度（%）：只是给底色一点气色，不能抢设计稿。 */
export const GLOW_ALPHA = 32;

/** 渐变从底部往上淡出到哪一档高度（%）。 */
export const GLOW_REACH = 75;

/**
 * 底部渐变用的主色：优先设计色卡里的 `--color-primary`，占位色卡或没写时为 null，
 * 由调用方落到宿主的 primary。
 */
export function themeStagePrimary(themeCss: string | null): string | null {
	if (!themeCss || themeCss.includes(PLACEHOLDER_THEME_MARK)) return null;
	return parseThemeTokens(themeCss).find((entry) => entry.name === "primary")?.value ?? null;
}

/**
 * 舞台底部的渐变：主色（低透明度）从下往上淡出到透明，透出下面的底色。
 * 主色不是合法 CSS 颜色时整个声明会被浏览器丢掉，等于没有渐变，不会出错。
 */
export function stageGlow(primary: string): string {
	return `linear-gradient(to top, color-mix(in srgb, ${primary} ${GLOW_ALPHA}%, transparent), transparent ${GLOW_REACH}%)`;
}

import { parseThemeTokens } from "../canvas/theme-tokens";
import type { FrameSize } from "../vetd/manifest-types";
import { PLACEHOLDER_THEME_MARK, themeBackgroundToken } from "../vetd/scaffold";

/** 夹层的不透明度：足以把设备 / 画框和底色分开，又不盖掉底色自己的色相。 */
export const VEIL_ALPHA = 0.07;

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

/** 视口四周留给灰色夹层的边距（px）。 */
export const STAGE_PADDING = 24;

export type Rgb = readonly [number, number, number];

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

const HEX = /^#([0-9a-f]{3,8})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

/**
 * 把 CSS 颜色解析成 sRGB。hex 和 rgb() 直接解；oklch()、color-mix() 之类交给 canvas
 * （浏览器自己会解）。解不出来（含测试环境没有 canvas）返回 null。
 */
export function parseCssColor(value: string): Rgb | null {
	const text = value.trim();
	const hex = HEX.exec(text);
	if (hex) {
		const digits = hex[1];
		if (digits.length === 3 || digits.length === 4) {
			const [r, g, b] = [0, 1, 2].map((i) => Number.parseInt(digits[i] + digits[i], 16));
			return [r, g, b];
		}
		if (digits.length === 6 || digits.length === 8) {
			const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16));
			return [r, g, b];
		}
		return null;
	}
	const fn = RGB_FN.exec(text);
	if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
	return parseViaCanvas(text);
}

function parseViaCanvas(value: string): Rgb | null {
	try {
		const context = document.createElement("canvas").getContext("2d");
		if (!context) return null;
		context.fillStyle = "#000";
		context.fillStyle = value;
		context.fillRect(0, 0, 1, 1);
		const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
		return [r, g, b];
	} catch {
		return null;
	}
}

/** 相对亮度（WCAG），0 黑 1 白。 */
export function luminance([r, g, b]: Rgb): number {
	const channel = (v: number): number => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function isLightColor(rgb: Rgb): boolean {
	return luminance(rgb) > 0.4;
}

/**
 * 夹层颜色：底色偏亮就叠黑、偏暗就叠白，结果始终是「比底色略深（或略亮）」的同一档对比，
 * 底色的色相还透得出来。
 */
export function veilColor(base: Rgb | null): string {
	const light = base === null ? true : isLightColor(base);
	return light ? `rgba(0, 0, 0, ${VEIL_ALPHA})` : `rgba(255, 255, 255, ${VEIL_ALPHA})`;
}

/** 裸画面外边框的不透明度：要明显高于夹层，否则边框和底色糊成一片。 */
export const EDGE_ALPHA = 0.32;

/**
 * 裸画面（桌面端 / 其他）外边框的颜色：同夹层一样按底色明暗取反色，但浓得多，
 * 在亮底上是深灰、暗底上是亮灰。
 */
export function edgeColor(base: Rgb | null): string {
	const light = base === null ? true : isLightColor(base);
	return light ? `rgba(0, 0, 0, ${EDGE_ALPHA})` : `rgba(255, 255, 255, ${EDGE_ALPHA})`;
}

/**
 * 顶部条控件的配色：由舞台底色算出，而不是跟宿主主题走——宿主是暗色、设计底色是浅色时，
 * 宿主的 muted / foreground 在这块底色上就是深色块配浅色字。
 *
 * 变量名带 `--vetd-` 前缀，控件用 `var(--vetd-xxx, 宿主变量)` 取：设计模式下没有这些变量，
 * 自然回落到宿主的颜色。
 */
export function chromeVars(base: Rgb | null): Record<string, string> {
	const light = base === null ? true : isLightColor(base);
	return light
		? {
				"--vetd-ink": "#111827",
				"--vetd-ink-soft": "rgba(17, 24, 39, 0.58)",
				"--vetd-pill": "#ffffff",
				"--vetd-line": "rgba(0, 0, 0, 0.14)",
			}
		: {
				"--vetd-ink": "#f8fafc",
				"--vetd-ink-soft": "rgba(248, 250, 252, 0.62)",
				"--vetd-pill": "rgba(255, 255, 255, 0.12)",
				"--vetd-line": "rgba(255, 255, 255, 0.2)",
			};
}

/**
 * 交互舞台的底色：色卡里的背景 token，占位色卡 / 没有背景 token 时为 null，
 * 由调用方落到宿主的背景变量。
 */
export function themeStageBackground(themeCss: string | null): string | null {
	const token = themeBackgroundToken(themeCss);
	if (!token || !themeCss) return null;
	return parseThemeTokens(themeCss).find((entry) => entry.name === token)?.value ?? null;
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

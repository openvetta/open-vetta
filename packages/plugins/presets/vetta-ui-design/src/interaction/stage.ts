import { parseThemeTokens } from "../canvas/theme-tokens";
import type { FrameSize } from "../vetd/manifest-types";
import { themeBackgroundToken } from "../vetd/scaffold";

/** 夹层的不透明度：足以把设备 / 画框和底色分开，又不盖掉底色自己的色相。 */
export const VEIL_ALPHA = 0.07;

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
 * 交互舞台的底色：色卡里的背景 token，占位色卡 / 没有背景 token 时为 null，
 * 由调用方落到宿主的背景变量。
 */
export function themeStageBackground(themeCss: string | null): string | null {
	const token = themeBackgroundToken(themeCss);
	if (!token || !themeCss) return null;
	return parseThemeTokens(themeCss).find((entry) => entry.name === token)?.value ?? null;
}

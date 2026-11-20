/**
 * 颜色字符串 ↔ RGB / HSV 的纯函数，供取色控件使用。
 *
 * 只做无状态换算，不碰 DOM：解析、规范化、色相/明度旋转都收在这里，组件与测试共用同一份。
 *
 * 支持的输入写法（大小写、首尾空白不敏感）：
 * - 十六进制：`#abc` / `#abcd` / `#aabbcc` / `#aabbccdd`（alpha 位忽略，一律按不透明处理）
 * - `rgb(255, 0, 0)` / `rgba(255 0 0 / .5)` / `rgb(100% 0% 0%)`
 * - `hsl(210, 100%, 50%)` / `hsla(210deg 100% 50% / .3)`
 */

export interface RgbColor {
	/** 0–255 整数。 */
	r: number;
	g: number;
	b: number;
}

export interface HsvColor {
	/** 0–360 度。 */
	h: number;
	/** 0–1。 */
	s: number;
	/** 0–1。 */
	v: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function clampByte(value: number): number {
	return Math.round(clamp(value, 0, 255));
}

function parseChannel(raw: string): number | null {
	const text = raw.trim();
	if (!text) return null;
	if (text.endsWith("%")) {
		const percent = Number(text.slice(0, -1));
		return Number.isFinite(percent) ? clamp((percent / 100) * 255, 0, 255) : null;
	}
	const number = Number(text);
	return Number.isFinite(number) ? clamp(number, 0, 255) : null;
}

function parseHue(raw: string): number | null {
	const text = raw.trim().toLowerCase().replace(/deg$/, "");
	const number = Number(text);
	if (!Number.isFinite(number)) return null;
	return ((number % 360) + 360) % 360;
}

function parsePercent(raw: string): number | null {
	const text = raw.trim();
	const number = Number(text.endsWith("%") ? text.slice(0, -1) : text);
	if (!Number.isFinite(number)) return null;
	return clamp(number / 100, 0, 1);
}

/** 把 `a, b, c` / `a b c` / `a b c / alpha` 这类参数串拆成前三个通道。 */
function splitArgs(body: string): string[] {
	return body
		.split(/[,\s/]+/u)
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.slice(0, 3);
}

function parseHex(value: string): RgbColor | null {
	const body = value.replace(/^#/u, "");
	if (!/^[0-9a-f]+$/u.test(body)) return null;
	const expand = (short: string): string =>
		short
			.split("")
			.map((char) => char + char)
			.join("");
	let full: string;
	if (body.length === 3 || body.length === 4) full = expand(body.slice(0, 3));
	else if (body.length === 6 || body.length === 8) full = body.slice(0, 6);
	else return null;
	return {
		r: Number.parseInt(full.slice(0, 2), 16),
		g: Number.parseInt(full.slice(2, 4), 16),
		b: Number.parseInt(full.slice(4, 6), 16),
	};
}

/** 解析任意支持的写法；无法识别时返回 null（调用方决定是报错还是保持原值）。 */
export function parseColor(input: string): RgbColor | null {
	const value = input.trim().toLowerCase();
	if (!value) return null;

	if (value.startsWith("#")) return parseHex(value);

	const functional = /^(rgba?|hsla?)\(([^)]*)\)$/u.exec(value);
	if (!functional) {
		// 不带 # 的十六进制只接受 6 / 8 位：三位写法与普通单词太容易混淆（"abc" 不该变成颜色）。
		return /^[0-9a-f]{6}([0-9a-f]{2})?$/u.test(value) ? parseHex(value) : null;
	}

	const [, kind, body] = functional;
	const args = splitArgs(body ?? "");
	if (args.length < 3) return null;

	if (kind?.startsWith("rgb")) {
		const channels = args.map(parseChannel);
		if (channels.some((channel) => channel === null)) return null;
		const [r, g, b] = channels as number[];
		return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
	}

	const hue = parseHue(args[0] as string);
	const saturation = parsePercent(args[1] as string);
	const lightness = parsePercent(args[2] as string);
	if (hue === null || saturation === null || lightness === null) return null;

	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const sector = hue / 60;
	const second = chroma * (1 - Math.abs((sector % 2) - 1));
	const base = lightness - chroma / 2;
	const [r1, g1, b1] =
		sector < 1
			? [chroma, second, 0]
			: sector < 2
				? [second, chroma, 0]
				: sector < 3
					? [0, chroma, second]
					: sector < 4
						? [0, second, chroma]
						: sector < 5
							? [second, 0, chroma]
							: [chroma, 0, second];
	return { r: clampByte((r1 + base) * 255), g: clampByte((g1 + base) * 255), b: clampByte((b1 + base) * 255) };
}

/** RGB → `#rrggbb`（小写，不带 alpha）。 */
export function toHex(rgb: RgbColor): string {
	const byte = (value: number) => clampByte(value).toString(16).padStart(2, "0");
	return `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}`;
}

/** 规范化成 `#rrggbb`；无法识别时返回 null。 */
export function normalizeColor(input: string): string | null {
	const rgb = parseColor(input);
	return rgb ? toHex(rgb) : null;
}

/** 两个颜色写法是否指向同一种颜色（都解析失败时按字符串比较；两边都没颜色算相同）。 */
export function isSameColor(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !a.trim() || !b || !b.trim()) return !a?.trim() && !b?.trim();
	const left = normalizeColor(a);
	const right = normalizeColor(b);
	if (!left || !right) return a.trim().toLowerCase() === b.trim().toLowerCase();
	return left === right;
}

export function rgbToHsv(rgb: RgbColor): HsvColor {
	const r = clampByte(rgb.r) / 255;
	const g = clampByte(rgb.g) / 255;
	const b = clampByte(rgb.b) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let h = 0;
	if (delta > 0) {
		if (max === r) h = 60 * (((g - b) / delta) % 6);
		else if (max === g) h = 60 * ((b - r) / delta + 2);
		else h = 60 * ((r - g) / delta + 4);
	}
	if (h < 0) h += 360;

	return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb(hsv: HsvColor): RgbColor {
	const h = ((hsv.h % 360) + 360) % 360;
	const s = clamp(hsv.s, 0, 1);
	const v = clamp(hsv.v, 0, 1);

	const chroma = v * s;
	const sector = h / 60;
	const second = chroma * (1 - Math.abs((sector % 2) - 1));
	const base = v - chroma;
	const [r1, g1, b1] =
		sector < 1
			? [chroma, second, 0]
			: sector < 2
				? [second, chroma, 0]
				: sector < 3
					? [0, chroma, second]
					: sector < 4
						? [0, second, chroma]
						: sector < 5
							? [second, 0, chroma]
							: [chroma, 0, second];
	return { r: clampByte((r1 + base) * 255), g: clampByte((g1 + base) * 255), b: clampByte((b1 + base) * 255) };
}

/** 纯色相环上的颜色，用于色相滑轨与选区底色。 */
export function hueColor(hue: number): string {
	return toHex(hsvToRgb({ h: hue, s: 1, v: 1 }));
}

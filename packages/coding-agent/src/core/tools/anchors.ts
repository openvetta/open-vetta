/**
 * 行锚点引擎（锚点式编辑的公共底座）。
 *
 * 锚点格式：`<line>:<hh>`——`line` 为 1-based 行号（仅作提示，非权威），`hh` 为该行
 * 内容做空白归一化后的 FNV-1a 哈希（2 位 base36）。read/grep 输出行带锚点前缀，
 * edit 锚点模式凭锚点定位：哈希是身份、行号是起搜位置——行号对不上时在小半径内
 * 按哈希找回（shifted），找不到判过期（stale）。
 *
 * 模型无法自行计算哈希，只能引用工具返回值——等价于机制层面强制「先读后改」。
 */

/** 锚点行号漂移的搜索半径（上下各 N 行）。 */
export const ANCHOR_SEARCH_RADIUS = 20;

/** 读输出的锚点分隔符。`42:ab→content` 中 `42:ab` 是锚点，`→` 后是内容。 */
export const ANCHOR_SEPARATOR = "→";

/** 该行内容的锚点哈希：空白全剥离后 FNV-1a 32-bit，取 base36 末 2 位。 */
export function anchorLineHash(line: string): string {
	const normalized = line.replace(/\s+/g, "");
	let hash = 0x811c9dc5;
	for (let i = 0; i < normalized.length; i++) {
		hash ^= normalized.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36).padStart(2, "0").slice(-2);
}

export interface ParsedAnchor {
	line: number;
	hash: string;
}

/** 解析 `42:ab` 形式的锚点；容忍模型把 `→` 及后续内容误带上（截断丢弃）。 */
export function parseAnchor(anchor: string): ParsedAnchor | undefined {
	const cleaned = anchor.split(ANCHOR_SEPARATOR, 1)[0]?.trim() ?? "";
	const match = /^(\d+):([0-9a-z]{2})$/.exec(cleaned);
	if (!match) return undefined;
	const line = Number.parseInt(match[1], 10);
	if (line < 1) return undefined;
	return { line, hash: match[2] };
}

export type AnchorValidation =
	| { status: "ok"; line: number }
	| { status: "shifted"; line: number }
	| { status: "stale" };

/**
 * 校验锚点：行号处哈希匹配 → ok；否则在 ±radius 内按哈希搜索（取距离最近者）→
 * shifted；找不到 → stale。`lines` 为文件全部行（0-based 数组，行号 1-based）。
 */
export function validateAnchor(
	lines: string[],
	anchor: ParsedAnchor,
	radius: number = ANCHOR_SEARCH_RADIUS,
): AnchorValidation {
	const idx = anchor.line - 1;
	if (idx >= 0 && idx < lines.length && anchorLineHash(lines[idx]) === anchor.hash) {
		return { status: "ok", line: anchor.line };
	}
	for (let distance = 1; distance <= radius; distance++) {
		for (const candidate of [idx - distance, idx + distance]) {
			if (candidate >= 0 && candidate < lines.length && anchorLineHash(lines[candidate]) === anchor.hash) {
				return { status: "shifted", line: candidate + 1 };
			}
		}
	}
	return { status: "stale" };
}

/** 给一段行内容加锚点前缀。`startLine` 为第一行的 1-based 行号。 */
export function renderAnchoredLines(lines: string[], startLine: number): string[] {
	return lines.map((line, i) => `${startLine + i}:${anchorLineHash(line)}${ANCHOR_SEPARATOR}${line}`);
}

/**
 * 渲染某行附近 ±context 行的新鲜锚点（错误回传 / 编辑成功回执用），
 * 让模型无需重读文件即可立刻重试或继续编辑。
 */
export function renderAnchorRegion(lines: string[], centerLine: number, context = 3): string {
	const start = Math.max(1, centerLine - context);
	const end = Math.min(lines.length, centerLine + context);
	if (end < start) return "(file is empty)";
	return renderAnchoredLines(lines.slice(start - 1, end), start).join("\n");
}

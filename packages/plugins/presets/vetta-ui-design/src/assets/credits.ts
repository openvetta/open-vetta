/**
 * `assets/CREDITS.json`：设计里每张下载来的图从哪来、谁拍的、什么许可。
 *
 * 跟着设计包走（进版本历史、随 .vetdz 导出），报告与交付时据此列署名。任意网址来的图
 * 许可不可知，`verified: false`，正式使用前由用户核对——工具不替用户判断能不能用。
 */
import type { AssetCandidate } from "./sources";

export const CREDITS_FILE = "assets/CREDITS.json";

export interface CreditEntry {
	file: string;
	title: string;
	author: string;
	source: AssetCandidate["source"];
	license: string;
	page: string;
	url: string;
	verified: boolean;
	at: string;
}

export function parseCredits(text: string | null): CreditEntry[] {
	if (!text) return [];
	try {
		const value: unknown = JSON.parse(text);
		if (!Array.isArray(value)) return [];
		return value.filter(
			(entry): entry is CreditEntry =>
				typeof entry === "object" &&
				entry !== null &&
				typeof (entry as CreditEntry).file === "string" &&
				typeof (entry as CreditEntry).license === "string",
		);
	} catch {
		return [];
	}
}

/** 同一个文件再下载一次（换了裁切）只保留最新一条。 */
export function upsertCredit(entries: readonly CreditEntry[], entry: CreditEntry): CreditEntry[] {
	return [...entries.filter((existing) => existing.file !== entry.file), entry];
}

export function serializeCredits(entries: readonly CreditEntry[]): string {
	return `${JSON.stringify(entries, null, "\t")}\n`;
}

/** 文件名：小写短横线，最多 40 个字符；与已有文件重名时加序号。 */
export function assetFileName(base: string, existing: ReadonlySet<string>, extension: string): string {
	const slug =
		base
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40)
			.replace(/-+$/, "") || "image";
	let name = `${slug}.${extension}`;
	for (let n = 2; existing.has(name); n++) name = `${slug}-${n}.${extension}`;
	return name;
}

/** `night-sky.jpg` → `nightSky`：给模型的 import 语句里的变量名。 */
export function importName(file: string): string {
	const stem = file.replace(/\.[a-z0-9]+$/i, "");
	const camel = stem.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
	return /^[a-z]/.test(camel) ? camel : `img${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

/** 报告里的一行署名。 */
export function creditLine(entry: CreditEntry): string {
	const license = entry.verified ? entry.license : "license unverified — check before shipping";
	return `${entry.file}: "${entry.title}" by ${entry.author} (${license}) — ${entry.page}`;
}

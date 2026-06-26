import type { ControlHint, LottieDocument, SlotControl, SlotKind } from "./types";

export interface ParsedLottie {
	doc: LottieDocument;
	totalFrames: number;
	fps: number;
}

export interface ValidationResult {
	ok: boolean;
	error?: string;
	doc?: LottieDocument;
}

/** Parse + structurally validate a bodymovin JSON string. */
export function validateLottie(jsonText: string): ValidationResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch (err) {
		return { ok: false, error: `JSON 解析失败：${(err as Error).message}` };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { ok: false, error: "顶层必须是一个 JSON 对象。" };
	}
	const doc = parsed as LottieDocument;
	if (!Array.isArray(doc.layers)) {
		return { ok: false, error: "缺少 layers 数组——这不是有效的 Lottie/Bodymovin 文档。" };
	}
	if (typeof doc.op !== "number" || typeof doc.fr !== "number" || typeof doc.w !== "number" || typeof doc.h !== "number") {
		return { ok: false, error: "缺少必要字段（fr / op / w / h）。" };
	}
	return { ok: true, doc };
}

export function readMeta(doc: LottieDocument): ParsedLottie {
	const fps = typeof doc.fr === "number" && doc.fr > 0 ? doc.fr : 30;
	const ip = typeof doc.ip === "number" ? doc.ip : 0;
	const op = typeof doc.op === "number" ? doc.op : fps;
	return { doc, fps, totalFrames: Math.max(1, op - ip) };
}

/** Turn a human title into a filesystem-safe slug. */
export function slugify(input: string): string {
	const base = input
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return base || "animation";
}

/** Resolve the controls to show, merging Skottie slot ids with authored hints. */
export function resolveControls(
	doc: LottieDocument,
	slotInfo: { colorSlotIDs: string[]; scalarSlotIDs: string[]; vec2SlotIDs: string[]; textSlotIDs: string[] },
): SlotControl[] {
	const hints = new Map<string, ControlHint>();
	for (const hint of doc.metadata?.lottieStudio?.controls ?? []) {
		if (hint && typeof hint.sid === "string") hints.set(hint.sid, hint);
	}
	const build = (sid: string, kind: SlotKind): SlotControl => {
		const hint = hints.get(sid);
		return { sid, kind, label: hint?.label?.trim() || sid, hint };
	};
	return [
		...slotInfo.colorSlotIDs.map((sid) => build(sid, "color")),
		...slotInfo.scalarSlotIDs.map((sid) => build(sid, "scalar")),
		...slotInfo.vec2SlotIDs.map((sid) => build(sid, "vec2")),
		...slotInfo.textSlotIDs.map((sid) => build(sid, "text")),
	];
}

/**
 * Patch a slot value into the document so it survives a save. Skottie's
 * setXxxSlot only mutates the live animation, not the JSON — the on-disk source
 * of truth must be edited here. Mirrors the slot storage layout: value-type
 * slots live under `slots[sid].p.k`, text slots under `slots[sid].p.p.t`.
 */
export function applySlotValue(doc: LottieDocument, sid: string, kind: SlotKind, value: number | number[] | string): void {
	if (!doc.slots || typeof doc.slots !== "object") return;
	const entry = doc.slots[sid];
	if (!entry) return;
	entry.p ??= {};
	if (kind === "text") {
		entry.p.p ??= {};
		entry.p.p.t = String(value);
	} else {
		entry.p.k = value;
	}
}

// ─── Color helpers (Skottie colors are RGBA floats in [0,1]) ───

export function rgbaToHex(color: ArrayLike<number> | null): string {
	if (!color || color.length < 3) return "#000000";
	const to255 = (v: number): string =>
		Math.max(0, Math.min(255, Math.round(v * 255)))
			.toString(16)
			.padStart(2, "0");
	return `#${to255(color[0])}${to255(color[1])}${to255(color[2])}`;
}

export function hexToRgb(hex: string): [number, number, number] {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return [0, 0, 0];
	const int = Number.parseInt(m[1], 16);
	return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

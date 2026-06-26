// Minimal Bodymovin / Lottie document shape — only the fields this plugin reads
// or patches. The full schema is large; we deliberately keep this narrow and
// treat unknown content as opaque pass-through.

/** A slot's stored value inside the top-level `slots` map. */
export interface LottieSlotEntry {
	// scalar / color / vec2 slots store the value under `p.k`;
	// text slots store the string under `p.p.t`.
	p?: {
		a?: number;
		k?: unknown;
		p?: { t?: string; [key: string]: unknown };
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export interface LottieDocument {
	/** Bodymovin version (e.g. "5.11.0"); slots require >= 5.11.0. */
	v?: string;
	/** Frame rate. */
	fr?: number;
	/** In-point / out-point (frames). */
	ip?: number;
	op?: number;
	/** Composition width / height. */
	w?: number;
	h?: number;
	nm?: string;
	layers?: unknown[];
	assets?: unknown[];
	slots?: Record<string, LottieSlotEntry>;
	/** Non-standard, ignored by renderers: Lottie Studio UI hints for slot controls. */
	metadata?: {
		lottieStudio?: { controls?: ControlHint[] };
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export type SlotKind = "color" | "scalar" | "vec2" | "text";

/** Optional UI hint for a slot control, authored by the AI alongside the doc. */
export interface ControlHint {
	/** Slot id (the `sid` referenced in the document). */
	sid: string;
	label?: string;
	/** For scalar slots: slider bounds + step. */
	min?: number;
	max?: number;
	step?: number;
}

/** A resolved control shown in the slot panel. */
export interface SlotControl {
	sid: string;
	kind: SlotKind;
	label: string;
	hint?: ControlHint;
}

/** A `.lottie` animation discovered in the workspace. */
export interface LottieEntry {
	name: string;
	path: string;
	modifiedAt: number;
}

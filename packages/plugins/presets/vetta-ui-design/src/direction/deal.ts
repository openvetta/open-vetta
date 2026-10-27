/**
 * 发方向（落地页）：从研究库里按需求随机发牌，模型只在发出的几项里挑。App 屏幕不发牌，
 * 由 agent 自拟三个方向、工具校验，见 proposal.ts。
 *
 * 为什么由代码来抽而不是让模型「自己定一个方向」：让模型凭空定调性、主色和字体，它
 * 每次都会落到同一类默认值上——这正是设计稿千篇一律的来源。抽牌是随机的，但只在适合
 * 这份需求（行业、调性、真实拥有的素材）的范围里抽，并避开最近几次发过的。
 *
 * 逻辑移植自 taste-skill 的 scripts/draw.mjs（MIT，见
 * vendor/taste-skill/UPSTREAM.md）。删掉的部分：动效、滚动场景、照片集、研究样本站点
 * ——frame 是固定尺寸的静态画面，也不能加载远程图片。
 *
 * 这里全是纯函数：随机数和历史记录都由调用方传入，测试可以固定种子。
 */
import type {
	TasteDirection,
	TasteHero,
	TasteLibrary,
	TastePalette,
	TasteSection,
	TasteType,
} from "./library";

export const PAGE_SECTORS = [
	"saas",
	"dev-tool",
	"ai-product",
	"consumer-app",
	"finance",
	"agency",
	"studio-portfolio",
	"personal-portfolio",
	"ecommerce",
	"physical-product",
	"fashion",
	"hospitality",
	"restaurant",
	"real-estate",
	"architecture",
	"event",
	"health",
	"education",
	"nonprofit",
	"culture",
	"music",
	"other",
] as const;

export const PAGE_TONES = ["quiet", "bold", "warm", "technical", "playful", "luxury", "editorial"] as const;

/** 项目自己真实拥有的素材。找来的图（vetd_assets）不算，那是每份设计都能拿到的。 */
export const ASSETS = ["photography", "product-photo", "product-ui", "illustration"] as const;

export type PageSector = (typeof PAGE_SECTORS)[number];
export type PageTone = (typeof PAGE_TONES)[number];
export type Asset = (typeof ASSETS)[number];
export type KeepSlot = "palette" | "type";

const DEFAULT_SECTIONS: Record<PageSector, string[]> = {
	saas: ["showcase", "features", "how-it-works", "testimonial", "pricing", "faq", "cta", "footer"],
	"dev-tool": ["showcase", "features", "how-it-works", "pricing", "faq", "cta", "footer"],
	"ai-product": ["showcase", "features", "how-it-works", "testimonial", "pricing", "cta", "footer"],
	"consumer-app": ["showcase", "features", "testimonial", "cta", "footer"],
	finance: ["showcase", "features", "stats", "testimonial", "faq", "cta", "footer"],
	agency: ["intro", "work", "features", "about", "cta", "footer"],
	"studio-portfolio": ["work", "intro", "features", "about", "cta", "footer"],
	"personal-portfolio": ["work", "about", "cta", "footer"],
	ecommerce: ["gallery", "features", "intro", "testimonial", "cta", "footer"],
	"physical-product": ["showcase", "features", "gallery", "intro", "pricing", "cta", "footer"],
	fashion: ["gallery", "intro", "work", "cta", "footer"],
	hospitality: ["intro", "gallery", "features", "list", "contact", "footer"],
	restaurant: ["intro", "list", "gallery", "contact", "footer"],
	"real-estate": ["intro", "gallery", "features", "stats", "contact", "footer"],
	architecture: ["work", "intro", "about", "contact", "footer"],
	event: ["intro", "list", "features", "pricing", "faq", "cta", "footer"],
	health: ["intro", "features", "how-it-works", "testimonial", "faq", "cta", "footer"],
	education: ["intro", "features", "how-it-works", "testimonial", "pricing", "faq", "cta", "footer"],
	nonprofit: ["intro", "stats", "features", "about", "cta", "footer"],
	culture: ["intro", "gallery", "list", "about", "cta", "footer"],
	music: ["list", "gallery", "about", "cta", "footer"],
	other: ["intro", "features", "showcase", "cta", "footer"],
};

/** 用户/模型可能写出的分区名 → 库里的 role。 */
const ROLE_ALIAS: Record<string, string> = {
	feature: "features",
	benefits: "features",
	services: "features",
	product: "showcase",
	demo: "showcase",
	how: "how-it-works",
	process: "how-it-works",
	steps: "how-it-works",
	testimonials: "testimonial",
	quotes: "testimonial",
	logos: "proof",
	press: "proof",
	numbers: "stats",
	plans: "pricing",
	tickets: "pricing",
	price: "pricing",
	manifesto: "intro",
	team: "about",
	projects: "work",
	index: "work",
	"case-studies": "work",
	images: "gallery",
	menu: "list",
	schedule: "list",
	lineup: "list",
	"line-up": "list",
	speakers: "list",
	agenda: "list",
	programme: "list",
	program: "list",
	timetable: "list",
	rooms: "list",
	booking: "contact",
	newsletter: "contact",
	signup: "contact",
};

export function normalizeRole(role: string): string {
	const key = role.trim().toLowerCase();
	return ROLE_ALIAS[key] ?? key;
}

// ---------- 输入与结果 ----------

export interface PageInput {
	sector: PageSector;
	brief: string;
	tone: PageTone | null;
	have: Asset[];
	keep: KeepSlot[];
	avoid: string[];
	/** 首屏之后的分区，按论证顺序。首屏隐含，不在这里。 */
	sections: string[];
}

export interface AppInput {
	brief: string;
	/** 要设计的屏幕，agent 自己的叫法。 */
	screens: string[];
	keep: KeepSlot[];
	avoid: string[];
}

export interface PageChoice {
	directionId: string;
	heroId: string;
	typeId: string | null;
	paletteId: string | null;
	sections: { role: string; id: string | null }[];
}

/** App 选定的是 agent 提的某一案；提案本身存在 direction.json 的 `proposals` 里。 */
export interface AppChoice {
	proposalId: string;
}

/** 最近发过的方向，新的在前。跨设计保存在插件存储里，只用来避开重复。 */
export interface DealHistoryEntry {
	at: string;
	mode: "page" | "app";
	direction?: string;
	hero?: string;
	type?: string;
	palette?: string;
	/** App：选定方向的明暗、主色色系、标题字类别与标题字，用来让下一份设计避开。 */
	theme?: "light" | "dark";
	hue?: string;
	typeClass?: string;
	display?: string;
}

export interface Dealer {
	lib: TasteLibrary;
	rnd: () => number;
	history: readonly DealHistoryEntry[];
}

/** 与上游同一个可复现的 PRNG（mulberry32 变体），同一种子发出同一副牌。 */
export function seededRandom(seed: number): () => number {
	let state = seed | 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pick = <T>(rnd: () => number, items: readonly T[]): T => items[Math.floor(rnd() * items.length)] as T;

/** 优先没用过的，但永远不把池子抽空。 */
function fresh<T extends { id: string }>(pool: readonly T[], recent: readonly string[]): readonly T[] {
	const unused = pool.filter((item) => !recent.includes(item.id));
	return unused.length > 0 ? unused : pool;
}

function recent(dealer: Dealer, key: keyof DealHistoryEntry, mode: "page" | "app", count: number): string[] {
	if (count <= 0) return [];
	return dealer.history
		.filter((entry) => entry.mode === mode)
		.slice(0, count)
		.map((entry) => entry[key])
		.filter((value): value is string => typeof value === "string");
}

// ---------- 页面 ----------

export function defaultSections(sector: PageSector): string[] {
	return [...DEFAULT_SECTIONS[sector]];
}

/**
 * 这次构建能诚实拿出什么图。决定发哪些版式、以及方向表怎么交代图片位。与上游一致：
 * 没有自有图片时去开放图库找真实照片（vetd_assets），只有软件（图就是它自己的界面）和
 * 实物商品（找来的图不能冒充商品本身）两类避开靠照片撑的版式。
 */
export type ImageryMode = "own" | "interface" | "no-product-photo" | "found";

const SOFTWARE_SECTORS: readonly string[] = ["saas", "dev-tool", "ai-product", "consumer-app", "finance"];
const PRODUCT_SECTORS: readonly string[] = ["physical-product", "ecommerce"];

export function imageryMode(input: Pick<PageInput, "have" | "sector">): ImageryMode {
	if (input.have.includes("product-photo") || input.have.includes("photography")) return "own";
	if (SOFTWARE_SECTORS.includes(input.sector)) return "interface";
	if (PRODUCT_SECTORS.includes(input.sector)) return "no-product-photo";
	return "found";
}

const pictureLed = (section: TasteSection) => section.tags.includes("photo-led") || section.tags.includes("object-led");
const worksWithoutPictures = (section: TasteSection) =>
	!pictureLed(section) || section.tags.some((tag) => tag === "ui-led" || tag === "type-led" || tag === "colour-field");
/** 专为展示软件写的版式（界面片段就是它的图）。 */
const softwareOnly = (item: { directions: string[]; tags?: string[]; blueprint: string }) =>
	item.directions[0] === "product-performs" ||
	(item.tags ?? []).includes("ui-led") ||
	/data-ui|interface fragment/i.test(item.blueprint);

function directionPool(dealer: Dealer, input: PageInput): TasteDirection[] {
	const { directions } = dealer.lib;
	const has = (need: string) => input.have.includes(need as Asset);
	let pool = directions.filter(
		(d) => (d.sectors.includes(input.sector) || d.sectors.includes("*")) && !input.avoid.includes(d.id),
	);
	const feasible = pool.filter((d) => d.needs.every(has));
	if (feasible.length > 0) pool = feasible;
	const mode = imageryMode(input);
	if (mode === "interface" || mode === "no-product-photo") {
		const plain = pool.filter((d) => !d.needsPictures);
		if (plain.length >= 3) pool = plain;
	}
	if (input.tone) {
		const toned = pool.filter((d) => d.tones.includes(input.tone as string));
		if (toned.length >= 2) pool = toned;
	}
	if (pool.length === 0) pool = directions.filter((d) => !input.avoid.includes(d.id));
	return pool.length > 0 ? pool : directions;
}

/** 发 n 个候选方向给模型挑。 */
export function dealPageOptions(dealer: Dealer, input: PageInput, count = 3): TasteDirection[] {
	const pool = directionPool(dealer, input);
	const out: TasteDirection[] = [];
	let rest = [...fresh(pool, recent(dealer, "direction", "page", Math.min(5, pool.length - count)))];
	while (out.length < count && pool.length > out.length) {
		if (rest.length === 0) rest = pool.filter((d) => !out.includes(d));
		const chosen = pick(dealer.rnd, rest);
		out.push(chosen);
		rest = rest.filter((d) => d !== chosen);
	}
	return out;
}

export function dealHero(dealer: Dealer, dir: TasteDirection, input: PageInput, exclude: string[]): TasteHero {
	const { heroes } = dealer.lib;
	let pool = heroes.filter((h) => dir.heroIds.includes(h.id) || h.directions.includes(dir.id));
	if (pool.length === 0) pool = heroes;
	if (imageryMode(input) !== "interface" && !input.have.includes("product-ui")) {
		const plain = pool.filter((h) => !softwareOnly(h));
		if (plain.length > 0) pool = plain;
	}
	const open = pool.filter((h) => !exclude.includes(h.id));
	const feasible = open.filter((h) => h.needs.every((need) => input.have.includes(need as Asset)));
	const candidates = feasible.length > 0 ? feasible : open.length > 0 ? open : pool;
	return pick(dealer.rnd, fresh(candidates, recent(dealer, "hero", "page", 3)));
}

export function dealType(dealer: Dealer, dir: TasteDirection, exclude: string[]): TasteType {
	const all = dealer.lib.type;
	let pool = all.filter((t) => dir.typeIds.includes(t.id) || dir.typeClasses.includes(t.class));
	if (pool.length === 0) pool = all;
	const open = pool.filter((t) => !exclude.includes(t.id));
	const candidates = open.length > 0 ? open : pool;
	return pick(dealer.rnd, fresh(candidates, recent(dealer, "type", "page", Math.min(6, pool.length - 1))));
}

export function dealPalette(dealer: Dealer, dir: TasteDirection, exclude: string[]): TastePalette {
	const all = dealer.lib.palettes;
	let pool = all.filter((p) => dir.paletteIds.includes(p.id) || p.tags.some((tag) => dir.paletteTags.includes(tag)));
	if (pool.length === 0) pool = all;
	const open = pool.filter((p) => !exclude.includes(p.id));
	const candidates = open.length > 0 ? open : pool;
	return pick(dealer.rnd, fresh(candidates, recent(dealer, "palette", "page", Math.min(6, pool.length - 1))));
}

/** 适合这个方向、也适合这次真实素材的某个 role 的全部版式。 */
export function sectionPool(dealer: Dealer, dir: TasteDirection, role: string, input: PageInput): TasteSection[] {
	let pool = dealer.lib.sections.filter((s) => s.role === role);
	if (pool.length === 0) return [];
	const mode = imageryMode(input);
	const feasible = pool.filter((s) =>
		s.needs.every((need) => input.have.includes(need as Asset) || (need === "product-ui" && mode === "interface")),
	);
	if (feasible.length > 0) pool = feasible;
	if (mode !== "interface" && !input.have.includes("product-ui")) {
		const plain = pool.filter((s) => !softwareOnly(s));
		if (plain.length > 0) pool = plain;
	}
	if (mode === "interface" || mode === "no-product-photo") {
		// 实物商品只避开「拿物件本身当主角」的版式；软件避开所有靠照片撑的。
		const honest = pool.filter((s) =>
			mode === "interface" ? worksWithoutPictures(s) : !s.tags.includes("object-led") || worksWithoutPictures(s),
		);
		if (honest.length >= 2) pool = honest;
	}
	const byDirection = pool.filter((s) => s.directions.includes(dir.id));
	if (byDirection.length > 0) return byDirection;
	const byTag = pool.filter((s) => s.tags.some((tag) => dir.sectionTags.includes(tag)));
	return byTag.length > 0 ? byTag : pool;
}

export function dealSection(
	dealer: Dealer,
	dir: TasteDirection,
	role: string,
	usedIds: readonly string[],
	neighbours: { prev: string | null; next: string | null },
	input: PageInput,
): TasteSection | null {
	let pool = sectionPool(dealer, dir, role, input);
	if (pool.length === 0) return null;
	if (imageryMode(input) === "interface") {
		const ui = pool.filter((s) => s.tags.includes("ui-led"));
		if (ui.length >= 2 && dealer.rnd() < 0.6) pool = ui;
	}
	const unused = pool.filter((s) => !usedIds.includes(s.id));
	if (unused.length > 0) pool = unused;
	// 相邻分区不共用同一种版式形状，否则整页读起来是一列重复的块。
	const varied = pool.filter((s) => s.shape !== neighbours.prev && s.shape !== neighbours.next);
	if (varied.length > 0) pool = varied;
	return pick(dealer.rnd, pool);
}

export function dealPage(dealer: Dealer, input: PageInput, directionId: string): PageChoice | null {
	const dir = dealer.lib.directions.find((d) => d.id === directionId);
	if (!dir) return null;
	const sections: PageChoice["sections"] = [];
	const shapes: (string | null)[] = [];
	for (const role of input.sections) {
		const used = sections.map((s) => s.id).filter((id): id is string => id !== null);
		const dealt = dealSection(dealer, dir, role, used, { prev: shapes.at(-1) ?? null, next: null }, input);
		sections.push({ role, id: dealt?.id ?? null });
		shapes.push(dealt?.shape ?? null);
	}
	return {
		directionId: dir.id,
		heroId: dealHero(dealer, dir, input, []).id,
		typeId: input.keep.includes("type") ? null : dealType(dealer, dir, []).id,
		paletteId: input.keep.includes("palette") ? null : dealPalette(dealer, dir, []).id,
		sections,
	};
}

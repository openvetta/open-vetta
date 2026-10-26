/**
 * taste-skill 研究库在 `.vetd` 里能用的那部分。
 *
 * 上游原样存放在 vendor/taste-skill/library/，这里是唯一的适配层：只挑工具真正用到的
 * 字段、丢掉 frame 用不上的（动效、滚动场景、远程照片、研究样本站点），并把字体组合
 * 收窄到 fontsource 装得上的那些。适配写在这里而不是改上游文件，上游更新时才能直接
 * 覆盖拷贝，不用合并。
 *
 * 数据随插件打包，但只在第一次发方向时才加载（动态 import 成单独 chunk）：整库约
 * 600KB，没理由让每个打开插件的会话都背着它。
 */
import { fontsourceFace } from "./fontsource";

export interface TasteDirection {
	id: string;
	name: string;
	sectors: string[];
	tones: string[];
	needs: string[];
	needsPictures: boolean;
	idea: string;
	composition: string;
	typography: string;
	typeIds: string[];
	typeClasses: string[];
	colour: string;
	paletteIds: string[];
	paletteTags: string[];
	sectionTags: string[];
	heroIds: string[];
	richness: string;
	pitfalls: string;
}

export interface TasteHero {
	id: string;
	name: string;
	directions: string[];
	needs: string[];
	blueprint: string;
	/** 手机宽度下的同一构图。 */
	mobile: string;
	headline: string;
}

export interface TasteSection {
	id: string;
	role: string;
	name: string;
	shape: string;
	tags: string[];
	directions: string[];
	needs: string[];
	blueprint: string;
	mobile: string;
}

export interface TasteFace {
	family: string;
	weights: number[];
	italic: boolean;
	settings: string;
}

export interface TasteType {
	id: string;
	name: string;
	class: string;
	display: TasteFace;
	text: TasteFace;
	/** 字号台阶，上游写成 `clamp(…vw…)`，渲染方向表时按画框宽度算成像素。 */
	scale: Record<string, string>;
	note: string;
}

export interface TastePalette {
	id: string;
	name: string;
	tags: string[];
	bg: string;
	surface: string;
	ink: string;
	muted: string;
	accent: string;
	accentInk: string;
	fields: { bg: string; ink: string | null }[];
	note: string;
}

export interface AppStyleFont {
	family: string;
	second: string | null;
	sizes: Record<string, number>;
	weights: number[];
	note: string;
}

export interface AppStyle {
	id: string;
	name: string;
	theme: "light" | "dark";
	suits: string[];
	idea: string;
	signature: string;
	colourBudget: string;
	avoid: string[];
	identity: string[];
	shell: string;
	shellAlternatives: string[];
	/** 颜色、尺寸等平铺 token；字体单独放在 `font`。 */
	colors: Record<string, string>;
	chart: string[];
	pills: Record<string, [string, string]>;
	radius: Record<string, number>;
	metrics: Record<string, number>;
	density: string;
	/** 只有个别深色风格的卡片带阴影；其余风格静止的东西一律不投影。 */
	shadow: string | null;
	font: AppStyleFont;
}

export interface AppShell {
	id: string;
	name: string;
	blueprint: string;
	phone: string;
	numbers: Record<string, string | number>;
}

export interface AppPattern {
	id: string;
	name: string;
	screen: string | null;
	kinds: string[] | null;
	signature: boolean;
	cues: string[];
	blueprint: string;
	phone: string;
}

export interface AppKind {
	note: string;
	styles: string[];
	screens: string[];
}

export interface TasteLibrary {
	directions: TasteDirection[];
	heroes: TasteHero[];
	sections: TasteSection[];
	type: TasteType[];
	palettes: TastePalette[];
	app: {
		styles: AppStyle[];
		shells: AppShell[];
		patterns: AppPattern[];
		kinds: Record<string, AppKind>;
	};
	/** 被剔除的字体组合 id，供测试与同步时核对。 */
	droppedType: string[];
}

export interface RawLibrary {
	directions: unknown;
	heroes: unknown;
	sections: unknown;
	type: unknown;
	palettes: unknown;
	app: unknown;
}

// ---------- 收窄 ----------
// vendor 数据是我们自己打包的，但它来自另一个仓库、会随同步整体替换：逐条收窄，
// 缺字段的条目直接跳过，而不是让一条坏数据在发方向时抛出来。

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strs = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const nums = (value: unknown): number[] =>
	Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
const list = (value: unknown): Obj[] => (Array.isArray(value) ? value.filter(isObj) : []);

function face(value: unknown): TasteFace | null {
	if (!isObj(value) || !str(value.family)) return null;
	return { family: str(value.family), weights: nums(value.weights), italic: value.italic === true, settings: str(value.settings) };
}

function direction(raw: Obj): TasteDirection | null {
	if (!str(raw.id) || !str(raw.idea) || !str(raw.composition)) return null;
	return {
		id: str(raw.id),
		name: str(raw.name),
		sectors: strs(raw.sectors),
		tones: strs(raw.tones),
		needs: strs(raw.needs),
		needsPictures: raw.needsPictures === true,
		idea: str(raw.idea),
		composition: str(raw.composition),
		typography: str(raw.typography),
		typeIds: strs(raw.type),
		typeClasses: strs(raw.typeClasses),
		colour: str(raw.colour),
		paletteIds: strs(raw.palettes),
		paletteTags: strs(raw.paletteTags),
		sectionTags: strs(raw.sectionTags),
		heroIds: strs(raw.heroes),
		richness: str(raw.richness),
		pitfalls: str(raw.pitfalls),
	};
}

function hero(raw: Obj): TasteHero | null {
	if (!str(raw.id) || !str(raw.blueprint)) return null;
	return {
		id: str(raw.id),
		name: str(raw.name),
		directions: strs(raw.directions),
		needs: strs(raw.needs),
		blueprint: str(raw.blueprint),
		mobile: str(raw.mobile),
		headline: str(raw.headline),
	};
}

function section(raw: Obj): TasteSection | null {
	if (!str(raw.id) || !str(raw.role) || !str(raw.blueprint)) return null;
	return {
		id: str(raw.id),
		role: str(raw.role),
		name: str(raw.name),
		shape: str(raw.shape),
		tags: strs(raw.tags),
		directions: strs(raw.directions),
		needs: strs(raw.needs),
		blueprint: str(raw.blueprint),
		mobile: str(raw.mobile),
	};
}

function typeSystem(raw: Obj): TasteType | null {
	const display = face(raw.display);
	const text = face(raw.text);
	if (!str(raw.id) || !display || !text) return null;
	const scale: Record<string, string> = {};
	if (isObj(raw.scale)) {
		for (const [step, value] of Object.entries(raw.scale)) if (typeof value === "string") scale[step] = value;
	}
	return { id: str(raw.id), name: str(raw.name), class: str(raw.class), display, text, scale, note: str(raw.note) };
}

function palette(raw: Obj): TastePalette | null {
	const required = ["id", "bg", "ink", "accent"] as const;
	if (required.some((key) => !str(raw[key]))) return null;
	return {
		id: str(raw.id),
		name: str(raw.name),
		tags: strs(raw.tags),
		bg: str(raw.bg),
		surface: str(raw.surface) || str(raw.bg),
		ink: str(raw.ink),
		muted: str(raw.muted) || str(raw.ink),
		accent: str(raw.accent),
		accentInk: str(raw.accentInk) || str(raw.bg),
		fields: list(raw.fields).map((field) => ({ bg: str(field.bg), ink: str(field.ink) || null })).filter((f) => f.bg),
		note: str(raw.note),
	};
}

/** `"Geist Mono, for IDs and keys only"` → `"Geist Mono"`。 */
function secondFamily(value: unknown): string | null {
	const family = str(value).split(",")[0]?.trim() ?? "";
	return family && !/^(system|inter\b)/i.test(family) ? family : null;
}

function appStyle(raw: Obj): AppStyle | null {
	const tokens = raw.tokens;
	if (!str(raw.id) || !isObj(tokens) || !isObj(tokens.font) || !str(tokens.font.family)) return null;
	const font = tokens.font;
	const colors: Record<string, string> = {};
	const metrics: Record<string, number> = {};
	for (const [key, value] of Object.entries(tokens)) {
		if (key === "font" || key === "density" || key === "shadow") continue;
		if (typeof value === "string") colors[key] = value;
		else if (typeof value === "number") metrics[key] = value;
	}
	const pills: Record<string, [string, string]> = {};
	if (isObj(tokens.pills)) {
		for (const [name, pair] of Object.entries(tokens.pills)) {
			const [bg, ink] = strs(pair);
			if (bg && ink) pills[name] = [bg, ink];
		}
	}
	const radius: Record<string, number> = {};
	if (isObj(tokens.radius)) {
		for (const [name, value] of Object.entries(tokens.radius)) if (typeof value === "number") radius[name] = value;
	}
	const sizes: Record<string, number> = {};
	if (isObj(font.sizes)) {
		for (const [name, value] of Object.entries(font.sizes)) if (typeof value === "number") sizes[name] = value;
	}
	return {
		id: str(raw.id),
		name: str(raw.name),
		theme: raw.theme === "dark" ? "dark" : "light",
		suits: strs(raw.suits),
		idea: str(raw.idea),
		signature: str(raw.signature),
		colourBudget: str(raw.colourBudget),
		avoid: strs(raw.avoid),
		identity: strs(raw.identity),
		shell: str(raw.shell),
		shellAlternatives: strs(raw.shellAlternatives),
		colors,
		chart: strs(tokens.chart),
		pills,
		radius,
		metrics,
		density: str(tokens.density),
		shadow: typeof tokens.shadow === "string" && tokens.shadow !== "" && tokens.shadow !== "none" ? tokens.shadow : null,
		font: {
			family: str(font.family),
			second: secondFamily(font.second),
			sizes,
			weights: nums(font.weights),
			note: str(font.note),
		},
	};
}

function appShell(raw: Obj): AppShell | null {
	if (!str(raw.id) || !str(raw.blueprint)) return null;
	const numbers: Record<string, string | number> = {};
	if (isObj(raw.numbers)) {
		for (const [key, value] of Object.entries(raw.numbers)) {
			if (typeof value === "string" || typeof value === "number") numbers[key] = value;
		}
	}
	return { id: str(raw.id), name: str(raw.name), blueprint: str(raw.blueprint), phone: str(raw.phone), numbers };
}

function appPattern(raw: Obj): AppPattern | null {
	if (!str(raw.id) || !str(raw.blueprint)) return null;
	return {
		id: str(raw.id),
		name: str(raw.name),
		screen: str(raw.screen) || null,
		kinds: Array.isArray(raw.kinds) ? strs(raw.kinds) : null,
		signature: raw.signature === true,
		cues: strs(raw.cues),
		blueprint: str(raw.blueprint),
		phone: str(raw.phone),
	};
}

const collect = <T>(value: unknown, parse: (raw: Obj) => T | null): T[] =>
	list(value)
		.map(parse)
		.filter((item): item is T => item !== null);

/** 两张面都在 fontsource 上，这套字体组合才能装进设计。 */
export function typeIsInstallable(type: TasteType): boolean {
	return fontsourceFace(type.display.family) !== null && fontsourceFace(type.text.family) !== null;
}

/** 纯函数：从原始 JSON 构造适配后的库。测试直接喂 vendor 文件。 */
export function adaptLibrary(raw: RawLibrary): TasteLibrary {
	const type = collect(raw.type, typeSystem);
	const app = isObj(raw.app) ? raw.app : {};
	const kinds: Record<string, AppKind> = {};
	if (isObj(app.kinds)) {
		for (const [id, value] of Object.entries(app.kinds)) {
			if (!isObj(value)) continue;
			kinds[id] = { note: str(value.note), styles: strs(value.styles), screens: strs(value.screens) };
		}
	}
	// App 风格的字体也必须装得上；上游七套目前全在 fontsource 上，这条过滤是同步的护栏。
	const styles = collect(app.styles, appStyle).filter(
		(style) => fontsourceFace(style.font.family) !== null && (!style.font.second || fontsourceFace(style.font.second)),
	);
	return {
		directions: collect(raw.directions, direction),
		heroes: collect(raw.heroes, hero),
		sections: collect(raw.sections, section),
		type: type.filter(typeIsInstallable),
		palettes: collect(raw.palettes, palette),
		app: {
			styles,
			shells: collect(app.shells, appShell),
			patterns: collect(app.patterns, appPattern),
			kinds,
		},
		droppedType: type.filter((entry) => !typeIsInstallable(entry)).map((entry) => entry.id),
	};
}

let cached: Promise<TasteLibrary> | null = null;

/** 第一次调用时加载并适配；之后复用同一份。 */
export function loadTasteLibrary(): Promise<TasteLibrary> {
	cached ??= Promise.all([
		import("../../vendor/taste-skill/library/directions.json"),
		import("../../vendor/taste-skill/library/heroes.json"),
		import("../../vendor/taste-skill/library/sections.json"),
		import("../../vendor/taste-skill/library/type.json"),
		import("../../vendor/taste-skill/library/palettes.json"),
		import("../../vendor/taste-skill/library/app.json"),
	]).then(([directions, heroes, sections, type, palettes, app]) =>
		adaptLibrary({
			directions: directions.default,
			heroes: heroes.default,
			sections: sections.default,
			type: type.default,
			palettes: palettes.default,
			app: app.default,
		}),
	);
	return cached;
}

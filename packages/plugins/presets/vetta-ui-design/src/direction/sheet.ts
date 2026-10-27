/**
 * 方向表：发出的方向在 `.vetd` 里的说法。
 *
 * 上游的方向表写给 HTML 页面（`:root` 变量、Google Fonts `<link>`、动效、远程照片），这里
 * 改写成 frame 能直接照抄的形状：theme.css 的 `@theme` token（沿用脚手架的 token 名，已有
 * frame 不会失去颜色）、要 vetd_install 的 fontsource 包、theme.css 顶部的 import 行。
 *
 * 篇幅是刻意压过的：方向表每次 choose/show 都整份进上下文。上游表里与 frame 无关的段落
 * （图片集、动效、滚动场景、参考站点）不渲染；与手机无关时不带手机版式，反之亦然；
 * 每份表都一样的规则写在 SKILL.md，不在这里重复。
 */
import type { AppChoice, ImageryMode, PageChoice, PageInput, AppInput } from "./deal";
import { imageryMode, signaturesFor } from "./deal";
import { axisFromSettings, type FontAxis, fontImports, fontsourcePackage, registeredFamily } from "./fontsource";
import { type Intent, intentLines } from "./intent";
import type { AppStyle, TasteHero, TasteLibrary, TastePalette, TasteSection, TasteType } from "./library";
import { renderTopic, screenTopics, sheetTopics } from "./topics";

/**
 * 保留品牌配色时最容易出的事：品牌色被当成主题色铺满全屏（实测里 Emby 绿上了 logo、
 * 角标、标题圆点、进度条、按钮和底栏）。品牌色进 `primary`，其余照方向的比例走中性色。
 */
const BRAND_COLOUR_BUDGET =
	"Map the brand onto `--color-surface` (ground), `--color-surface-foreground` (text), `--color-panel`, `--color-muted` and `--color-primary` / `--color-primary-foreground` in theme.css: its hue becomes `--color-primary` and goes on the one primary action and at most one other thing (the main data element, or the active state); the ground, panels and text stay neutral, and no second hue is added for decoration. A brand colour on every badge, bullet, link and icon is the generated look this budget exists to stop.";

/** 比这更窄的画框按手机版式交代。 */
const PHONE_MAX_WIDTH = 600;
/** 「一屏」的高度，版式里的 svh 按它换算。与 product-size.ts 的 desktop / mobile 一致。 */
const DESKTOP_SCREEN_HEIGHT = 900;
const PHONE_SCREEN_HEIGHT = 844;

const CJK_SERIF = '"Songti SC", "SimSun", ui-serif, serif';
const CJK_SANS = '"PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif';
const SERIF_CLASSES: readonly string[] = ["serif-display", "serif-light-large", "serif-text", "slab"];

export interface RenderedSheet {
	text: string;
	/** 这份方向要装的字体包，交给 vetd_install。 */
	packages: string[];
}

export interface SheetContext {
	frameWidth: number;
	seed: number;
	redraws: readonly { slot: string; reason: string }[];
	intent?: Intent;
}

/** 用户的原话与回答排在方向表最前：它们是硬条件，方向表的一切都在它们之下。 */
function userIntent(p: (line?: string) => void, intent: Intent | undefined): void {
	const lines = intentLines(intent);
	if (lines.length === 0) return;
	p("## What the user asked for — outranks everything below");
	for (const line of lines) p(line);
	p();
}

const isPhone = (ctx: SheetContext) => ctx.frameWidth > 0 && ctx.frameWidth < PHONE_MAX_WIDTH;

// ---------- 字体 ----------

function stack(family: string, serif: boolean): string {
	const name = registeredFamily(family) ?? family;
	return `"${name}", ${serif ? CJK_SERIF : CJK_SANS}`;
}

interface FontSpec {
	family: string;
	weights: readonly number[];
	italic: boolean;
	axis?: FontAxis | null;
}

/** 同一家族在显示与正文里各出现一次时合并字重，只 import 一遍。 */
function fontBlock(specs: readonly FontSpec[]): { imports: string[]; packages: string[] } {
	const merged = new Map<string, { weights: Set<number>; italic: boolean; axis: FontAxis | null }>();
	for (const spec of specs) {
		const entry = merged.get(spec.family) ?? { weights: new Set<number>(), italic: false, axis: null };
		for (const weight of spec.weights) entry.weights.add(weight);
		entry.italic ||= spec.italic;
		entry.axis ??= spec.axis ?? null;
		merged.set(spec.family, entry);
	}
	const imports: string[] = [];
	const packages: string[] = [];
	for (const [family, entry] of merged) {
		const pkg = fontsourcePackage(family);
		if (!pkg) continue;
		packages.push(pkg);
		imports.push(...fontImports(family, [...entry.weights], entry.italic, entry.axis));
	}
	return { imports, packages };
}

/**
 * 上游字号是 `clamp(min, a + b·vw, max)`。frame 宽度是固定的，所以直接算成像素给出，
 * 免得模型照抄一个按视口缩放的值。解析不了的原样保留。
 */
export function resolveClamp(value: string, frameWidth: number): string {
	const toPx = (part: string): number | null => {
		let total = 0;
		const terms = part.replace(/\s+/g, "").replace(/-/g, "+-").split("+").filter(Boolean);
		for (const term of terms) {
			const match = /^(-?\d*\.?\d+)(rem|px|vw)$/.exec(term);
			if (!match) return null;
			const n = Number(match[1]);
			total += match[2] === "rem" ? n * 16 : match[2] === "vw" ? (n * frameWidth) / 100 : n;
		}
		return total;
	};
	const clamp = /^clamp\(([^,]+),([^,]+),([^)]+)\)$/.exec(value.trim());
	if (!clamp) {
		const single = toPx(value);
		return single === null ? value : `${Math.round(single)}px`;
	}
	const [min, preferred, max] = [toPx(clamp[1]), toPx(clamp[2]), toPx(clamp[3])];
	if (min === null || preferred === null || max === null) return value;
	return `${Math.round(Math.min(max, Math.max(min, preferred)))}px`;
}

// ---------- 页面 ----------

/** 与 SKILL.md、脚手架共用的 token 名。改名会让已有 frame 失去颜色。 */
function paletteTokens(palette: TastePalette): string[] {
	const lines = [
		`--color-surface: ${palette.bg}; /* page ground */`,
		`--color-surface-foreground: ${palette.ink}; /* running text, full strength */`,
		`--color-panel: ${palette.surface}; /* the one tone step: panels, inputs, tiles */`,
		`--color-muted: ${palette.muted}; /* secondary notes only */`,
		`--color-primary: ${palette.accent}; /* the accent: the action and at most one other thing */`,
		`--color-primary-foreground: ${palette.accentInk};`,
	];
	palette.fields.forEach((field, index) => {
		lines.push(`--color-field-${index + 1}: ${field.bg}; /* a whole section's field */`);
		if (field.ink) lines.push(`--color-field-${index + 1}-foreground: ${field.ink};`);
	});
	return lines;
}

function typeTokens(type: TasteType, frameWidth: number): string[] {
	const displaySerif = SERIF_CLASSES.includes(type.class) && type.class !== "serif-text";
	const textSerif = type.class === "serif-text" || type.class === "slab";
	const lines = [
		`--font-display: ${stack(type.display.family, displaySerif)};`,
		`--font-sans: ${stack(type.text.family, textSerif)};`,
	];
	// `step-body` → `--text-body`，即 Tailwind 的 `text-body`。
	for (const [step, value] of Object.entries(type.scale)) {
		lines.push(`--text-${step.replace(/^step-/, "")}: ${resolveClamp(value, frameWidth)};`);
	}
	return lines;
}

/**
 * 版式取自真实网站，带着那个站点自己的字号、灰度、字体、配色和圆角。这里逐条列出它和
 * 规则、和发出的字体配色冲突的地方，省得模型一节一节自己去对。移植自上游的
 * `adjustments()`，去掉了 frame 不涉及的条目（吸顶滚动、混合模式）。
 */
export function adjustments(text: string, type: TasteType | null): string[] {
	const notes: string[] = [];
	const sizes = (re: RegExp) => [...new Set([...text.matchAll(re)].map((m) => `${m[1]}px`))];
	const notSpacing = String.raw`(?!\s*(?:gaps?|gutters?|margins?|padding|radius|corners?|apart|from|inset|offset|high|tall|wide|thick|square|borders?|stroke|rules?|line\b|dots?|circles?|bars?|of|between|beneath|below|above|under|down|up|across|deep|left|right|in\b|to\b|and\b|each))`;
	const tiny = sizes(
		new RegExp(
			String.raw`(?<!(?:radius|radii|gap|margin|padding|inset|offset)[:\s]{0,3}(?:of\s)?)\b(9|10|11|12)(?:\.\d)?px\b${notSpacing}`,
			"g",
		),
	);
	if (tiny.length > 0) notes.push(`It sets text at ${tiny.join(", ")}: use your small step (13px or more) instead.`);
	const running = sizes(/\b(14|15)px\s*(?:paragraphs?|body|text|descriptions?|copy|sentences?|answers?)/gi);
	if (running.length > 0) {
		notes.push(`It sets running text at ${running.join(", ")}: paragraphs use your body step (16px or more).`);
	}
	if (
		/\d{1,2}% (?:opacity|black|ink|grey|gray|white)|opacity:? ?0?\.\d|\b(?:rest|others?|remaining)\b[^.;]{0,25}\b(?:at|to) \d{1,2}%(?! (?:of|width|wide))/i.test(
			text,
		)
	) {
		notes.push(
			"It fades text: anything a reader reads is `text-surface-foreground` or `text-muted` at full strength. Tell the active item apart by ink against muted, weight or the accent, not by fading the rest.",
		);
	}
	if (/\d+px (?:corner )?radius|radius (?:of )?\d+px|\brounded\b|\bpill/i.test(text)) {
		notes.push("It names its own corners: use the one radius of this design and one button shape.");
	}
	if (/\b(?:serif|sans-serif|condensed|grotesk|italic|monospace|mono|all caps|uppercase|capitals|script)\b/i.test(text)) {
		notes.push(
			type
				? `It names a kind of typeface: use the dealt faces (display ${type.display.family}, text ${type.text.family}) and their settings.`
				: "It names a kind of typeface: use the brand faces.",
		);
	}
	const colours = [
		...new Set(
			[
				...text.matchAll(
					/\b(green|red|blue|yellow|orange|pink|purple|teal|navy|cream|beige|brown|grey|gray|white|black)\b(?![- ](?:space|studio|background disappears))/gi,
				),
			].map((m) => m[1].toLowerCase()),
		),
	];
	if (colours.length > 0) {
		notes.push(
			`It names colours (${colours.join(", ")}): map them onto the palette's tokens (ground \`surface\`, panels \`panel\` and the fields, text \`surface-foreground\`/\`muted\`, \`primary\` on the action only).`,
		);
	}
	if (
		/(?<!\b(?:no|without|never|not|nor) (?:a |any )?)\b(?:rule|rules|hairline|border|borders|divider|underline|thin line|1px line)\b/i.test(
			text,
		)
	) {
		notes.push(
			"It draws lines or borders: keep them inside a table, a form or a `data-ui` fragment; elsewhere separate with space or a change of ground.",
		);
	}
	if (/shadow|glow/i.test(text)) notes.push("It mentions a shadow: only on something open above the page (a menu, a dialog).");
	const bigSentence = [
		...text.matchAll(
			/\b(?:sentence|statement|paragraph|quotation|quote)\b[^.;]{0,40}?\b(?:at|to)\s+(?:clamp\(\s*\d+(?:\.\d+)?px,\s*)?(\d+(?:\.\d+)?)(px|vw)/gi,
		),
	].some((m) => (m[2] === "px" && Number(m[1]) > 36) || (m[2] === "vw" && Number(m[1]) > 2.6));
	if (bigSentence) {
		notes.push(
			"It sets a sentence large over several lines: that reads as a long headline. Cut it to a two-line headline at display size, or keep it a statement at 36px or less on three lines.",
		);
	}
	if (
		/tops? of the (?:letters|word|name|wordmark)|(?:letters|wordmark|name|word)\b[^.;]{0,30}\b(?:sliced|cut|cropped|clipped)[^.;]{0,20}\btop/i.test(
			text,
		)
	) {
		notes.push("It crops letters along their top: that reads as broken. Crop at the bottom edge or a side instead.");
	}
	if (/single action[^.;]{0,40}?\b(?:text link|underlined (?:text )?link)/i.test(text)) {
		notes.push(
			"Its action is a text link: the primary action on the first screen is a real button (44px or taller), placed where the blueprint puts the link.",
		);
	}
	if (type?.class === "condensed-heavy" && /\d+(?:\.\d+)?vw/.test(text)) {
		notes.push(
			"Its vw sizes assume a face of normal width: with this condensed face, size the words to fill the measure the blueprint gives them.",
		);
	}
	if (/\b0[1-9]\b(?![:.,]\d)|numbered|index number/i.test(text)) {
		notes.push("It numbers things 01, 02: drop the numbers unless they are real data (a price, a date, a count).");
	}
	return notes;
}

const FIND =
	"Find them with `vetd_assets` `search` — queries from your inventory (its place, its materials, its objects, its era, its weather), in plain English — read the contact sheet, and `get` each pick at the slot's display size.";

const IMAGERY: Record<ImageryMode, string> = {
	own: `Use the project's own images in every picture slot: put them in \`assets/\` and import them relatively. For slots they cannot fill, real pictures of the subject's world. ${FIND}`,
	interface:
		"**This subject is software, so its pictures are its own interface.** Wherever a blueprint says photograph or image, build a believable fragment of the product in TSX at true size (real labels, numbers that add up, one row selected or hovered), mark its root `data-ui`, and crop or scale it the way the blueprint treats a photograph. Never grey bars, never a device frame or browser chrome. If the product works on something physical (ships, plants, buildings, a city), one or two real pictures of that world can carry a section: `vetd_assets`, never passed off as the product's customers.",
	"no-product-photo": `**There are no photographs of the product and none can be faked.** Where the sheet calls for the object, draw it in TSX large and in its real colours, never a grey placeholder. Around it, real pictures of its world — its material up close, its workshop, its town, a museum piece of its kind — never one a visitor could take for the product. ${FIND}`,
	found: `**Real pictures carry this page.** Plan the set before building: four to twelve pictures of one family (one light, one treatment, the same crop ratios), the subject's world rather than the category's. ${FIND} A found picture shows the world around the client, never the client's own product, room, dish or team.`,
};

function sectionHeading(index: number, role: string, section: TasteSection | null): string {
	return section ? `### ${index}. ${role} — ${section.name} (${section.shape})` : `### ${index}. ${role}`;
}

export function renderPageSheet(
	lib: TasteLibrary,
	input: PageInput,
	choice: PageChoice,
	ctx: SheetContext,
): RenderedSheet {
	const out: string[] = [];
	const p = (line = "") => out.push(line);
	const dir = lib.directions.find((d) => d.id === choice.directionId);
	if (!dir) {
		return {
			text: `The saved direction \`${choice.directionId}\` is no longer in the library. Deal again with action "deal".`,
			packages: [],
		};
	}
	const hero: TasteHero | undefined = lib.heroes.find((h) => h.id === choice.heroId);
	const type = choice.typeId ? (lib.type.find((t) => t.id === choice.typeId) ?? null) : null;
	const palette = choice.paletteId ? (lib.palettes.find((x) => x.id === choice.paletteId) ?? null) : null;
	const phone = isPhone(ctx);
	const screenHeight = phone ? PHONE_SCREEN_HEIGHT : DESKTOP_SCREEN_HEIGHT;

	// 好几节版式都会撞上同一条调整（比如压窄字体下的 vw 字号）：出现两次以上的只在
	// 开头说一遍，每节下面只列它独有的，方向表因此短上一截。
	const blueprints: { key: string; text: string }[] = [
		...(hero ? [{ key: hero.id, text: [hero.blueprint, hero.mobile, hero.headline].join(" ") }] : []),
		...choice.sections.flatMap((entry) => {
			const section = entry.id ? lib.sections.find((s) => s.id === entry.id) : undefined;
			return section ? [{ key: section.id, text: [section.blueprint, section.mobile].join(" ") }] : [];
		}),
	];
	const notesByKey = new Map(blueprints.map((bp) => [bp.key, adjustments(bp.text, type)]));
	const counts = new Map<string, number>();
	for (const notes of notesByKey.values()) for (const note of notes) counts.set(note, (counts.get(note) ?? 0) + 1);
	const shared = [...counts].filter(([, count]) => count > 1).map(([note]) => note);
	const ownNotes = (key: string) => (notesByKey.get(key) ?? []).filter((note) => !shared.includes(note));

	p(`# Direction sheet — ${dir.name}`);
	p(
		`page · sector ${input.sector}${input.tone ? ` · tone ${input.tone}` : ""} · seed ${ctx.seed}${ctx.redraws.length > 0 ? ` · redraws ${ctx.redraws.length}` : ""} · frame ${ctx.frameWidth}px wide`,
	);
	if (input.brief) p(`Brief: ${input.brief}`);
	p();
	p("Adopt this direction; do not blend it with the layout you would have made anyway. Its parts were written separately and");
	p("will disagree in small ways. Settle them in this order: the house rules in the skill → the direction → type and colour");
	p("→ the hero → the sections. Take geometry from the blueprints (columns, proportions, what sits where) and everything else");
	p(`from above them. Blueprints were measured at 1440px: on this ${ctx.frameWidth}px frame 1vw = ${(ctx.frameWidth / 100).toFixed(1)}px.`);
	p(`One screen is ${screenHeight}px tall, so 80svh = ${Math.round(screenHeight * 0.8)}px. Write those as pixels: a landing frame is several`);
	p("screens tall, and vh/svh inside it measure the whole frame. Declare the frame's height as the page's real length.");
	p();
	userIntent(p, ctx.intent);
	p("## 1. The idea");
	p(dir.idea);
	p();
	p('Before building, fill this from your inventory of the subject: "On this page, ___ becomes ___." Put the nearest');
	p("competitor in the first blank: if the sentence still works, the idea belongs to the category, not to this client.");
	p();
	p("## 2. Composition");
	p(dir.composition);
	if (dir.richness) p(`Where the richness comes from: ${dir.richness}`);
	if (dir.pitfalls) p(`How this direction goes wrong: ${dir.pitfalls}`);
	p();

	const fonts = type
		? fontBlock([
				{
					family: type.display.family,
					weights: type.display.weights,
					italic: type.display.italic,
					axis: axisFromSettings(type.display.settings),
				},
				{
					family: type.text.family,
					weights: type.text.weights,
					italic: type.text.italic,
					axis: axisFromSettings(type.text.settings),
				},
			])
		: { imports: [], packages: [] };

	p("## 3. theme.css");
	if (!type || !palette) p(`Kept from the brand: ${[!type && "type", !palette && "colour"].filter(Boolean).join(" and ")}.`);
	if (!palette) p(BRAND_COLOUR_BUDGET);
	if (fonts.packages.length > 0) {
		p(`Install first, in one call: vetd_install with packages ${JSON.stringify(fonts.packages)}. Then replace theme.css with:`);
	}
	p("```css");
	for (const line of fonts.imports) p(line);
	if (fonts.imports.length > 0) p();
	p("@theme {");
	for (const line of palette ? paletteTokens(palette) : []) p(`\t${line}`);
	for (const line of type ? typeTokens(type, ctx.frameWidth) : []) p(`\t${line}`);
	p("}");
	p("```");
	p();
	if (type) {
		p(`## 4. Type — ${type.name}`);
		p(type.note);
		p(`- Display (\`font-display\`): ${type.display.family} — ${type.display.settings}`);
		p(`- Text (\`font-sans\`): ${type.text.family} — ${type.text.settings}`);
		if (dir.typography) p(dir.typography);
		p("The display size comes from the hero blueprint. Where the direction and the type system give different tracking or");
		p("leading, use the type system's values: they are tuned to this face.");
		p();
	}
	if (palette) {
		p(`## 5. Colour — ${palette.name}`);
		p(palette.note);
		if (dir.colour) p(dir.colour);
		p();
	}
	p("## 6. Pictures");
	p(IMAGERY[imageryMode(input)]);
	p("Never fill a picture slot with a gradient or a flat box holding an icon: `tell-fake-media` reports it, and a landing page with fewer than four real pictures reports `tell-few-pictures`.");
	p();
	if (shared.length > 0) {
		p("Adjusted throughout — every blueprint below that disagrees with this design does so here:");
		for (const note of shared) p(`- ${note}`);
		p();
	}
	if (hero) {
		p(`## 7. Hero — ${hero.name}`);
		p(phone && hero.mobile ? hero.mobile : hero.blueprint);
		if (hero.headline) p(`Headline: ${hero.headline}`);
		const notes = ownNotes(hero.id);
		if (notes.length > 0) {
			p("Adjusted for this design:");
			for (const note of notes) p(`- ${note}`);
		}
		p();
	}
	p("## 8. Sections, in order");
	p("Rebuild each with this project's content: keep the geometry, change the subject. Re-order or drop one when the");
	p("argument of the page needs it, never to fall back to a card grid. Carry the idea into every section, footer included.");
	choice.sections.forEach((entry, index) => {
		const section = entry.id ? (lib.sections.find((s) => s.id === entry.id) ?? null) : null;
		p();
		p(sectionHeading(index + 1, entry.role, section));
		if (!section) {
			p("No blueprint for this role. Compose it from the direction, with a layout shape its neighbours do not use.");
			return;
		}
		p(phone && section.mobile ? section.mobile : section.blueprint);
		const notes = ownNotes(section.id);
		if (notes.length > 0) {
			p("Adjusted for this design:");
			for (const note of notes) p(`- ${note}`);
		}
	});
	return { text: out.join("\n"), packages: fonts.packages };
}

// ---------- App 屏幕 ----------

const kebab = (key: string) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** 主色上的文字用黑还是白：取对比度高的那个。 */
export function readableOn(hex: string): string {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return "#ffffff";
	const n = Number.parseInt(match[1], 16);
	const channel = (value: number) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	const luminance = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
	return (1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05) ? "#ffffff" : "#0a0a0a";
}

/** App 风格的 token → 脚手架 token 名。`surface` 是页面底色，与页面方向表一致。 */
const APP_COLOR_NAMES: Record<string, string> = {
	ground: "surface",
	text: "surface-foreground",
	surface: "panel",
	accent: "primary",
};

function appTokens(style: AppStyle): string[] {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(style.colors)) {
		lines.push(`--color-${APP_COLOR_NAMES[key] ?? kebab(key)}: ${value};`);
	}
	if (style.colors.accent) lines.push(`--color-primary-foreground: ${readableOn(style.colors.accent)};`);
	style.chart.forEach((colour, index) => lines.push(`--color-chart-${index + 1}: ${colour};`));
	for (const [name, [bg, ink]] of Object.entries(style.pills)) {
		lines.push(`--color-pill-${name}: ${bg};`, `--color-pill-${name}-foreground: ${ink};`);
	}
	for (const [name, radius] of Object.entries(style.radius)) lines.push(`--radius-${name}: ${radius}px;`);
	for (const [name, size] of Object.entries(style.font.sizes)) lines.push(`--text-${name}: ${size}px;`);
	lines.push(`--font-sans: ${stack(style.font.family, false)};`);
	if (style.font.second) lines.push(`--font-mono: "${registeredFamily(style.font.second) ?? style.font.second}", ui-monospace, monospace;`);
	return lines;
}

export function renderAppSheet(lib: TasteLibrary, input: AppInput, choice: AppChoice, ctx: SheetContext): RenderedSheet {
	const out: string[] = [];
	const p = (line = "") => out.push(line);
	const style = lib.app.styles.find((s) => s.id === choice.styleId);
	if (!style) {
		return {
			text: `The saved app style \`${choice.styleId}\` is no longer in the library. Deal again with action "deal".`,
			packages: [],
		};
	}
	const shell = lib.app.shells.find((s) => s.id === choice.shellId);
	const phone = isPhone(ctx);
	const keepPalette = input.keep.includes("palette");
	const keepType = input.keep.includes("type");

	p(`# App sheet — ${style.name}`);
	p(
		`app · kind ${input.kind} · ${style.theme} · seed ${ctx.seed}${ctx.redraws.length > 0 ? ` · redraws ${ctx.redraws.length}` : ""} · frame ${ctx.frameWidth}px wide`,
	);
	if (input.brief) p(`Brief: ${input.brief}`);
	p();
	p("Adopt this style whole and keep its move intact; what it does not fix comes from references/taste/app-screens.md. The values");
	p("were measured on real product screens: use them as given rather than rounding them toward your habits.");
	p();
	userIntent(p, ctx.intent);
	p("## 1. The style");
	p(style.idea);
	p(`**The move:** ${style.signature}`);
	if (style.colourBudget) p(`**Colour budget:** ${style.colourBudget}.`);
	if (style.avoid.length > 0) p(`**Off-style here:** ${style.avoid.join("; ")}.`);
	p();
	if (style.identity.length > 0) {
		p("**Its face.** Choose one of these (or one of your own of the same weight) before you build and make sure it shows on");
		p("the first screen. Without one the screen reads as a well-applied kit, not this product.");
		for (const line of style.identity) p(`- ${line}`);
		p();
	}
	const signatures = signaturesFor(lib, input.brief);
	if (signatures.length > 0) {
		p("**Elements only this kind of product has** (build one of them into a screen):");
		for (const pattern of signatures) p(`- **${pattern.name}**. ${phone && pattern.phone ? pattern.phone : pattern.blueprint}`);
		p();
	}

	const fonts = keepType
		? { imports: [], packages: [] }
		: fontBlock([
				{ family: style.font.family, weights: style.font.weights, italic: false },
				...(style.font.second ? [{ family: style.font.second, weights: [400, 500], italic: false }] : []),
			]);
	p("## 2. theme.css");
	if (keepPalette || keepType) p(`Kept from the brand: ${[keepPalette && "colour", keepType && "type"].filter(Boolean).join(" and ")}.`);
	if (keepPalette) p(`${BRAND_COLOUR_BUDGET} ${style.colourBudget ? `This style's budget: ${style.colourBudget}.` : ""}`.trim());
	if (fonts.packages.length > 0) {
		p(`Install first, in one call: vetd_install with packages ${JSON.stringify(fonts.packages)}. Then replace theme.css with:`);
	}
	p("```css");
	for (const line of fonts.imports) p(line);
	if (fonts.imports.length > 0) p();
	p("@theme {");
	for (const line of appTokens(style)) {
		if (keepPalette && line.startsWith("--color-")) continue;
		if (keepType && line.startsWith("--font-")) continue;
		p(`\t${line}`);
	}
	p("}");
	p("```");
	const metrics = Object.entries(style.metrics).map(([key, value]) => `${kebab(key)} ${value}px`);
	if (metrics.length > 0) p(`Metrics: ${metrics.join(" · ")}. Density: ${style.density}. One gap value, horizontally and vertically.`);
	p(
		style.shadow
			? `Cards in this style cast \`${style.shadow}\`; nothing else casts a shadow.`
			: "No shadow on anything at rest.",
	);
	p();
	p(`## 3. Type — ${style.font.family}`);
	p(
		`Weights ${style.font.weights.join(", ")}.${style.font.note ? ` ${style.font.note}` : ""}${style.font.second ? ` Second face \`font-mono\` (${style.font.second}) for IDs and keys only.` : ""}`,
	);
	p("`tabular-nums` on every table, KPI and figure that updates. Sentence case; no tracked capitals.");
	p();
	if (shell) {
		p(`## 4. Shell — ${shell.name}`);
		p(phone && shell.phone ? shell.phone : shell.blueprint);
		const numbers = Object.entries(shell.numbers).map(([key, value]) => `${key} ${value}`);
		if (!phone && numbers.length > 0) p(`Numbers: ${numbers.join("; ")}.`);
		p();
	}
	p("## Pictures");
	p(
		"When the product's content is visual — films, music, shops, places, people, food — every cover, thumbnail, backdrop and avatar is a real picture: `vetd_assets` `search`, then `get` at the slot's display size, before the screen is built. Real film posters and brand artwork are not downloaded: make the catalogue fictional, a real photograph under a title set in the dealt type. A gradient or a flat box holding an icon in a picture slot reports `tell-fake-media`.",
	);
	p();
	p("## 5. Screens");
	for (const screen of choice.screens) {
		const pattern = screen.patternId ? lib.app.patterns.find((x) => x.id === screen.patternId) : undefined;
		const parts = screenTopics(screen.patternId);
		p();
		if (!pattern) {
			p(`### ${screen.name}`);
			p("No pattern in the library for this screen and this kind of product. Compose it from references/taste/app-screens.md.");
		} else {
			p(`### ${screen.name} — ${pattern.name}`);
			p(phone && pattern.phone ? pattern.phone : pattern.blueprint);
		}
		p(`Reference parts for this screen (section 6): ${parts.join(", ")}.`);
	}
	p();
	p("## 6. Reference for these screens");
	p("The parts of references/taste/app-screens.md that the screens above use; the file itself holds what every screen needs.");
	for (const topic of sheetTopics(
		choice.screens.map((screen) => screen.patternId),
		{ phone, keepsStyle: keepPalette || keepType },
	)) {
		p();
		p(renderTopic(topic));
	}
	return { text: out.join("\n"), packages: fonts.packages };
}

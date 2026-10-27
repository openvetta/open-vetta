/**
 * 上游字体库里每个家族在 fontsource 上的真实包名。
 *
 * 上游的 type.json 用 Google Fonts / Fontshare 的 `<link>` 加载字体，而 frame 禁止远程
 * 字体，只能装 npm 包。Fontshare 的字体不在 fontsource 上，近似替换也不成立——上游给的
 * 字距、行距是按原字体调的——所以用到它们的字体组合整套不发，见 library.ts。
 *
 * 表里每一行都在 npm registry 上核对过（2026-10-26；字体指引 typography.md 点名、上游库没用到的
 * 那十五款 2026-10-27 补核）：`variable` 为真时用
 * `@fontsource-variable/<slug>`，注册的家族名带 ` Variable` 后缀；否则用静态包
 * `@fontsource/<slug>`，每个字重要单独 import。`italic` 为真表示该包带斜体文件。
 * `axes` 是除字重外还发布了的轴文件（`wdth.css`、`opsz.css`，注册同一个家族名）：
 * 上游有几套字体要靠压窄/拉宽或光学尺寸才成立，裸 import 只带字重轴。
 */

export type FontAxis = "wdth" | "opsz";

export interface FontsourceFace {
	slug: string;
	variable: boolean;
	italic: boolean;
	axes: readonly FontAxis[];
}

const face = (slug: string, variable: boolean, italic = false, axes: readonly FontAxis[] = []): FontsourceFace => ({
	slug,
	variable,
	italic,
	axes,
});

export const FONTSOURCE_FACES: Readonly<Record<string, FontsourceFace>> = {
	"Albert Sans": face("albert-sans", true),
	Anton: face("anton", false),
	Archivo: face("archivo", true, false, ["wdth"]),
	Barlow: face("barlow", false),
	"Barlow Condensed": face("barlow-condensed", false),
	"Bebas Neue": face("bebas-neue", false),
	Besley: face("besley", true),
	"Big Shoulders": face("big-shoulders", true),
	"Big Shoulders Display": face("big-shoulders-display", true),
	Bitter: face("bitter", true, true),
	"Bodoni Moda": face("bodoni-moda", true, true, ["opsz"]),
	"Bricolage Grotesque": face("bricolage-grotesque", true, false, ["wdth", "opsz"]),
	Chivo: face("chivo", true),
	"Cormorant Garamond": face("cormorant-garamond", true, true),
	"Crimson Pro": face("crimson-pro", true, true),
	"DM Sans": face("dm-sans", true),
	"DM Serif Display": face("dm-serif-display", false, true),
	"EB Garamond": face("eb-garamond", true, true),
	Epilogue: face("epilogue", true),
	"Familjen Grotesk": face("familjen-grotesk", true, true),
	Figtree: face("figtree", true),
	Fraunces: face("fraunces", true, true, ["opsz"]),
	Geist: face("geist", true),
	"Geist Mono": face("geist-mono", true),
	"Hanken Grotesk": face("hanken-grotesk", true),
	"IBM Plex Mono": face("ibm-plex-mono", false),
	"IBM Plex Sans": face("ibm-plex-sans", true),
	Imbue: face("imbue", true, false, ["opsz"]),
	Inter: face("inter", true),
	"Instrument Sans": face("instrument-sans", true),
	"Instrument Serif": face("instrument-serif", false, true),
	"Inter Tight": face("inter-tight", true, true),
	"JetBrains Mono": face("jetbrains-mono", true, true),
	Jost: face("jost", true),
	"League Spartan": face("league-spartan", true),
	"Libre Franklin": face("libre-franklin", true),
	Literata: face("literata", true, true, ["opsz"]),
	Manrope: face("manrope", true),
	"Martian Mono": face("martian-mono", true, false, ["wdth"]),
	Newsreader: face("newsreader", true, true, ["opsz"]),
	Nunito: face("nunito", true, true),
	Onest: face("onest", true),
	"Plus Jakarta Sans": face("plus-jakarta-sans", true, true),
	"Public Sans": face("public-sans", true),
	Quicksand: face("quicksand", true),
	"Red Hat Display": face("red-hat-display", true),
	"Red Hat Text": face("red-hat-text", true),
	Rokkitt: face("rokkitt", true),
	"Schibsted Grotesk": face("schibsted-grotesk", true),
	"Source Serif 4": face("source-serif-4", true, true),
	"Space Grotesk": face("space-grotesk", true),
	"Stack Sans Headline": face("stack-sans-headline", true),
	"Stack Sans Text": face("stack-sans-text", true),
	"STIX Two Text": face("stix-two-text", true, true),
	Syne: face("syne", true),
	"TikTok Sans": face("tiktok-sans", true, false, ["wdth"]),
	Unbounded: face("unbounded", true),
	"Work Sans": face("work-sans", true),
	"Young Serif": face("young-serif", false),
	"Zilla Slab": face("zilla-slab", false, true),
};

/**
 * 核对过、fontsource 上没有的家族（Fontshare 独占）。单列出来是为了让库测试能区分
 * 「已知不可用」和「上游新加、还没人核对」——后者必须有人去 registry 查一次。
 */
export const UNAVAILABLE_FAMILIES: readonly string[] = [
	"Boska",
	"Cabinet Grotesk",
	"Chillax",
	"Clash Grotesk",
	"Erode",
	"Gambarino",
	"General Sans",
	"Panchang",
	"Pilcrow Rounded",
	"Roundo",
	"Sentient",
	"Switzer",
	"Zodiak",
];

/**
 * 只发布了 400 一个字重的静态包（npm 上核对过，2026-10-27）。上游字体组合自带字重表，
 * 不会点到不存在的文件；App 方向的字重由工具定，import 一个不存在的字重文件会让整个
 * 画布构建失败，所以要知道哪些只有 400。
 */
const SINGLE_WEIGHT_FAMILIES: readonly string[] = ["Anton", "Bebas Neue", "DM Serif Display", "Instrument Serif", "Young Serif"];

/** 想要的字重里这个家族真有的那些；可变包每个字重都有。 */
export function availableWeights(family: string, wanted: readonly number[]): number[] {
	return SINGLE_WEIGHT_FAMILIES.includes(family) ? [400] : [...wanted];
}

export function fontsourceFace(family: string): FontsourceFace | null {
	return FONTSOURCE_FACES[family] ?? null;
}

/** npm 包名。 */
export function fontsourcePackage(family: string): string | null {
	const found = fontsourceFace(family);
	if (!found) return null;
	return `${found.variable ? "@fontsource-variable" : "@fontsource"}/${found.slug}`;
}

/** 包注册到浏览器里的家族名——theme.css 的 `--font-*` 必须一字不差地写它。 */
export function registeredFamily(family: string): string | null {
	const found = fontsourceFace(family);
	if (!found) return null;
	return found.variable ? `${family} Variable` : family;
}

/** 字体设置里点名要用的轴：「font-stretch 62%」「load the wdth axis」「optical sizing on」。 */
export function axisFromSettings(settings: string): FontAxis | null {
	if (/\bwdth\b|font-stretch/i.test(settings)) return "wdth";
	if (/optical sizing/i.test(settings)) return "opsz";
	return null;
}

/**
 * theme.css 顶部要写的 import 行。可变包一行覆盖所有字重（要用的轴换成对应轴文件）；
 * 静态包的裸 import 只有 400，其余字重不单独 import 浏览器就会用 400 伪造粗体。
 */
export function fontImports(
	family: string,
	weights: readonly number[],
	italic: boolean,
	axis: FontAxis | null = null,
): string[] {
	const found = fontsourceFace(family);
	const pkg = fontsourcePackage(family);
	if (!found || !pkg) return [];
	const lines: string[] = [];
	if (found.variable) {
		const file = axis && found.axes.includes(axis) ? axis : null;
		lines.push(file ? `@import "${pkg}/${file}.css";` : `@import "${pkg}";`);
		if (italic && found.italic) lines.push(`@import "${pkg}/${file ?? "wght"}-italic.css";`);
		return lines;
	}
	const list = weights.length > 0 ? [...new Set(weights)].sort((a, b) => a - b) : [400];
	for (const weight of list) {
		lines.push(`@import "${pkg}/${weight}.css";`);
		if (italic && found.italic) lines.push(`@import "${pkg}/${weight}-italic.css";`);
	}
	return lines;
}

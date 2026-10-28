/**
 * App 屏幕的方向：由 agent 自拟三个，工具只校验，不再从模板库里发。
 *
 * 为什么不发模板：从前的 App 库是 7 套从桌面后台研究出来的整套风格（色值、字体、圆角、
 * 外壳全定死），按 kind 对号入座。实测里点单、外卖、银行、天气这些面向用户的 App 全被
 * 套进后台风格，finance 永远只发同两张牌，六份银行首页同一个蓝、同一款字、同一个圆角——
 * 模板一窄，结果就千篇一律。
 *
 * 为什么也不完全放开：让模型凭空定调，它每次落到同一组默认值上（靛蓝、Inter、白卡片），
 * 这就是 AI 味。所以这里只管两件可以机械判断的事：
 * - 不许回到默认值：靛蓝和紫、被用烂的标题字、对比度不够；
 * - 三个方向彼此要拉开，也不许重复最近几份设计用过的组合。
 * 至于方向从哪来，交给 agent 读这个产品自己的东西去想（「先写平庸版本再避开」「产品
 * 独有的东西变成设计手法」），那部分规则在 SKILL.md 和提案说明里，工具只核对字段在不在。
 *
 * 这里全是纯函数：历史记录由调用方传入。
 */
import type { DealHistoryEntry, KeepSlot } from "./deal";
import { FONTSOURCE_FACES, fontsourceFace } from "./fontsource";
import type { Boldness, StatedIntent } from "./intent";
import type { TasteLibrary } from "./library";

/** 标题字的类别：判断三个方向是否拉开的轴之一，取自上游字体库的分类再加等宽。 */
export const TYPE_CLASSES = [
	"grotesk-tight",
	"grotesk-light",
	"geometric",
	"rounded-friendly",
	"condensed-heavy",
	"extended-heavy",
	"heavy-black",
	"serif-display",
	"serif-light-large",
	"serif-text",
	"slab",
	"mono",
] as const;
export type TypeClass = (typeof TYPE_CLASSES)[number];

/**
 * 默认全禁、方向写明理由才放行的表现手法 → 截图机检里对应的规则。
 * 这些手法本身不是 AI 味，没有理由地到处用才是；一律禁掉只会把设计压回平涂白卡片。
 */
export const DEVICE_TELLS = {
	gradient: ["tell-gradient", "tell-gradient-text"],
	shadow: ["tell-shadow"],
	glass: ["tell-glass"],
	texture: ["tell-gradient", "tell-shadow"],
	mono: ["tell-mono"],
	"third-face": ["tell-font-count"],
	"tracked-caps": ["tell-micro-label"],
} as const;
export type Device = keyof typeof DEVICE_TELLS;
export const DEVICES = Object.keys(DEVICE_TELLS) as Device[];

/** 被用烂的标题字（references/taste/typography.md），只算可装的那几款。 */
export const OVERUSED_DISPLAY = ["Inter", "DM Sans", "Manrope", "Plus Jakarta Sans"] as const;

export interface ProposalColours {
	ground: string;
	panel: string;
	text: string;
	muted: string;
	accent: string;
	onAccent: string;
	/** 方向自己需要的额外颜色（类别色、整块色面…），token 名 → 色值。 */
	extra: Record<string, string>;
}

/** 首屏外壳的类型。大胆档位要求三案各不相同：只换配色字体、骨架还是同一个，用起来仍是一个样。 */
export const SHELLS = ["sidebar", "topbar", "bottom-tabs", "full-bleed", "split", "rail"] as const;
export type Shell = (typeof SHELLS)[number];

export interface AppProposal {
	id: string;
	name: string;
	/** 「在这几屏上，<只有这个产品才有的东西> 变成 <设计手法>」。 */
	idea: string;
	/** 它相对平庸版本改了什么、为什么。 */
	departs: string;
	theme: "light" | "dark";
	/** 保留品牌配色时为 null。 */
	colours: ProposalColours | null;
	/** 保留品牌字体时为 null。 */
	type: { display: string; text: string; class: TypeClass } | null;
	/** 首屏怎么构图：什么最大、放在哪、几屏之间怎么走。 */
	layout: string;
	radius: number | null;
	devices: { device: Device; reason: string }[];
	/** 导航与内容怎么搭。没声明为 null；大胆档位必填。 */
	shell: Shell | null;
	/** 这一案主动违反的一条默认规则及理由（出格预算）。没有为空串；大胆档位必填。 */
	breaks: string;
}

export class ProposalError extends Error {}

// ---------- 颜色 ----------

/** `#abc` / `#aabbcc` → 0xRRGGBB；其余写法不收，theme.css 里要的就是十六进制。 */
export function parseHex(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
	if (!match) return null;
	const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
	return Number.parseInt(digits, 16);
}

function luminance(rgb: number): number {
	const channel = (value: number) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel((rgb >> 16) & 255) + 0.7152 * channel((rgb >> 8) & 255) + 0.0722 * channel(rgb & 255);
}

export function contrast(a: string, b: string): number {
	const x = parseHex(a);
	const y = parseHex(b);
	if (x === null || y === null) return 0;
	const [hi, lo] = [luminance(x), luminance(y)].sort((m, n) => n - m);
	return (hi + 0.05) / (lo + 0.05);
}

/** 主色上的文字用黑还是白：取对比度高的那个。 */
export function readableOn(hex: string): string {
	return contrast(hex, "#ffffff") >= contrast(hex, "#0a0a0a") ? "#ffffff" : "#0a0a0a";
}

/**
 * 色系：判断「拉开」与「默认值」用。饱和度低的一律算中性——近黑近白的主色是一种
 * 选择，不是某个色相。边界按肉眼的叫法切：Material 那一档的蓝落在 blue，靛蓝到紫
 * 单独一档 violet。
 */
export type HueFamily = "neutral" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink";

export function hueFamily(hex: string): HueFamily {
	const rgb = parseHex(hex);
	if (rgb === null) return "neutral";
	const r = ((rgb >> 16) & 255) / 255;
	const g = ((rgb >> 8) & 255) / 255;
	const b = (rgb & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	const lightness = (max + min) / 2;
	const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
	if (saturation < 0.18 || delta < 0.08) return "neutral";
	let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
	hue = (hue * 60 + 360) % 360;
	if (hue < 15 || hue >= 345) return "red";
	if (hue < 42) return "orange";
	if (hue < 68) return "yellow";
	if (hue < 160) return "green";
	if (hue < 196) return "teal";
	if (hue < 236) return "blue";
	if (hue < 290) return "violet";
	return "pink";
}

// ---------- 收窄与校验 ----------

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN = /^[a-z][a-z0-9-]*$/;
/** 额外颜色不许占用脚手架与方向表的 token 名，否则会把基础色覆盖掉。 */
const RESERVED_TOKENS = ["surface", "surface-foreground", "panel", "muted", "primary", "primary-foreground"];
const MAX_EXTRA = 10;

export interface ProposalContext {
	keep: readonly KeepSlot[];
	stated: StatedIntent;
	history: readonly DealHistoryEntry[];
}

const installable = () => Object.keys(FONTSOURCE_FACES).join(", ");

/** 用户自己点了颜色或品牌，靛蓝紫就可能是对的，不拦。 */
const userNamedColour = (stated: StatedIntent) => Boolean(stated.colour || stated.brand || stated.mood);

function parseOne(raw: unknown, index: number, ctx: ProposalContext, problems: string[]): AppProposal | null {
	const at = `options[${index}]`;
	if (!isObj(raw)) {
		problems.push(`${at} is not an object.`);
		return null;
	}
	const id = text(raw.id);
	if (!ID.test(id)) problems.push(`${at}.id must be kebab-case (e.g. "roast-ledger").`);
	const name = text(raw.name);
	const idea = text(raw.idea);
	const departs = text(raw.departs);
	const layout = text(raw.layout);
	if (!name) problems.push(`${at}.name is missing.`);
	if (idea.length < 30) {
		problems.push(
			`${at}.idea is missing or too thin: write "On these screens, <something only this product has> becomes <the device>."`,
		);
	}
	if (departs.length < 20) problems.push(`${at}.departs: say what this direction changes from \`obvious\`, and why.`);
	if (layout.length < 30) problems.push(`${at}.layout: describe the first screen — what is largest, where it sits, how people move between screens.`);
	const theme = raw.theme === "light" || raw.theme === "dark" ? raw.theme : null;
	if (!theme) problems.push(`${at}.theme is "light" or "dark".`);

	let colours: ProposalColours | null = null;
	if (!ctx.keep.includes("palette")) {
		const c = isObj(raw.colours) ? raw.colours : {};
		const base = ["ground", "panel", "text", "muted", "accent"] as const;
		const bad = base.filter((key) => parseHex(c[key]) === null);
		if (bad.length > 0) {
			problems.push(`${at}.colours needs hex values (#rrggbb) for: ${bad.join(", ")}.`);
		} else {
			const pick = (key: string) => text(c[key]).toLowerCase();
			const onAccent = parseHex(c.onAccent) !== null ? pick("onAccent") : readableOn(pick("accent"));
			const extra: Record<string, string> = {};
			if (isObj(c.extra)) {
				for (const [token, value] of Object.entries(c.extra).slice(0, MAX_EXTRA)) {
					if (!TOKEN.test(token) || RESERVED_TOKENS.includes(token)) {
						problems.push(`${at}.colours.extra: "${token}" is not a free token name (kebab-case, not one of ${RESERVED_TOKENS.join(", ")}).`);
					} else if (parseHex(value) === null) {
						problems.push(`${at}.colours.extra.${token} is not a hex colour.`);
					} else {
						extra[token] = text(value).toLowerCase();
					}
				}
			}
			colours = { ground: pick("ground"), panel: pick("panel"), text: pick("text"), muted: pick("muted"), accent: pick("accent"), onAccent, extra };
			const pairs: [string, string, string, number][] = [
				["text", colours.text, colours.ground, 7],
				["muted", colours.muted, colours.ground, 4.5],
				["text on panel", colours.text, colours.panel, 4.5],
				["onAccent", colours.onAccent, colours.accent, 4.5],
			];
			for (const [label, fg, bg, min] of pairs) {
				const ratio = contrast(fg, bg);
				if (ratio < min) problems.push(`${at}: ${label} is ${ratio.toFixed(2)}:1, needs ${min}:1.`);
			}
			if (hueFamily(colours.accent) === "violet" && !userNamedColour(ctx.stated)) {
				problems.push(
					`${at}: an indigo or violet accent (${colours.accent}) is the generated default. Take the accent from this product's own world instead.`,
				);
			}
		}
	}

	let type: AppProposal["type"] = null;
	if (!ctx.keep.includes("type")) {
		const t = isObj(raw.type) ? raw.type : {};
		const display = text(t.display);
		const body = text(t.text);
		const cls = TYPE_CLASSES.find((value) => value === t.class) ?? null;
		const unknown = [display, body].filter((family) => !fontsourceFace(family));
		if (unknown.length > 0) {
			problems.push(`${at}.type: ${unknown.map((f) => `"${f}"`).join(", ")} cannot be installed here. Installable faces: ${installable()}.`);
		}
		if ((OVERUSED_DISPLAY as readonly string[]).includes(display)) {
			problems.push(`${at}.type.display: ${display} is what the average screen already uses. Pick a display face with a character this product earns.`);
		}
		if (!cls) problems.push(`${at}.type.class is one of: ${TYPE_CLASSES.join(", ")} (the class of the display face).`);
		if (unknown.length === 0 && cls) type = { display, text: body, class: cls };
	}

	const radius = typeof raw.radius === "number" && raw.radius >= 0 && raw.radius <= 48 ? Math.round(raw.radius) : null;
	const devices: AppProposal["devices"] = [];
	for (const entry of Array.isArray(raw.devices) ? raw.devices : []) {
		if (!isObj(entry)) continue;
		const device = DEVICES.find((value) => value === entry.device);
		const reason = text(entry.reason);
		if (!device) {
			problems.push(`${at}.devices: "${String(entry.device)}" is not one of ${DEVICES.join(", ")}.`);
		} else if (reason.length < 10) {
			problems.push(`${at}.devices.${device}: give the reason this direction needs it.`);
		} else if (!devices.some((d) => d.device === device)) {
			devices.push({ device, reason });
		}
	}

	const shell = SHELLS.find((value) => value === raw.shell) ?? null;
	if (raw.shell !== undefined && raw.shell !== null && !shell) problems.push(`${at}.shell is one of: ${SHELLS.join(", ")}.`);
	const breaks = text(raw.breaks);
	if (ctx.stated.boldness === "bold") {
		if (!shell) problems.push(`${at}.shell is required for a bold design: ${SHELLS.join(", ")}.`);
		if (breaks.length < 20) {
			problems.push(
				`${at}.breaks is required for a bold design: name the one default rule this option deliberately breaks (an oversized figure, a full-bleed colour field, a gradient surface, an off-axis crop…) and why it suits this product.`,
			);
		}
	}

	if (!ID.test(id) || !name || !theme) return null;
	if (!ctx.keep.includes("palette") && !colours) return null;
	if (!ctx.keep.includes("type") && !type) return null;
	return { id, name, idea, departs, theme, colours, type, layout, radius, devices, shell, breaks };
}

interface Axes {
	theme: string;
	hue: string | null;
	type: string | null;
}

function axesOf(proposal: AppProposal): Axes {
	return {
		theme: proposal.theme,
		hue: proposal.colours ? hueFamily(proposal.colours.accent) : null,
		type: proposal.type?.class ?? null,
	};
}

/**
 * 两个方向要在几条轴上不同。三条轴都自由时要两条：只换一个主色、或只把白底翻成黑底，
 * 看起来仍是同一份设计。品牌锁住了配色或字体，可比的轴变少，要求跟着降。
 */
function requiredDifferences(free: number): number {
	return free >= 3 ? 2 : free === 2 ? 1 : 0;
}

function divergenceProblems(proposals: readonly AppProposal[], ctx: ProposalContext): string[] {
	const problems: string[] = [];
	const free = 1 + (ctx.keep.includes("palette") ? 0 : 1) + (ctx.keep.includes("type") ? 0 : 1);
	const need = requiredDifferences(free);
	const all = proposals.map(axesOf);
	const allSameTheme = all.every((a) => a.theme === all[0]?.theme);
	for (let i = 0; i < proposals.length; i++) {
		for (let j = i + 1; j < proposals.length; j++) {
			const [a, b] = [all[i], all[j]];
			// 用户定了明暗、三个都同一种时，明暗这条轴不算：要求落在另外两条上。
			const axes: (keyof Axes)[] = allSameTheme ? ["hue", "type"] : ["theme", "hue", "type"];
			const differing = axes.filter((axis) => a[axis] !== b[axis]).length;
			const required = allSameTheme ? Math.min(need, axes.filter((axis) => a[axis] !== null).length) : need;
			if (differing < required) {
				problems.push(
					`"${proposals[i].id}" and "${proposals[j].id}" are the same direction twice (${describe(a)} vs ${describe(b)}): make them differ in at least ${required} of light/dark, accent colour family and display type class.`,
				);
			}
		}
	}
	if (ctx.stated.boldness === "bold") {
		const shells = proposals.map((proposal) => proposal.shell);
		if (new Set(shells).size < shells.length) {
			problems.push(`A bold design needs three different shells (got ${shells.join(", ")}): the options must differ in structure, not only in colour and type.`);
		}
	}
	if (!ctx.keep.includes("palette") && all.filter((a) => a.hue === "blue").length > 1) {
		problems.push("More than one option has a blue accent: blue is where generated apps land. Keep at most one.");
	}
	return problems;
}

const describe = (axes: Axes) => [axes.theme, axes.hue, axes.type].filter(Boolean).join(" · ");

/** 最近几份 App 设计用过的「明暗 + 色系 + 字类」组合，或同一款标题字配同一色系，不再出现。 */
const RECENT_APP_DESIGNS = 3;

function historyProblems(proposals: readonly AppProposal[], ctx: ProposalContext): string[] {
	const recent = ctx.history.filter((entry) => entry.mode === "app" && entry.theme).slice(0, RECENT_APP_DESIGNS);
	const problems: string[] = [];
	for (const proposal of proposals) {
		const axes = axesOf(proposal);
		const clash = recent.find(
			(entry) =>
				(axes.hue !== null && entry.hue === axes.hue && entry.theme === axes.theme && entry.typeClass === axes.type) ||
				(proposal.type && axes.hue !== null && entry.display === proposal.type.display && entry.hue === axes.hue),
		);
		if (clash) {
			problems.push(
				`"${proposal.id}" repeats a recent design (${[clash.theme, clash.hue, clash.typeClass, clash.display].filter(Boolean).join(" · ")}). Move it somewhere the last few designs have not been.`,
			);
		}
	}
	return problems;
}

/** 校验整份提案；有任何问题就把全部问题一次列出来抛出，agent 一轮改完。 */
export function parseProposals(rawOptions: unknown, rawObvious: unknown, ctx: ProposalContext): { obvious: string; proposals: AppProposal[] } {
	const problems: string[] = [];
	const obvious = text(rawObvious);
	if (obvious.length < 30) {
		problems.push(
			"`obvious` is missing: first write the version you would make by habit for this brief — its colours, its typeface, its layout — in one or two sentences. The three options then depart from it.",
		);
	}
	const list = Array.isArray(rawOptions) ? rawOptions : [];
	if (list.length !== 3) problems.push(`Propose exactly three options (got ${list.length}).`);
	const proposals = list
		.slice(0, 3)
		.map((raw, index) => parseOne(raw, index, ctx, problems))
		.filter((p): p is AppProposal => p !== null);
	const ids = proposals.map((p) => p.id);
	if (new Set(ids).size !== ids.length) problems.push("Option ids must be unique.");
	if (proposals.length === 3 && problems.length === 0) {
		problems.push(...divergenceProblems(proposals, ctx), ...historyProblems(proposals, ctx));
	}
	if (problems.length > 0) {
		throw new ProposalError(`Revise the proposal and call propose again:\n- ${problems.join("\n- ")}`);
	}
	return { obvious, proposals };
}

// ---------- 给 agent 的说明与原料 ----------

/** 用户读得懂的一行：明暗、底色、主色、字体、构图的第一句。 */
export function proposalLook(proposal: AppProposal): string {
	const parts = [
		proposal.theme === "dark" ? "Dark" : "Light",
		proposal.colours && `ground ${proposal.colours.ground}, accent ${proposal.colours.accent}`,
		proposal.type && (proposal.type.display === proposal.type.text ? proposal.type.display : `${proposal.type.display} / ${proposal.type.text}`),
		proposal.layout.split(/(?<=[.;])\s/)[0],
	];
	return parts.filter(Boolean).join(" · ");
}

/** 用户要有个性或大胆时，不必逐项写理由就放行的表现手法。 */
const BOLDNESS_DEVICES: Record<Boldness, readonly Device[]> = {
	restrained: [],
	expressive: ["gradient", "shadow", "glass"],
	bold: ["gradient", "shadow", "glass", "third-face", "tracked-caps"],
};

/** 这个方向放行的机检规则：它写明理由要用的表现手法，加上用户要的大胆度自带放行的。 */
export function proposalTells(proposal: AppProposal, boldness: Boldness = "restrained"): string[] {
	const devices = [...proposal.devices.map(({ device }) => device), ...BOLDNESS_DEVICES[boldness]];
	return [...new Set(devices.flatMap((device) => [...DEVICE_TELLS[device]]))];
}

/** 历史里只记能比的几项。 */
export function proposalHistory(proposal: AppProposal): Pick<DealHistoryEntry, "theme" | "hue" | "typeClass" | "display"> {
	return {
		theme: proposal.theme,
		...(proposal.colours ? { hue: hueFamily(proposal.colours.accent) } : {}),
		...(proposal.type ? { typeClass: proposal.type.class, display: proposal.type.display } : {}),
	};
}

/**
 * 原料：从研究库随机抽几套配色和字体组合，摆在 agent 眼前当起点。只是原料——可以挑、
 * 可以混、可以改，也可以都不用；摆出来是为了让它不必从记忆里的默认值起步。
 */
export function ingredients(lib: TasteLibrary, rnd: () => number, count = 6): { palettes: string[]; type: string[] } {
	const sample = <T>(items: readonly T[]): T[] => {
		const pool = [...items];
		const out: T[] = [];
		while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0] as T);
		return out;
	};
	return {
		palettes: sample(lib.palettes).map(
			(p) => `${p.name}: ground ${p.bg}, panel ${p.surface}, text ${p.ink}, muted ${p.muted}, accent ${p.accent} (${p.tags.join(", ")})`,
		),
		type: sample(lib.type).map((t) =>
			t.display.family === t.text.family ? `${t.name} (${t.class}): ${t.display.family}` : `${t.name} (${t.class}): ${t.display.family} / ${t.text.family}`,
		),
	};
}

/** vetd_create 与 vetd_direction 共用的提案说明：怎么想，交什么。 */
const BOLDNESS_PROPOSE_NOTE: Record<Boldness, string> = {
	restrained: "",
	expressive:
		"\nThe user wants a design with character: gradients, resting shadows and glass pass the screenshot check without a stated reason. Spend them on one or two moves, in one hue family, and keep the rest quiet.",
	bold: "\nThe user wants a bold design. Every option declares `shell` (the three differ) and `breaks`: the one default rule it deliberately breaks, and why it suits this product. Gradients, resting shadows and glass pass the screenshot check; one big move on the first screen, everything else quiet.",
};

export const proposeNote = (boldness?: Boldness): string => PROPOSE_NOTE + (boldness ? BOLDNESS_PROPOSE_NOTE[boldness] : "");

export const PROPOSE_NOTE = `App screens are not dealt from templates: you propose three directions with vetd_direction action "propose", and the tool checks them. How to think them up:
1. Inventory the product: the data the screens hold, the jobs people do there, the one question the first screen answers, and the things only this product has (its objects, rituals, units, places, printed matter).
2. Write \`obvious\`: the version you would make by habit for this brief — its colours, typeface and layout. That is the generated look; every option departs from it.
3. Each option starts from something only this product has: "On these screens, <that thing> becomes <the device>." Put the nearest competitor in the first blank — if the sentence still works, the idea belongs to the category; find another.
4. Make the three really different: light/dark, accent colour family and display type class — every pair differs in at least two. Not three tints of one layout. On a phone the navigation bar is part of each idea and takes a different form in each option.
5. Expressive devices (gradient, shadow, glass, mono, a third face, tracked caps) are off by default; an option that needs one lists it in \`devices\` with the reason.
The palettes and type pairings in \`ingredients\` are raw material from a researched library: pick, mix, adjust or ignore them. Fonts must be installable (the tool lists them if one is not).`;

/** propose 的参数 schema（vetd_direction）。 */
export const PROPOSAL_SCHEMA = {
	type: "array",
	minItems: 3,
	maxItems: 3,
	items: {
		type: "object",
		properties: {
			id: { type: "string", description: "kebab-case." },
			name: { type: "string", description: "A short name the user can read, in their language." },
			idea: { type: "string", description: '"On these screens, <something only this product has> becomes <the device>."' },
			departs: { type: "string", description: "What this changes from `obvious`, and why." },
			theme: { type: "string", enum: ["light", "dark"] },
			colours: {
				type: "object",
				properties: {
					ground: { type: "string" },
					panel: { type: "string" },
					text: { type: "string" },
					muted: { type: "string" },
					accent: { type: "string" },
					onAccent: { type: "string" },
					extra: { type: "object", additionalProperties: { type: "string" }, description: "Further tokens this direction needs, name → hex." },
				},
				description: "Hex colours. Omit when the brand keeps the palette.",
			},
			type: {
				type: "object",
				properties: {
					display: { type: "string" },
					text: { type: "string" },
					class: { type: "string", enum: [...TYPE_CLASSES] },
				},
				description: "Font families (installable ones) and the display face's class. Omit when the brand keeps the type.",
			},
			layout: { type: "string", description: "The first screen: what is largest, where it sits, how people move between screens. On a phone, name the navigation form too (floating dock, growing active tab, words only, centre action, the bar as content…), never the stock five-icon tab bar." },
			radius: { type: "number", description: "The one corner radius in px." },
			shell: { type: "string", enum: [...SHELLS], description: "How navigation and content are put together. Required for a bold design; the three options differ." },
			breaks: { type: "string", description: "The one default rule this option deliberately breaks, and why. Required for a bold design." },
			devices: {
				type: "array",
				items: {
					type: "object",
					properties: { device: { type: "string", enum: [...DEVICES] }, reason: { type: "string" } },
					required: ["device", "reason"],
				},
			},
		},
		required: ["id", "name", "idea", "departs", "theme", "layout"],
	},
	description: "propose: your three app directions.",
} as const;

/**
 * 设计基调：用户说清楚了什么、还缺什么、缺的要不要问。
 *
 * 原则：开始设计之前要向用户了解偏好，但不过度打扰——说清楚的照做，只问提示词没回答、
 * 又会明显改变结果的事。问什么、问几题由 agent 读用户的原话决定，这里不预设题库，也不
 * 设数量上限；工具只保证一件事：气质（看起来像什么）必问，因为它的选项必须是实际发出的
 * 候选，规则比临场判断可靠（实测里 flash 级模型要么一题不问，要么把说过的再问一遍）。
 * 其余的题 agent 自己出，问过的题与回答记进 `preferences`，之后追加页面不再重问。
 */
import type { DealtOption, DirectionMode } from "./record";

/** 用户原话里已经给出的基调，按用户自己的措辞存。 */
/** 设计要多敢：稳重沿用默认规则；有个性放行渐变、阴影、玻璃；大胆再要求一处主动出格与不同的外壳。 */
export const BOLDNESS_VALUES = ["restrained", "expressive", "bold"] as const;
export type Boldness = (typeof BOLDNESS_VALUES)[number];

export interface StatedIntent {
	/** 气质、风格、参考产品或网站（「像 Apple TV」「极简」「复古胶片」）。 */
	mood?: string;
	/** 色调或品牌色（「深色」「暖色」「用 #1a4be0」）。 */
	colour?: string;
	/** 页面先突出什么（「海报为主」「信息要密」）。 */
	emphasis?: string;
	/** 用户点名的现有品牌（「Emby」）。 */
	brand?: string;
	/** 用户要多敢：说了「稳重」「炫酷」「大胆」之类，或回答了大胆度那一题。没说就不填，按稳重处理。 */
	boldness?: Boldness;
	/** 用户说了「直接做」「你看着办」：一题都不问。 */
	goAhead?: boolean;
	/** agent 自己问过的题与用户的回答（用户的语言原样存）：之后加页面沿用，不再重问。 */
	preferences?: Preference[];
}

export interface Preference {
	question: string;
	answer: string;
}

const MAX_PREFERENCES = 30;

export type ToneQuestionId = "direction" | "emphasis" | "brandColour";

export interface ToneOption {
	/** 用户选这一项时 choose 收到的值。 */
	value: string;
	label: string;
	description: string;
	badges?: string[];
}

export interface ToneQuestion {
	id: ToneQuestionId;
	question: string;
	header: string;
	options: ToneOption[];
}

export interface Intent {
	stated: StatedIntent;
	questions: ToneQuestion[];
	/** 问题 id → 选中的 value；还没问或不用问时为 null。 */
	answers: Partial<Record<ToneQuestionId, string>> | null;
}

const text = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined;

/** 工具入参收窄：只认这几个键，空串当没说。 */
export function statedIntentFrom(value: unknown): StatedIntent {
	if (typeof value !== "object" || value === null) return {};
	const raw = value as Record<string, unknown>;
	const stated: StatedIntent = {};
	const mood = text(raw.mood);
	const colour = text(raw.colour);
	const emphasis = text(raw.emphasis);
	const brand = text(raw.brand);
	if (mood) stated.mood = mood;
	if (colour) stated.colour = colour;
	if (emphasis) stated.emphasis = emphasis;
	if (brand) stated.brand = brand;
	const boldness = BOLDNESS_VALUES.find((value) => value === raw.boldness);
	if (boldness) stated.boldness = boldness;
	if (raw.goAhead === true) stated.goAhead = true;
	const preferences = preferencesFrom(raw.preferences);
	if (preferences.length > 0) stated.preferences = preferences;
	return stated;
}

/** 工具入参收窄：{question, answer} 两个字段都是非空字符串才收。 */
export function preferencesFrom(value: unknown): Preference[] {
	if (!Array.isArray(value)) return [];
	const out: Preference[] = [];
	for (const item of value) {
		if (typeof item !== "object" || item === null) continue;
		const question = text((item as Record<string, unknown>).question);
		const answer = text((item as Record<string, unknown>).answer);
		if (question && answer) out.push({ question, answer });
	}
	return out.slice(0, MAX_PREFERENCES);
}

/** 把新答的偏好并进已有的：同一道题以最新的回答为准。 */
export function mergePreferences(existing: readonly Preference[] | undefined, added: readonly Preference[]): Preference[] {
	const merged = new Map<string, Preference>();
	for (const item of [...(existing ?? []), ...added]) merged.set(item.question, item);
	return [...merged.values()].slice(-MAX_PREFERENCES);
}

export const EMPHASIS_VALUES = ["pictures", "information", "balanced"] as const;
export const BRAND_COLOUR_VALUES = ["action-only", "none", "main"] as const;

/**
 * 工具必问的只有气质这一题：用户没说气质（也没给参考）就拿发出的候选让他挑，这是最
 * 影响结果的一题，选项又必须来自实际发出的候选，所以不交给模型临场出。
 * 其余要不要问、问什么，归 agent 读用户原话来定（见 deal-service.ts 的 askNote）。
 * 老记录里的 emphasis / brandColour 题仍能被 checkAnswers 核对，但不会再生成。
 */
export function toneQuestions(_mode: DirectionMode, stated: StatedIntent, options: readonly DealtOption[]): ToneQuestion[] {
	if (stated.goAhead || stated.mood || options.length < 2) return [];
	return [
		{
			id: "direction",
			question: "Which of these looks closest to what you want?",
			header: "Look",
			options: options.slice(0, 4).map((option) => ({
				value: option.id,
				label: option.name,
				// 看得见的特征在前（明暗、颜色、字体、外壳），再接一句这个风格的做法。
				description: option.look ? `${option.look}. ${firstSentence(option.summary)}` : option.summary,
			})),
		},
	];
}

const firstSentence = (value: string): string => value.split(/(?<=\.)\s/)[0] ?? value;

/**
 * choose 时核对答案：每道问过的题都要有答案，选项题只认列出的值。方向题的答案就是
 * choose 的 id，由调用方补上。返回规范化后的答案。
 */
export function checkAnswers(
	questions: readonly ToneQuestion[],
	answers: unknown,
	chosenId: string,
): Partial<Record<ToneQuestionId, string>> {
	const given = typeof answers === "object" && answers !== null ? (answers as Record<string, unknown>) : {};
	const out: Partial<Record<ToneQuestionId, string>> = {};
	const missing: string[] = [];
	for (const question of questions) {
		if (question.id === "direction") {
			out.direction = chosenId;
			continue;
		}
		const value = given[question.id];
		const allowed = question.options.map((option) => option.value);
		if (typeof value !== "string" || !allowed.includes(value)) {
			missing.push(`${question.id} (${allowed.join(" | ")})`);
			continue;
		}
		out[question.id] = value;
	}
	if (missing.length > 0) {
		throw new IntentError(
			`The user has not answered: ${missing.join(", ")}. Ask the questions from vetd_create's \`direction.ask\` with ask_user_question in one round, then pass the chosen values as \`answers\`. If the user typed their own answer instead, deal again with it as \`intent\`. When ask_user_question is unavailable (an unattended turn), pass each question's first option and say so in your reply.`,
		);
	}
	return out;
}

export class IntentError extends Error {}

/** 品牌色那一题的答案决定发牌时要不要保留调色板。 */
export function keepsBrandPalette(answers: Intent["answers"]): boolean | null {
	const value = answers?.brandColour;
	if (value === undefined) return null;
	return value !== "none";
}

const EMPHASIS_TEXT: Record<(typeof EMPHASIS_VALUES)[number], string> = {
	pictures: "pictures lead — covers, photos and artwork are the largest things on every screen",
	information: "information leads — details, numbers and specs come first; pictures stay small",
	balanced: "balanced — one large picture on top, the details right under it",
};

const BRAND_TEXT: Record<(typeof BRAND_COLOUR_VALUES)[number], string> = {
	"action-only": "only on the primary action and at most one other thing",
	none: "not at all — the dealt palette decides",
	main: "as the main colour across the screens, still with neutral ground and text",
};

const BOLDNESS_TEXT: Record<Boldness, string> = {
	restrained: "restrained — quiet and composed; the house rules hold as written.",
	expressive:
		"expressive — a design with character. Gradients, resting shadows and glass pass the screenshot check without a stated reason; use them where they make the product more itself, in one family of hues.",
	bold: "bold — memorable at a glance. Everything in expressive, plus one deliberate break from a default (the direction states it), an oversized move on the first screen, and a shell that differs from the other options.",
};

/**
 * 方向表开头的「用户要的」：用户原话与回答都是硬条件，排在方向表一切内容之前。
 * 没有任何基调时返回空数组，方向表就不出这一节。
 */
export function intentLines(intent: Intent | undefined): string[] {
	if (!intent) return [];
	const { stated, answers } = intent;
	const lines: string[] = [];
	if (stated.mood) lines.push(`- Look: "${stated.mood}" (the user's words). Where this sheet disagrees, the user wins.`);
	if (stated.colour) lines.push(`- Colour: "${stated.colour}" (the user's words).`);
	if (stated.emphasis) lines.push(`- Emphasis: "${stated.emphasis}" (the user's words).`);
	else if (answers?.emphasis) lines.push(`- Emphasis: ${EMPHASIS_TEXT[answers.emphasis as keyof typeof EMPHASIS_TEXT]}.`);
	if (stated.brand) {
		const use = answers?.brandColour ? BRAND_TEXT[answers.brandColour as keyof typeof BRAND_TEXT] : null;
		lines.push(`- Brand: ${stated.brand}${use ? `; its colour is used ${use}` : ""}.`);
	}
	if (stated.boldness) lines.push(`- Boldness: ${BOLDNESS_TEXT[stated.boldness]}`);
	for (const { question, answer } of stated.preferences ?? []) {
		lines.push(`- Asked "${question}" — the user answered "${answer}". Binding.`);
	}
	if (stated.goAhead) lines.push("- The user asked you to go ahead without questions: state your choices in one line.");
	return lines;
}

/** 问过用户的题与回答：create / deal 的 intent 里带，choose 时也可以单独带。 */
export const PREFERENCES_SCHEMA = {
	type: "array",
	items: {
		type: "object",
		properties: {
			question: { type: "string", description: "The question you asked, in the user's language." },
			answer: { type: "string", description: "The user's answer, in their words." },
		},
		required: ["question", "answer"],
		additionalProperties: false,
	},
	description:
		"Questions you already asked the user and their answers (anything beyond the look question). Recorded in the design and treated as binding; later screens do not ask them again.",
} as const;

/** vetd_create 与 vetd_direction 共用的入参：只填用户真说了的，没说的留空。 */
export const INTENT_SCHEMA = {
	type: "object",
	properties: {
		mood: { type: "string", description: "The look or feel the user named, or a product/site they referenced, in their words." },
		colour: { type: "string", description: "Colour the user named (dark, warm, a brand hex), in their words." },
		emphasis: { type: "string", description: "What the user said should come first (posters, dense info…)." },
		brand: { type: "string", description: "An existing brand the user named (e.g. Emby)." },
		boldness: {
			type: "string",
			enum: [...BOLDNESS_VALUES],
			description:
				"How daring the design should be, from the user's words or their answer: restrained (quiet, professional), expressive (character, depth, colour), bold (memorable, striking). Leave out when the user said nothing about it.",
		},
		goAhead: { type: "boolean", description: "True when the user said to just go ahead without questions." },
		preferences: PREFERENCES_SCHEMA,
	},
	additionalProperties: false,
	description:
		"The user's design intent — fill only what the user actually said or answered; leave the rest out. Without a stated look, `ask` comes back with the look question.",
} as const;

/**
 * 设计基调：用户说清楚了什么、还缺什么、缺的要不要问。
 *
 * 原则是「说清楚的照做，只问会大幅改变结果的缺口」。基调分三维——气质、色调、侧重——
 * 外加用户点名的品牌。模型把用户原话里能对上的部分填进来，没说的就不填；这里决定
 * 问哪几题，题目直接是宿主 ask_user_question 的形状，模型翻成用户的语言原样转交。
 *
 * 只按规则决定问不问，不让模型临场判断：实测里 flash 级模型要么一题不问直接画，要么
 * 把说过的也再问一遍。
 */
import type { DealtOption, DirectionMode } from "./record";

/** 用户原话里已经给出的基调，按用户自己的措辞存。 */
export interface StatedIntent {
	/** 气质、风格、参考产品或网站（「像 Apple TV」「极简」「复古胶片」）。 */
	mood?: string;
	/** 色调或品牌色（「深色」「暖色」「用 #1a4be0」）。 */
	colour?: string;
	/** 页面先突出什么（「海报为主」「信息要密」）。 */
	emphasis?: string;
	/** 用户点名的现有品牌（「Emby」）。 */
	brand?: string;
	/** 用户说了「直接做」「你看着办」：一题都不问。 */
	goAhead?: boolean;
}

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
	if (raw.goAhead === true) stated.goAhead = true;
	return stated;
}

export const EMPHASIS_VALUES = ["pictures", "information", "balanced"] as const;
export const BRAND_COLOUR_VALUES = ["action-only", "none", "main"] as const;

/**
 * 缺什么问什么：
 * - 气质没说（也没给参考）→ 拿发出的候选让用户挑，这是最影响结果的一题；
 * - App 的侧重没说 → 问一题（图主导和信息主导是两种首页）；落地页不问，论点决定；
 * - 点名了品牌、却没说颜色 → 问品牌色怎么用；
 * - 色调本身不问：发出的方向会定，用户说了就作为硬条件。
 */
export function toneQuestions(mode: DirectionMode, stated: StatedIntent, options: readonly DealtOption[]): ToneQuestion[] {
	if (stated.goAhead) return [];
	const questions: ToneQuestion[] = [];
	if (!stated.mood && options.length >= 2) {
		questions.push({
			id: "direction",
			question: "Which of these looks closest to what you want?",
			header: "Look",
			options: options.slice(0, 4).map((option) => ({
				value: option.id,
				label: option.name,
				description: option.summary,
			})),
		});
	}
	if (mode === "app" && !stated.emphasis) {
		questions.push({
			id: "emphasis",
			question: "What should the screens put first?",
			header: "Emphasis",
			options: [
				{
					value: "pictures",
					label: "Pictures lead",
					description: "Covers, photos and artwork large; details one tap away.",
				},
				{
					value: "information",
					label: "Information leads",
					description: "Details, numbers and specs up front; pictures small.",
				},
				{ value: "balanced", label: "Balanced", description: "A large picture on top, the details right under it." },
			],
		});
	}
	if (stated.brand && !stated.colour) {
		questions.push({
			id: "brandColour",
			question: `How should ${stated.brand}'s colour be used?`,
			header: "Brand colour",
			options: [
				{
					value: "action-only",
					label: "Main action only",
					description: "The brand colour marks the primary button and at most one other thing; the rest stays neutral.",
					badges: ["Recommended"],
				},
				{ value: "none", label: "Not at all", description: "The dealt direction decides every colour." },
				{ value: "main", label: "As the main colour", description: "The brand colour leads across the screens." },
			],
		});
	}
	return questions;
}

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
	if (stated.goAhead) lines.push("- The user asked you to go ahead without questions: state your choices in one line.");
	return lines;
}

/** vetd_create 与 vetd_direction 共用的入参：只填用户真说了的，没说的留空。 */
export const INTENT_SCHEMA = {
	type: "object",
	properties: {
		mood: { type: "string", description: "The look or feel the user named, or a product/site they referenced, in their words." },
		colour: { type: "string", description: "Colour the user named (dark, warm, a brand hex), in their words." },
		emphasis: { type: "string", description: "What the user said should come first (posters, dense info…)." },
		brand: { type: "string", description: "An existing brand the user named (e.g. Emby)." },
		goAhead: { type: "boolean", description: "True when the user said to just go ahead without questions." },
	},
	additionalProperties: false,
	description:
		"The user's design intent — fill only what the user actually said; leave the rest out. What is missing decides which questions come back in `ask`.",
} as const;

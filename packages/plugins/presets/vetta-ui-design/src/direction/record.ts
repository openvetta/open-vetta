/**
 * `direction.json`：一份设计发到的方向，以及发牌、选择、重发三步的纯逻辑。
 *
 * 存进设计包而不是插件存储：方向是这份设计的一部分，跟着设计走、进版本历史，以后的
 * 会话加新屏时 `show` 就能拿回同一份方向表，而不是重新发一副牌。文件里只记 id，不记
 * 内容——方向表按当前库现渲染，库更新后 id 不在了会明确提示重发。
 */
import {
	APP_KINDS,
	ASSETS,
	type AppChoice,
	type AppInput,
	type Asset,
	appScreens,
	type DealHistoryEntry,
	type Dealer,
	dealApp,
	dealAppOptions,
	dealHero,
	dealPage,
	dealPageOptions,
	dealPalette,
	dealScreen,
	dealSection,
	dealShell,
	dealType,
	defaultSections,
	type KeepSlot,
	normalizeRole,
	PAGE_SECTORS,
	PAGE_TONES,
	type PageChoice,
	type PageInput,
	type PageSector,
	type PageTone,
} from "./deal";
import type { SourceIssue } from "../vetd/check-sources";
import { checkAnswers, type Intent, IntentError, keepsBrandPalette, type StatedIntent, toneQuestions } from "./intent";
import type { TasteLibrary } from "./library";

export const DIRECTION_FILE = "direction.json";

export type DirectionMode = "page" | "app";

export interface DirectionRecord {
	version: 1;
	mode: DirectionMode;
	input: PageInput | AppInput;
	seed: number;
	at: string;
	/** 最近一次 deal 发出的候选 id，choose 只能从这里挑。 */
	options: string[];
	choice: PageChoice | AppChoice | null;
	/** 这份方向放行的生成感规则（vetd/tells-probe.ts 的规则 id），choose / redraw 时算好存下。 */
	allow: string[];
	redraws: { slot: string; reason: string; at: string }[];
	/** 用户给的设计基调、要问的题与回答（intent.ts）。 */
	intent?: Intent;
}

/** 截图机检要知道的那一点：按落地页还是 App 的阈值判，以及哪些规则被方向放行。 */
export interface DirectionTells {
	mode: DirectionMode;
	allow: readonly string[];
}

/**
 * 发过牌就报，不等选定：实测里模型拿到候选后可能不选就开画，那正是最需要拦的时候。
 * 没有 direction.json 的（幻灯片、海报、旧设计）不报。
 */
export function tellsFor(record: DirectionRecord | null): DirectionTells | null {
	if (!record) return null;
	return { mode: record.mode, allow: record.allow };
}

export const DIRECTION_NOT_CHOSEN_RULE = "direction-not-chosen";

/** 发了牌却没选：作为整份设计的 issue 报给每一帧，直到选定为止。 */
export function directionIssues(record: DirectionRecord | null): SourceIssue[] {
	if (!record || record.choice) return [];
	return [
		{
			file: DIRECTION_FILE,
			line: null,
			rule: DIRECTION_NOT_CHOSEN_RULE,
			message: `${
				record.intent?.questions.length
					? `The user has not been asked yet (${record.intent.questions.map((q) => q.id).join(", ")}): vetd_direction with action "show" lists the questions; ask them with ask_user_question, then choose with the answers.`
					: `Directions were dealt for this design but none was chosen (${record.options.join(", ")}). Call vetd_direction with action "choose" and one id.`
			} Then install its fonts and write its theme.css — frames built before that sit on a palette and type nobody chose.`,
		},
	];
}

/**
 * 保留品牌配色与字体时，渐变、阴影、玻璃、字体数这类表面规则归品牌（风格包、
 * DESIGN.md）管，不归方向管；版式类的（小字、标题行数、图标方块）照报。
 */
const BRAND_OWNED_TELLS = ["tell-gradient", "tell-gradient-text", "tell-shadow", "tell-glass", "tell-font-count", "tell-mono"];

export function allowedTells(lib: TasteLibrary, record: Pick<DirectionRecord, "input" | "choice">): string[] {
	const allow = new Set<string>();
	const { keep } = record.input;
	if (keep.includes("palette") && keep.includes("type")) for (const rule of BRAND_OWNED_TELLS) allow.add(rule);
	const choice = record.choice;
	if (choice && "styleId" in choice && lib.app.styles.find((s) => s.id === choice.styleId)?.shadow) {
		allow.add("tell-shadow");
	}
	return [...allow];
}

export class DirectionError extends Error {}

// ---------- 输入 ----------

export interface DealParams {
	for?: unknown;
	sector?: unknown;
	kind?: unknown;
	brief?: unknown;
	tone?: unknown;
	theme?: unknown;
	sections?: unknown;
	screens?: unknown;
	have?: unknown;
	keep?: unknown;
}

const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
		: [];

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
	typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;

function keepSlots(value: unknown): KeepSlot[] {
	return strings(value).filter((slot): slot is KeepSlot => slot === "palette" || slot === "type");
}

export function pageInputFrom(params: DealParams): PageInput {
	const sector = oneOf<PageSector>(params.sector, PAGE_SECTORS);
	if (!sector) {
		throw new DirectionError(`Pass \`sector\`, the closest of: ${PAGE_SECTORS.join(", ")}. Use "other" only when nothing fits.`);
	}
	const tone = params.tone === undefined ? null : oneOf<PageTone>(params.tone, PAGE_TONES);
	if (params.tone !== undefined && !tone) throw new DirectionError(`\`tone\` is one of: ${PAGE_TONES.join(", ")}.`);
	const have = strings(params.have);
	const unknownAssets = have.filter((asset) => !(ASSETS as readonly string[]).includes(asset));
	if (unknownAssets.length > 0) {
		throw new DirectionError(`Unknown \`have\` value(s) ${unknownAssets.join(", ")}. One of: ${ASSETS.join(", ")}.`);
	}
	const requested = strings(params.sections).map(normalizeRole).filter((role) => role !== "hero");
	return {
		sector,
		brief: typeof params.brief === "string" ? params.brief.trim() : "",
		tone,
		have: have as Asset[],
		keep: keepSlots(params.keep),
		avoid: [],
		sections: requested.length > 0 ? requested : defaultSections(sector),
	};
}

export function appInputFrom(params: DealParams, lib: TasteLibrary): AppInput {
	const kind = oneOf(params.kind, APP_KINDS);
	if (!kind) {
		throw new DirectionError(
			`Pass \`kind\`, the closest of: ${APP_KINDS.map((id) => `${id} (${lib.app.kinds[id]?.note ?? ""})`).join("; ")}.`,
		);
	}
	const known = appScreens(lib);
	const requested = strings(params.screens);
	const unknownScreens = requested.filter((screen) => !known.includes(screen));
	if (unknownScreens.length > 0) {
		throw new DirectionError(`Unknown screen(s) ${unknownScreens.join(", ")}. One of: ${known.join(", ")}.`);
	}
	const theme = params.theme === undefined ? null : oneOf(params.theme, ["light", "dark"] as const);
	if (params.theme !== undefined && !theme) throw new DirectionError("`theme` is light or dark.");
	return {
		kind,
		brief: typeof params.brief === "string" ? params.brief.trim() : "",
		theme,
		screens: requested.length > 0 ? requested : [...(lib.app.kinds[kind]?.screens ?? ["overview"])],
		keep: keepSlots(params.keep),
		avoid: [],
	};
}

// ---------- 动作 ----------

export interface DealtOption {
	id: string;
	name: string;
	summary: string;
}

const firstSentences = (text: string, count: number) =>
	text
		.split(/(?<=\.)\s/)
		.slice(0, count)
		.join(" ");

/** 发候选。不写 choice——在模型挑之前，设计里不该有一份「已定」的方向。 */
export function startDeal(
	dealer: Dealer,
	mode: DirectionMode,
	input: PageInput | AppInput,
	seed: number,
	now: string,
	stated: StatedIntent = {},
): { record: DirectionRecord; options: DealtOption[] } {
	const options: DealtOption[] =
		mode === "page"
			? dealPageOptions(dealer, input as PageInput).map((d) => ({
					id: d.id,
					name: d.name,
					summary: `${firstSentences(d.idea, 2)} Composition: ${firstSentences(d.composition, 2)}${d.needsPictures ? " Needs many pictures." : ""}`,
				}))
			: dealAppOptions(dealer, input as AppInput).map((s) => ({
					id: s.id,
					name: `${s.name} (${s.theme})`,
					summary: `${s.idea} The move: ${s.signature}`,
				}));
	return {
		record: {
			version: 1,
			mode,
			input,
			seed,
			at: now,
			options: options.map((o) => o.id),
			choice: null,
			allow: allowedTells(dealer.lib, { input, choice: null }),
			redraws: [],
			intent: { stated, questions: toneQuestions(mode, stated, options), answers: null },
		},
		options,
	};
}

/**
 * 选定方向。发牌时列出过要问用户的题，就必须带着回答来：选定之后再问已经晚了，
 * 方向表、字体和配色都已经按没问过的那一版写进设计了。
 */
export function choose(
	dealer: Dealer,
	record: DirectionRecord,
	id: string,
	now: string,
	answers?: unknown,
): DirectionRecord {
	if (!record.options.includes(id)) {
		throw new DirectionError(
			`\`${id}\` was not dealt for this design. Choose one of: ${record.options.join(", ")} — or deal again.`,
		);
	}
	let intent = record.intent;
	let input = record.input;
	if (intent && intent.questions.length > 0) {
		try {
			intent = { ...intent, answers: checkAnswers(intent.questions, answers, id) };
		} catch (error) {
			if (error instanceof IntentError) throw new DirectionError(error.message);
			throw error;
		}
		// 品牌色那一题改的是「调色板发不发」：用户不要品牌色就照常发，要就保留品牌的。
		const keepBrand = keepsBrandPalette(intent.answers);
		if (keepBrand !== null) {
			const others = input.keep.filter((slot) => slot !== "palette");
			input = { ...input, keep: keepBrand ? [...others, "palette"] : others } as typeof input;
		}
	}
	const choice = record.mode === "page" ? dealPage(dealer, input as PageInput, id) : dealApp(dealer, input as AppInput, id);
	if (!choice) throw new DirectionError(`\`${id}\` is no longer in the library. Deal again.`);
	return {
		...record,
		input,
		choice,
		allow: allowedTells(dealer.lib, { input, choice }),
		at: now,
		...(intent ? { intent } : {}),
	};
}

/** 记进跨设计的历史，只记 id。 */
export function historyEntry(record: DirectionRecord): DealHistoryEntry | null {
	const { choice } = record;
	if (!choice) return null;
	if ("directionId" in choice) {
		return {
			at: record.at,
			mode: "page",
			direction: choice.directionId,
			hero: choice.heroId,
			...(choice.typeId ? { type: choice.typeId } : {}),
			...(choice.paletteId ? { palette: choice.paletteId } : {}),
		};
	}
	return { at: record.at, mode: "app", style: choice.styleId, shell: choice.shellId };
}

export const PAGE_SLOTS = ["direction", "hero", "type", "palette", "section:<role>"] as const;
export const APP_SLOTS = ["style", "shell", "screen:<name>"] as const;

/**
 * 重发一格。`direction`/`style` 回到候选阶段（排除当前这个）——换方向是换整副牌，
 * 不该在旧方向的字体配色上只换个名字。
 */
export function redraw(
	dealer: Dealer,
	record: DirectionRecord,
	slot: string,
	reason: string,
	now: string,
): { record: DirectionRecord; options: DealtOption[] | null } {
	if (!reason.trim()) {
		throw new DirectionError(
			"Pass `reason`: redraw only for a reason you can state (it contradicts the brand, needs an asset that does not exist, or cannot hold the real content) — never because the dealt slot feels unfamiliar.",
		);
	}
	const log = [...record.redraws, { slot, reason: reason.trim(), at: now }];
	const { choice } = record;
	if (!choice) throw new DirectionError('Nothing is chosen yet. Use action "choose" with one of the dealt ids first.');

	if (record.mode === "page" && "directionId" in choice) {
		const input = record.input as PageInput;
		const dir = dealer.lib.directions.find((d) => d.id === choice.directionId);
		if (!dir) throw new DirectionError("The saved direction is no longer in the library. Deal again.");
		if (slot === "direction") {
			const next = startDeal(dealer, "page", { ...input, avoid: [...input.avoid, dir.id] }, record.seed, now, record.intent?.stated);
			return { record: { ...next.record, redraws: log }, options: next.options };
		}
		const updated: PageChoice = { ...choice, sections: [...choice.sections] };
		if (slot === "hero") updated.heroId = dealHero(dealer, dir, input, [choice.heroId]).id;
		else if (slot === "type") updated.typeId = dealType(dealer, dir, choice.typeId ? [choice.typeId] : []).id;
		else if (slot === "palette") updated.paletteId = dealPalette(dealer, dir, choice.paletteId ? [choice.paletteId] : []).id;
		else if (slot.startsWith("section:")) {
			const role = normalizeRole(slot.slice("section:".length));
			const index = updated.sections.findIndex((s) => s.role === role);
			if (index < 0) {
				throw new DirectionError(`No ${role} section on this sheet. Sections: ${updated.sections.map((s) => s.role).join(", ")}.`);
			}
			const shapeOf = (id: string | null | undefined) => dealer.lib.sections.find((s) => s.id === id)?.shape ?? null;
			const used = updated.sections.map((s) => s.id).filter((id): id is string => id !== null);
			const dealt = dealSection(
				dealer,
				dir,
				role,
				used,
				{ prev: shapeOf(updated.sections[index - 1]?.id), next: shapeOf(updated.sections[index + 1]?.id) },
				input,
			);
			if (dealt) updated.sections[index] = { role, id: dealt.id };
		} else {
			throw new DirectionError(`Unknown slot "${slot}". Page slots: ${PAGE_SLOTS.join(", ")}.`);
		}
		return { record: { ...record, choice: updated, redraws: log, at: now }, options: null };
	}

	if (record.mode === "app" && "styleId" in choice) {
		const input = record.input as AppInput;
		if (slot === "style") {
			const next = startDeal(dealer, "app", { ...input, avoid: [...input.avoid, choice.styleId] }, record.seed, now, record.intent?.stated);
			return { record: { ...next.record, redraws: log }, options: next.options };
		}
		const style = dealer.lib.app.styles.find((s) => s.id === choice.styleId);
		if (!style) throw new DirectionError("The saved app style is no longer in the library. Deal again.");
		const updated: AppChoice = { ...choice, screens: [...choice.screens] };
		if (slot === "shell") updated.shellId = dealShell(dealer, style, [choice.shellId]).id;
		else if (slot.startsWith("screen:")) {
			const name = slot.slice("screen:".length);
			const index = updated.screens.findIndex((s) => s.name === name);
			if (index < 0) {
				throw new DirectionError(`No ${name} screen on this sheet. Screens: ${updated.screens.map((s) => s.name).join(", ")}.`);
			}
			const current = updated.screens[index].patternId;
			const dealt = dealScreen(dealer, name, input, current ? [current] : []);
			if (dealt) updated.screens[index] = { name, patternId: dealt.id };
		} else {
			throw new DirectionError(`Unknown slot "${slot}". App slots: ${APP_SLOTS.join(", ")}.`);
		}
		return {
			record: { ...record, choice: updated, allow: allowedTells(dealer.lib, { input, choice: updated }), redraws: log, at: now },
			options: null,
		};
	}
	throw new DirectionError("direction.json is inconsistent (mode and choice disagree). Deal again.");
}

// ---------- 解析 ----------

const isObj = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `direction.json` 在用户的设计目录里，可能被手改或来自旧版本：结构不对就当没有，
 * 由调用方提示重新发牌，而不是带着半份数据渲染一张错的方向表。
 */
export function parseDirectionRecord(text: string): DirectionRecord | null {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isObj(value) || value.version !== 1 || (value.mode !== "page" && value.mode !== "app")) return null;
	if (!isObj(value.input) || !Array.isArray(value.options) || typeof value.seed !== "number") return null;
	const choice = value.choice;
	if (choice !== null) {
		if (!isObj(choice)) return null;
		const pageShape = typeof choice.directionId === "string" && Array.isArray(choice.sections);
		const appShape = typeof choice.styleId === "string" && Array.isArray(choice.screens);
		if (value.mode === "page" ? !pageShape : !appShape) return null;
	}
	const input = value.input;
	const listOk =
		value.mode === "page"
			? typeof input.sector === "string" && Array.isArray(input.sections) && Array.isArray(input.have)
			: typeof input.kind === "string" && Array.isArray(input.screens);
	if (!listOk || !Array.isArray(input.keep) || !Array.isArray(input.avoid)) return null;
	return {
		version: 1,
		mode: value.mode,
		input: input as unknown as PageInput | AppInput,
		seed: value.seed,
		at: typeof value.at === "string" ? value.at : "",
		options: value.options.filter((id): id is string => typeof id === "string"),
		choice: choice as PageChoice | AppChoice | null,
		allow: Array.isArray(value.allow) ? value.allow.filter((rule): rule is string => typeof rule === "string") : [],
		...(parseIntent(value.intent) ? { intent: parseIntent(value.intent) as Intent } : {}),
		redraws: Array.isArray(value.redraws)
			? value.redraws.filter(
					(entry): entry is DirectionRecord["redraws"][number] =>
						isObj(entry) && typeof entry.slot === "string" && typeof entry.reason === "string",
				)
			: [],
	};
}

/** 旧版 direction.json 没有 intent；结构不对也当没有，不因此作废整份方向。 */
function parseIntent(value: unknown): Intent | null {
	if (!isObj(value) || !isObj(value.stated) || !Array.isArray(value.questions)) return null;
	const questions = value.questions.filter(
		(question): question is Intent["questions"][number] =>
			isObj(question) && typeof question.id === "string" && Array.isArray(question.options),
	);
	const answers = isObj(value.answers) ? (value.answers as Intent["answers"]) : null;
	return { stated: value.stated as Intent["stated"], questions, answers };
}

export function serializeDirectionRecord(record: DirectionRecord): string {
	return `${JSON.stringify(record, null, "\t")}\n`;
}

/** 跨设计历史：新的在前，只留最近 24 条。 */
export function parseHistory(text: string | null): DealHistoryEntry[] {
	if (!text) return [];
	try {
		const value: unknown = JSON.parse(text);
		if (!Array.isArray(value)) return [];
		return value.filter(
			(entry): entry is DealHistoryEntry =>
				isObj(entry) && (entry.mode === "page" || entry.mode === "app") && typeof entry.at === "string",
		);
	} catch {
		return [];
	}
}

export function pushHistory(history: readonly DealHistoryEntry[], entry: DealHistoryEntry): DealHistoryEntry[] {
	return [entry, ...history].slice(0, 24);
}

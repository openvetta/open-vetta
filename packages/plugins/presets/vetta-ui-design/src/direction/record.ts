/**
 * `direction.json`：一份设计发到的方向，以及发牌、选择、重发三步的纯逻辑。
 *
 * 存进设计包而不是插件存储：方向是这份设计的一部分，跟着设计走、进版本历史，以后的
 * 会话加新屏时 `show` 就能拿回同一份方向表，而不是重新发一副牌。文件里只记 id，不记
 * 内容——方向表按当前库现渲染，库更新后 id 不在了会明确提示重发。App 例外：方向是 agent
 * 自己提的，没有库可查，三份提案原样存在 `proposals` 里。
 */
import {
	ASSETS,
	type AppChoice,
	type AppInput,
	type Asset,
	type DealHistoryEntry,
	type Dealer,
	dealHero,
	dealPage,
	dealPageOptions,
	dealPalette,
	dealSection,
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
import {
	checkAnswers,
	type Intent,
	IntentError,
	keepsBrandPalette,
	mergePreferences,
	type Preference,
	type StatedIntent,
	toneQuestions,
} from "./intent";
import {
	type AppProposal,
	DEVICES,
	parseProposals,
	ProposalError,
	proposalHistory,
	proposalLook,
	proposalTells,
	SHELLS,
	TYPE_CLASSES,
} from "./proposal";

export const DIRECTION_FILE = "direction.json";

export type DirectionMode = "page" | "app";

export interface DirectionRecord {
	version: 1;
	mode: DirectionMode;
	input: PageInput | AppInput;
	seed: number;
	at: string;
	/** 最近一次 deal 发出（App：propose 提出）的候选 id，choose 只能从这里挑。 */
	options: string[];
	choice: PageChoice | AppChoice | null;
	/** 这份方向放行的生成感规则（vetd/tells-probe.ts 的规则 id），choose / redraw 时算好存下。 */
	allow: string[];
	redraws: { slot: string; reason: string; at: string }[];
	/** 用户给的设计基调、要问的题与回答（intent.ts）。 */
	intent?: Intent;
	/** App：agent 写下的平庸版本，三个方向都要避开它。 */
	obvious?: string;
	/** App：agent 提的三个方向（proposal.ts 校验过）。 */
	proposals?: AppProposal[];
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
	if (record.mode === "app" && record.options.length === 0) {
		return [
			{
				file: DIRECTION_FILE,
				line: null,
				rule: DIRECTION_NOT_CHOSEN_RULE,
				message:
					'No direction was proposed for these app screens. Call vetd_direction with action "propose" and three directions of your own (its `deal` action reprints how), ask the user to pick when the tool says so, then choose one. Frames built before that sit on a palette and type nobody chose.',
			},
		];
	}
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

export function allowedTells(record: Pick<DirectionRecord, "input" | "choice" | "proposals"> & { intent?: DirectionRecord["intent"] }): string[] {
	const allow = new Set<string>();
	const { keep } = record.input;
	if (keep.includes("palette") && keep.includes("type")) for (const rule of BRAND_OWNED_TELLS) allow.add(rule);
	const proposal = chosenProposal(record);
	if (proposal) for (const rule of proposalTells(proposal, record.intent?.stated.boldness)) allow.add(rule);
	return [...allow];
}

/** App 选定的那一案；页面方向、未选定或旧版记录（选的是已退役的风格库）为 null。 */
export function chosenProposal(record: Pick<DirectionRecord, "choice" | "proposals">): AppProposal | null {
	const choice = record.choice;
	if (!choice || !("proposalId" in choice)) return null;
	return record.proposals?.find((proposal) => proposal.id === choice.proposalId) ?? null;
}

export class DirectionError extends Error {}

// ---------- 输入 ----------

export interface DealParams {
	for?: unknown;
	sector?: unknown;
	brief?: unknown;
	tone?: unknown;
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

export function appInputFrom(params: DealParams): AppInput {
	return {
		brief: typeof params.brief === "string" ? params.brief.trim() : "",
		screens: strings(params.screens).slice(0, 20),
		keep: keepSlots(params.keep),
		avoid: [],
	};
}

// ---------- 动作 ----------

export interface DealtOption {
	id: string;
	name: string;
	summary: string;
	/** 一眼看得出长什么样的几个特征（明暗、颜色、字体、外壳）；有它风格题的选项才不是空谈。 */
	look?: string;
}

const firstSentences = (text: string, count: number) =>
	text
		.split(/(?<=\.)\s/)
		.slice(0, count)
		.join(" ");

/** 发候选（落地页）。不写 choice——在模型挑之前，设计里不该有一份「已定」的方向。 */
export function startDeal(
	dealer: Dealer,
	input: PageInput,
	seed: number,
	now: string,
	stated: StatedIntent = {},
): { record: DirectionRecord; options: DealtOption[] } {
	const options: DealtOption[] = dealPageOptions(dealer, input).map((d) => ({
		id: d.id,
		name: d.name,
		summary: `${firstSentences(d.idea, 2)} Composition: ${firstSentences(d.composition, 2)}${d.needsPictures ? " Needs many pictures." : ""}`,
	}));
	return {
		record: {
			version: 1,
			mode: "page",
			input,
			seed,
			at: now,
			options: options.map((o) => o.id),
			choice: null,
			allow: allowedTells({ input, choice: null }),
			redraws: [],
			intent: { stated, questions: toneQuestions("page", stated, options), answers: null },
		},
		options,
	};
}

/**
 * App 设计的起点：还没有任何方向，等 agent 提案。照样写进设计——截图机检凭它报
 * `direction-not-chosen`，免得模型跳过提案直接在脚手架配色上开画。
 */
export function startProposal(input: AppInput, seed: number, now: string, stated: StatedIntent = {}): DirectionRecord {
	return {
		version: 1,
		mode: "app",
		input,
		seed,
		at: now,
		options: [],
		choice: null,
		allow: allowedTells({ input, choice: null }),
		redraws: [],
		intent: { stated, questions: [], answers: null },
		proposals: [],
	};
}

const proposalOption = (proposal: AppProposal): DealtOption => ({
	id: proposal.id,
	name: `${proposal.name} (${proposal.theme})`,
	summary: proposal.idea,
	look: proposalLook(proposal),
});

/** 设计里已存的提案，按候选的形状给出（show 用）。 */
export function proposalOptions(record: DirectionRecord): DealtOption[] {
	return (record.proposals ?? []).map(proposalOption);
}

/**
 * 收下 agent 的三个方向。已经选定过方向再提，就是换方向：要说明理由，记进 redraws，
 * 并把选定清掉——新的三案里用户还没挑。
 */
export function propose(
	record: DirectionRecord,
	rawOptions: unknown,
	rawObvious: unknown,
	history: readonly DealHistoryEntry[],
	now: string,
	reason: string,
): { record: DirectionRecord; options: DealtOption[] } {
	if (record.mode !== "app") {
		throw new DirectionError('Landing pages are dealt, not proposed: use action "deal" with `for: "page"`.');
	}
	if (record.choice && !reason.trim()) {
		throw new DirectionError(
			"A direction is already chosen for this design. To replace it, pass `reason` (what the user asked for, or why the chosen direction cannot carry the real content) with the new proposal.",
		);
	}
	const stated = record.intent?.stated ?? {};
	let parsed: ReturnType<typeof parseProposals>;
	try {
		parsed = parseProposals(rawOptions, rawObvious, { keep: record.input.keep, stated, history });
	} catch (error) {
		if (error instanceof ProposalError) throw new DirectionError(error.message);
		throw error;
	}
	const options = parsed.proposals.map(proposalOption);
	return {
		record: {
			...record,
			at: now,
			options: options.map((o) => o.id),
			choice: null,
			allow: allowedTells({ input: record.input, choice: null }),
			redraws: record.choice ? [...record.redraws, { slot: "direction", reason: reason.trim(), at: now }] : record.redraws,
			intent: { stated, questions: toneQuestions("app", stated, options), answers: null },
			obvious: parsed.obvious,
			proposals: parsed.proposals,
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
	preferences?: readonly Preference[],
): DirectionRecord {
	if (record.mode === "app" && record.options.length === 0) {
		throw new DirectionError('Nothing has been proposed for this design yet. Call action "propose" with three directions first.');
	}
	if (!record.options.includes(id)) {
		throw new DirectionError(
			`\`${id}\` was not ${record.mode === "app" ? "proposed" : "dealt"} for this design. Choose one of: ${record.options.join(", ")} — or ${record.mode === "app" ? "propose" : "deal"} again.`,
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
	const choice: PageChoice | AppChoice | null =
		record.mode === "page" ? dealPage(dealer, input as PageInput, id) : { proposalId: id };
	if (!choice) throw new DirectionError(`\`${id}\` is no longer in the library. Deal again.`);
	if (preferences && preferences.length > 0) {
		const base: Intent = intent ?? { stated: {}, questions: [], answers: null };
		intent = { ...base, stated: { ...base.stated, preferences: mergePreferences(base.stated.preferences, preferences) } };
	}
	return {
		...record,
		input,
		choice,
		allow: allowedTells({ input, choice, proposals: record.proposals, intent: record.intent }),
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
	const proposal = chosenProposal(record);
	return proposal ? { at: record.at, mode: "app", ...proposalHistory(proposal) } : null;
}

export const PAGE_SLOTS = ["direction", "hero", "type", "palette", "section:<role>"] as const;

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
			const next = startDeal(dealer, { ...input, avoid: [...input.avoid, dir.id] }, record.seed, now, record.intent?.stated);
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

	if (record.mode === "app") {
		throw new DirectionError(
			'App directions are proposed, not dealt: to change the look, call action "propose" with three new directions and this `reason`.',
		);
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
		// 旧版 App 记录选的是已退役风格库里的一套（styleId），照旧读进来：那份设计的 theme.css
		// 早已写好，不该因为库退役就天天报「没选方向」。
		const appShape = typeof choice.proposalId === "string" || typeof choice.styleId === "string";
		if (value.mode === "page" ? !pageShape : !appShape) return null;
	}
	const input = value.input;
	const listOk =
		value.mode === "page"
			? typeof input.sector === "string" && Array.isArray(input.sections) && Array.isArray(input.have)
			: Array.isArray(input.screens);
	if (!listOk || !Array.isArray(input.keep) || !Array.isArray(input.avoid)) return null;
	return {
		version: 1,
		mode: value.mode,
		input: input as unknown as PageInput | AppInput,
		seed: value.seed,
		at: typeof value.at === "string" ? value.at : "",
		options: value.options.filter((id): id is string => typeof id === "string"),
		choice: legacyAppChoice(choice) ?? (choice as PageChoice | AppChoice | null),
		allow: Array.isArray(value.allow) ? value.allow.filter((rule): rule is string => typeof rule === "string") : [],
		...(parseIntent(value.intent) ? { intent: parseIntent(value.intent) as Intent } : {}),
		...(typeof value.obvious === "string" ? { obvious: value.obvious } : {}),
		...(value.mode === "app" ? { proposals: parseStoredProposals(value.proposals) } : {}),
		redraws: Array.isArray(value.redraws)
			? value.redraws.filter(
					(entry): entry is DirectionRecord["redraws"][number] =>
						isObj(entry) && typeof entry.slot === "string" && typeof entry.reason === "string",
				)
			: [],
	};
}

/** 退役风格库的选择换成一个找不到提案的 id：方向表据此说明，而不是当成没选。 */
function legacyAppChoice(choice: unknown): AppChoice | null {
	if (!isObj(choice) || typeof choice.styleId !== "string" || typeof choice.proposalId === "string") return null;
	return { proposalId: `${LEGACY_PREFIX}${choice.styleId}` };
}

export const LEGACY_PREFIX = "legacy:";

/**
 * 存下的提案只做形状检查，不重跑校验：校验规则以后会变，已选定的方向不该因此失效。
 * 缺关键字段的那一份丢掉。
 */
function parseStoredProposals(value: unknown): AppProposal[] {
	if (!Array.isArray(value)) return [];
	const out: AppProposal[] = [];
	for (const item of value) {
		if (!isObj(item) || typeof item.id !== "string" || typeof item.name !== "string") continue;
		if (item.theme !== "light" && item.theme !== "dark") continue;
		const colours = isObj(item.colours) && typeof item.colours.accent === "string" ? (item.colours as unknown as AppProposal["colours"]) : null;
		const type =
			isObj(item.type) && typeof item.type.display === "string" && typeof item.type.text === "string"
				? {
						display: item.type.display,
						text: item.type.text,
						class: TYPE_CLASSES.find((value) => value === (item.type as Record<string, unknown>).class) ?? "grotesk-tight",
					}
				: null;
		out.push({
			id: item.id,
			name: item.name,
			idea: typeof item.idea === "string" ? item.idea : "",
			departs: typeof item.departs === "string" ? item.departs : "",
			theme: item.theme,
			colours: colours ? { ...colours, extra: isObj(colours.extra) ? colours.extra : {} } : null,
			type,
			layout: typeof item.layout === "string" ? item.layout : "",
			radius: typeof item.radius === "number" ? item.radius : null,
			shell: SHELLS.find((value) => value === item.shell) ?? null,
			breaks: typeof item.breaks === "string" ? item.breaks : "",
			devices: Array.isArray(item.devices)
				? item.devices.filter(
						(entry): entry is AppProposal["devices"][number] =>
							isObj(entry) && DEVICES.includes(entry.device as never) && typeof entry.reason === "string",
					)
				: [],
		});
	}
	return out;
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

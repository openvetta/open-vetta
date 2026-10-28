/**
 * 「发一副候选牌并存进设计」这一步。vetd_create 建设计时直接发，vetd_direction 的
 * deal 动作重发，两处走同一条路，免得两份规则各自漂移。
 *
 * 发牌之所以并进 vetd_create：实测里 flash 级模型读完 skill 后只认工具表里看得见的
 * 工具，建完设计就照着返回值的提示一路写下去，从没回头调 vetd_direction。工具返回值
 * 是每次都会读的，把候选直接放进 vetd_create 的结果里，这一步就跳不过去了。
 *
 * App 不发牌（见 proposal.ts）：vetd_create 存下一份等提案的记录，结果里带上提案说明和
 * 原料，agent 接着用 vetd_direction 的 propose 交三个方向。
 */
import type { PluginContext, PluginFsApi } from "@vetta-org/plugin-sdk";
import type { ProductType } from "../vetd/product-size";
import { type AppInput, type DealHistoryEntry, type Dealer, type PageInput, seededRandom } from "./deal";
import { writeDirectionRecord } from "./direction-file";
import { loadTasteLibrary, type TasteLibrary } from "./library";
import type { Boldness, StatedIntent, ToneQuestion } from "./intent";
import { ingredients, proposeNote } from "./proposal";
import {
	appInputFrom,
	type DealParams,
	type DealtOption,
	DirectionError,
	type DirectionMode,
	pageInputFrom,
	parseHistory,
	startDeal,
	startProposal,
} from "./record";

/** 跨设计的发牌历史，只用来让连续几份设计不撞车。 */
export const HISTORY_PATH = "direction/history.json";

/** 每次发牌一个新种子；种子记进 direction.json，同一种子能复现同一副牌。 */
const randomSeed = () => (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1;

/** 哪些品类走发牌：落地页按页面发，手机与桌面按 App 发；幻灯片、海报不发。 */
export function directionModeFor(product: unknown): DirectionMode | null {
	const type = product as ProductType;
	if (type === "landing") return "page";
	if (type === "mobile" || type === "desktop") return "app";
	return null;
}

export interface DealSession {
	lib: TasteLibrary;
	dealer: Dealer;
	history: DealHistoryEntry[];
	seed: number;
}

export async function openDealSession(ctx: Pick<PluginContext, "storage">): Promise<DealSession> {
	const [lib, history] = await Promise.all([
		loadTasteLibrary(),
		ctx.storage
			.readFile(HISTORY_PATH, "utf8")
			.then(parseHistory)
			.catch(() => []),
	]);
	const seed = randomSeed();
	return { lib, dealer: { lib, rnd: seededRandom(seed), history }, history, seed };
}

/** 项目根有风格包时配色和字体归包管，只发构图。 */
export async function styleFixedByPack(fs: PluginFsApi, cwd: string, dirPath: string | null): Promise<boolean> {
	const exists = async (path: string) => (await fs.stat(path).catch(() => null)) !== null;
	if (await exists(`${cwd}/design-resources`)) return true;
	return dirPath !== null && (await exists(`${dirPath}/DESIGN.md`));
}

/** 只校验输入、不写任何东西：vetd_create 在建目录之前先用它挡掉缺参数的调用。 */
export function dealInputFor(mode: DirectionMode, params: DealParams): PageInput | AppInput {
	return mode === "page" ? pageInputFrom(params) : appInputFrom(params);
}

export interface DealtDirection {
	options: DealtOption[];
	/** 要问用户的题（ask_user_question 的形状）；为空表示用户已说清楚，直接选。 */
	ask: ToneQuestion[];
}

/** App 设计等提案时给 agent 的东西：怎么想、交什么，以及可用的原料。 */
export interface ProposeBrief {
	propose: string;
	ingredients: ReturnType<typeof ingredients>;
}

export function proposeBrief(session: DealSession, boldness?: Boldness): ProposeBrief {
	return { propose: proposeNote(boldness), ingredients: ingredients(session.lib, session.dealer.rnd) };
}

export async function dealIntoDesign(
	session: DealSession,
	fs: PluginFsApi,
	dirPath: string,
	params: DealParams,
	stated: StatedIntent,
): Promise<DealtDirection> {
	const dealt = startDeal(session.dealer, pageInputFrom(params), session.seed, new Date().toISOString(), stated);
	await writeDirectionRecord(fs, dirPath, dealt.record);
	return { options: dealt.options, ask: dealt.record.intent?.questions ?? [] };
}

/** App：存一份等提案的记录，返回提案说明。 */
export async function awaitProposalInDesign(
	session: DealSession,
	fs: PluginFsApi,
	dirPath: string,
	params: DealParams,
	stated: StatedIntent,
): Promise<ProposeBrief> {
	await writeDirectionRecord(fs, dirPath, startProposal(appInputFrom(params), session.seed, new Date().toISOString(), stated));
	return proposeBrief(session, stated.boldness);
}

const CHOOSE =
	'call vetd_direction with action "choose" and its id, and apply the sheet it returns before writing any frame. Until a direction is chosen, every capture reports `direction-not-chosen`.';

/** 用户不选列出的、自己说了一种样子时怎么办：落地页拿它重发，App 照它重提。 */
const OWN_LOOK: Record<DirectionMode, string> = {
	page: "If the user typed their own look instead, deal again with it as `intent.mood`.",
	app: 'If the user typed their own look instead, propose again with it in mind: call action "deal" with it as `intent.mood`, then "propose".',
};

/**
 * 「开始设计之前向用户了解偏好，但不过度打扰」：问什么、问几题由 agent 读用户的原话定，
 * 工具不设题库也不设上限。这两条提示只立判断的标准，不给题目。
 */
const ASK_RULES = `Ask only what the user's own words left open and the answer would visibly change this design — for example what it is for or who uses it when that is unclear, which screens or sections to include, light or dark, what material they have (logo, photos, copy), how a named brand's colour should be used. Skip anything you can infer, anything that only affects polish, and anything they already said. Give each question 2–4 concrete options with your recommendation first (badge "推荐"/"Recommended"), in the user's language. The number of questions follows the prompt: a detailed prompt needs few or none. Put them in one ask_user_question call (it holds at most four questions) rather than several rounds. Pass each extra question and the user's answer as \`preferences\` when you choose — they are saved in the design and later screens never ask them again.`;

/** 用户已说清楚气质（或说了直接做）：没有必问的题，但提示词里还有大缺口时仍然可以问。 */
export const CHOOSE_NOTE = `The user has already set the look, or told you to go ahead. If they said to go ahead, ask nothing. Otherwise, if their prompt still leaves open something that would change the design materially, ask it now. ${ASK_RULES} Then hold each option against what the user said and your inventory of the subject, and pick the one whose way of composing can carry something only this client has — not the most familiar one. Then ${CHOOSE}`;

/** 气质没说：必问这一题，同一次提问里按需带上别的。 */
export const askNote = (mode: DirectionMode) =>
	`Before choosing, learn the user's preferences without pestering them. The look question in \`ask\` is required: put the option you recommend first with the badge "推荐"/"Recommended", keeping each option's meaning (it lists what the look is like — colours, type, layout). In the same ask_user_question call add any further question the rules below call for. ${ASK_RULES} Then ${CHOOSE} Pass the look answer as \`id\`, and the extra answers as \`preferences\`. ${OWN_LOOK[mode]}`;

export function dealtNote(ask: readonly ToneQuestion[], mode: DirectionMode = "page"): string {
	return ask.length > 0 ? askNote(mode) : CHOOSE_NOTE;
}

export { DirectionError };

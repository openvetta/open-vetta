/**
 * 「发一副候选牌并存进设计」这一步。vetd_create 建设计时直接发，vetd_direction 的
 * deal 动作重发，两处走同一条路，免得两份规则各自漂移。
 *
 * 发牌之所以并进 vetd_create：实测里 flash 级模型读完 skill 后只认工具表里看得见的
 * 工具，建完设计就照着返回值的提示一路写下去，从没回头调 vetd_direction。工具返回值
 * 是每次都会读的，把候选直接放进 vetd_create 的结果里，这一步就跳不过去了。
 */
import type { PluginContext, PluginFsApi } from "@vetta-org/plugin-sdk";
import type { ProductType } from "../vetd/product-size";
import { type DealHistoryEntry, type Dealer, seededRandom } from "./deal";
import { writeDirectionRecord } from "./direction-file";
import { loadTasteLibrary, type TasteLibrary } from "./library";
import type { StatedIntent, ToneQuestion } from "./intent";
import {
	appInputFrom,
	type DealParams,
	type DealtOption,
	DirectionError,
	type DirectionMode,
	pageInputFrom,
	parseHistory,
	startDeal,
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
export function dealInputFor(session: DealSession, mode: DirectionMode, params: DealParams) {
	return mode === "page" ? pageInputFrom(params) : appInputFrom(params, session.lib);
}

export interface DealtDirection {
	options: DealtOption[];
	/** 要问用户的题（ask_user_question 的形状）；为空表示用户已说清楚，直接选。 */
	ask: ToneQuestion[];
}

export async function dealIntoDesign(
	session: DealSession,
	fs: PluginFsApi,
	dirPath: string,
	mode: DirectionMode,
	params: DealParams,
	stated: StatedIntent,
): Promise<DealtDirection> {
	const dealt = startDeal(
		session.dealer,
		mode,
		dealInputFor(session, mode, params),
		session.seed,
		new Date().toISOString(),
		stated,
	);
	await writeDirectionRecord(fs, dirPath, dealt.record);
	return { options: dealt.options, ask: dealt.record.intent?.questions ?? [] };
}

const CHOOSE =
	'call vetd_direction with action "choose" and its id, and apply the sheet it returns before writing any frame. Until a direction is chosen, every capture reports `direction-not-chosen`.';

/** 用户已说清楚（或说了直接做）：模型按用户的话挑。 */
export const CHOOSE_NOTE = `Hold each option against what the user said and your inventory of the subject, and pick the one whose way of composing can carry something only this client has — not the most familiar one. Then ${CHOOSE}`;

/** 有缺口：先问，再带着回答选。 */
export const ASK_NOTE = `Before choosing, ask the user exactly the questions in \`ask\` — one ask_user_question call, in the user's language, keeping each option's meaning; for the "direction" question put the option you recommend first with the badge "推荐"/"Recommended". Do not ask anything the user already said, and nothing else. Then ${CHOOSE} Pass the picked values as \`answers\` (the direction answer is the id). If the user typed their own look instead, deal again with it as \`intent.mood\`.`;

export function dealtNote(ask: readonly ToneQuestion[]): string {
	return ask.length > 0 ? ASK_NOTE : CHOOSE_NOTE;
}

export { DirectionError };

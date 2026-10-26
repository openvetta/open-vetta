/**
 * `vetd_direction`：发方向的 agent 工具。
 *
 * 一个工具、四个动作，而不是四个工具：工具描述每轮都在系统提示里，这一步只在新设计
 * 开头用一两次，不值得占四份描述。规则（何时发、怎么挑、挑完先改 theme.css）归 skill
 * 正文；这里的描述只说做什么、什么时候不用。
 */
import type { PluginContext } from "@vetta-org/plugin-sdk";
import { getCanvasController } from "../canvas/design-runtime";
import { APP_KINDS, ASSETS, type AppInput, type Dealer, PAGE_SECTORS, PAGE_TONES, type PageInput, seededRandom } from "./deal";
import { loadTasteLibrary, type TasteLibrary } from "./library";
import {
	appInputFrom,
	choose,
	type DealParams,
	type DealtOption,
	DIRECTION_FILE,
	DirectionError,
	type DirectionMode,
	type DirectionRecord,
	historyEntry,
	pageInputFrom,
	parseHistory,
	pushHistory,
	redraw,
	startDeal,
} from "./record";
import { readDirectionRecord, writeDirectionRecord } from "./direction-file";
import { renderAppSheet, renderPageSheet } from "./sheet";

export const DIRECTION_TOOL_NAME = "vetd_direction";

/** 每次发牌一个新种子；种子记进 direction.json，同一种子能复现同一副牌。 */
const randomSeed = () => (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1;

/** 跨设计的发牌历史，只用来让连续几份设计不撞车。 */
const HISTORY_PATH = "direction/history.json";

interface DirectionInput extends DealParams {
	action?: unknown;
	id?: unknown;
	slot?: unknown;
	reason?: unknown;
}

interface DirectionToolOptions {
	scopeUse: readonly ("project" | "conversation")[];
}

function sheetFor(lib: TasteLibrary, record: DirectionRecord, frameWidth: number) {
	if (!record.choice) return null;
	const ctx = { frameWidth, seed: record.seed, redraws: record.redraws };
	return "directionId" in record.choice
		? renderPageSheet(lib, record.input as PageInput, record.choice, ctx)
		: renderAppSheet(lib, record.input as AppInput, record.choice, ctx);
}

const DEAL_NOTE =
	"Hold each option against your inventory of the subject and choose the one whose way of composing can carry something only this client has — not the most familiar one. Then call again with action \"choose\" and its id.";

function dealtResult(mode: DirectionMode, options: DealtOption[]) {
	return { ok: true, mode, options, note: DEAL_NOTE };
}

export function registerDirectionTool(ctx: PluginContext, options: DirectionToolOptions): void {
	ctx.agent.registerTool<DirectionInput>({
		id: "vetd-direction",
		name: DIRECTION_TOOL_NAME,
		label: "%tool.vetd_direction%",
		description:
			'Deal the art direction for a new landing page or app screen from a researched library, so the look comes from a draw instead of defaults. `deal` returns three options; `choose` one by id to get its direction sheet (theme.css tokens, fonts to install, composition and blueprints), saved in the design as direction.json; `show` reprints it in a later turn; `redraw` re-deals one slot for a stated reason.\nDo NOT use when the design follows a style pack or DESIGN.md unless `keep` is ["palette","type"], for slides or posters, or for code in the user\'s own repository.\nOnly for the .vetd design open on the canvas.',
		parameters: {
			type: "object",
			properties: {
				action: { type: "string", enum: ["deal", "choose", "show", "redraw"] },
				for: {
					type: "string",
					enum: ["page", "app"],
					description:
						"deal: `page` for a landing or marketing page, `app` for screens people work in (dashboard, admin, settings, inbox).",
				},
				sector: { type: "string", enum: [...PAGE_SECTORS], description: "deal, page: the closest sector." },
				kind: { type: "string", enum: [...APP_KINDS], description: "deal, app: the closest kind of product." },
				brief: { type: "string", description: "deal: one line about the subject, in English." },
				tone: {
					type: "string",
					enum: [...PAGE_TONES],
					description: "deal, page: only when the user clearly asked for one.",
				},
				theme: { type: "string", enum: ["light", "dark"], description: "deal, app: only when the user asked for one." },
				sections: {
					type: "array",
					items: { type: "string" },
					description:
						"deal, page: section roles after the hero, in the order of the page's argument (features, showcase, how-it-works, testimonial, proof, stats, pricing, faq, cta, footer, intro, about, work, gallery, list, contact).",
				},
				screens: {
					type: "array",
					items: { type: "string" },
					description: "deal, app: screens to design (overview, analytics, list, detail, settings, inbox, home, wallet, builder, report).",
				},
				have: {
					type: "array",
					items: { type: "string", enum: [...ASSETS] },
					description:
						"deal: assets that really exist — the project's own photography or product photos, real product-ui screenshots, an illustration set, or an image-tool you can call. Leave out what you do not have.",
				},
				keep: {
					type: "array",
					items: { type: "string", enum: ["palette", "type"] },
					description: "deal: slots a brand, style pack or DESIGN.md already fixes; only the rest is dealt.",
				},
				id: { type: "string", description: "choose: one of the dealt ids." },
				slot: {
					type: "string",
					description: "redraw: page — direction, hero, type, palette, section:<role>; app — style, shell, screen:<name>.",
				},
				reason: { type: "string", description: "redraw: why the dealt slot cannot work for this design." },
			},
			required: ["action"],
			additionalProperties: false,
		},
		scope_use: options.scopeUse,
		handler: async ({ host, session, trigger }) => {
			const controller = getCanvasController();
			if (!controller) {
				return { ok: false, error: "No design is open on the canvas. Create one with vetd_create, or open it first." };
			}
			const { dirPath } = controller.session;
			const frameWidth = controller.session.manifest.defaultFrameSize?.width ?? 1440;
			const input = trigger.input;
			const now = new Date().toISOString();
			const writeRecord = (record: DirectionRecord) => writeDirectionRecord(host.fs, dirPath, record);
			const readHistory = async () =>
				parseHistory(await ctx.storage.readFile(HISTORY_PATH, "utf8").catch(() => null));

			try {
				const lib = await loadTasteLibrary();
				const history = await readHistory();
				const seed = randomSeed();
				const dealer: Dealer = { lib, rnd: seededRandom(seed), history };

				if (input.action === "deal") {
					const mode: DirectionMode | null = input.for === "page" || input.for === "app" ? input.for : null;
					if (!mode) throw new DirectionError('Pass `for`: "page" or "app".');
					const keep = Array.isArray(input.keep) ? input.keep : [];
					const fixedByStyle =
						(await host.fs.stat(`${dirPath}/DESIGN.md`).catch(() => null)) !== null ||
						(await host.fs.stat(`${session.cwd}/design-resources`).catch(() => null)) !== null;
					if (fixedByStyle && !(keep.includes("palette") && keep.includes("type"))) {
						throw new DirectionError(
							'This design follows a style pack or DESIGN.md, which fixes colour and type. Deal composition only, with keep: ["palette", "type"], or skip the draw.',
						);
					}
					const dealInput = mode === "page" ? pageInputFrom(input) : appInputFrom(input, lib);
					const dealt = startDeal(dealer, mode, dealInput, seed, now);
					await writeRecord(dealt.record);
					return dealtResult(mode, dealt.options);
				}

				const record = await readDirectionRecord(host.fs, dirPath);
				if (!record) {
					throw new DirectionError(`This design has no ${DIRECTION_FILE} yet. Deal first with action "deal".`);
				}

				if (input.action === "choose") {
					if (typeof input.id !== "string") throw new DirectionError("Pass `id`, one of the dealt options.");
					const chosen = choose(dealer, record, input.id, now);
					await writeRecord(chosen);
					const entry = historyEntry(chosen);
					if (entry) {
						await ctx.storage
							.writeFile(HISTORY_PATH, JSON.stringify(pushHistory(history, entry)), "utf8")
							.catch(() => {});
					}
					const sheet = sheetFor(lib, chosen, frameWidth);
					return {
						ok: true,
						saved: DIRECTION_FILE,
						...(sheet && sheet.packages.length > 0 ? { install: sheet.packages } : {}),
						sheet: sheet?.text ?? "",
						note: "Install the fonts and write theme.css exactly as the sheet gives them before the first frame, then state the direction in one line of your reply. In a later turn, `show` reprints this sheet.",
					};
				}

				if (input.action === "show") {
					if (!record.choice) {
						return { ok: true, chosen: false, options: record.options, note: 'Options were dealt but none chosen yet: call "choose".' };
					}
					const sheet = sheetFor(lib, record, frameWidth);
					return { ok: true, sheet: sheet?.text ?? "" };
				}

				if (input.action === "redraw") {
					if (typeof input.slot !== "string") throw new DirectionError("Pass `slot` to redraw.");
					const result = redraw(dealer, record, input.slot, typeof input.reason === "string" ? input.reason : "", now);
					await writeRecord(result.record);
					if (result.options) return dealtResult(result.record.mode, result.options);
					const sheet = sheetFor(lib, result.record, frameWidth);
					return {
						ok: true,
						...(sheet && sheet.packages.length > 0 ? { install: sheet.packages } : {}),
						sheet: sheet?.text ?? "",
						note: "Record this redraw and its reason in your report.",
					};
				}

				throw new DirectionError('Pass `action`: "deal", "choose", "show" or "redraw".');
			} catch (error) {
				if (error instanceof DirectionError) return { ok: false, error: error.message };
				throw error;
			}
		},
	});
}

/**
 * `vetd_direction`：发方向的 agent 工具。
 *
 * 一个工具、五个动作，而不是五个工具：工具描述每轮都在系统提示里，这一步只在新设计
 * 开头用一两次，不值得占五份描述。落地页走 deal（从研究库发牌），App 走 propose（agent
 * 自拟三案、工具校验，见 proposal.ts）。规则（何时发、怎么挑、挑完先改 theme.css）归 skill
 * 正文；这里的描述只说做什么、什么时候不用。
 */
import type { PluginContext } from "@vetta-org/plugin-sdk";
import { getCanvasController } from "../canvas/design-runtime";
import { ASSETS, PAGE_SECTORS, PAGE_TONES, type PageInput } from "./deal";
import {
	dealIntoDesign,
	dealtNote,
	HISTORY_PATH,
	openDealSession,
	proposeBrief,
	styleFixedByPack,
} from "./deal-service";
import { INTENT_SCHEMA, PREFERENCES_SCHEMA, preferencesFrom, statedIntentFrom, type ToneQuestion } from "./intent";
import type { TasteLibrary } from "./library";
import { PROPOSAL_SCHEMA } from "./proposal";
import {
	appInputFrom,
	choose,
	chosenProposal,
	type DealParams,
	type DealtOption,
	DIRECTION_FILE,
	DirectionError,
	type DirectionMode,
	type DirectionRecord,
	historyEntry,
	LEGACY_PREFIX,
	propose,
	proposalOptions,
	pushHistory,
	redraw,
	startProposal,
} from "./record";
import { readDirectionRecord, writeDirectionRecord } from "./direction-file";
import { renderAppSheet, renderPageSheet } from "./sheet";
import type { AppInput } from "./deal";

export const DIRECTION_TOOL_NAME = "vetd_direction";

interface DirectionInput extends DealParams {
	action?: unknown;
	intent?: unknown;
	answers?: unknown;
	preferences?: unknown;
	id?: unknown;
	slot?: unknown;
	reason?: unknown;
	options?: unknown;
	obvious?: unknown;
}

interface DirectionToolOptions {
	scopeUse: readonly ("project" | "conversation")[];
}

function sheetFor(lib: TasteLibrary, record: DirectionRecord, frameWidth: number) {
	const { choice } = record;
	if (!choice) return null;
	const ctx = { frameWidth, seed: record.seed, redraws: record.redraws, intent: record.intent };
	if ("directionId" in choice) return renderPageSheet(lib, record.input as PageInput, choice, ctx);
	const proposal = chosenProposal(record);
	if (!proposal) {
		const legacy = choice.proposalId.startsWith(LEGACY_PREFIX) ? choice.proposalId.slice(LEGACY_PREFIX.length) : null;
		return {
			text: legacy
				? `This design took the "${legacy}" style from the retired app library. Its look already lives in theme.css and the existing frames: build new screens from those. To change the look, propose new directions with action "propose" and a \`reason\`.`
				: `The chosen direction \`${choice.proposalId}\` is missing from ${DIRECTION_FILE}. Propose again with action "propose".`,
			packages: [],
		};
	}
	return renderAppSheet(record.input as AppInput, proposal, record.obvious ?? "", ctx);
}

function dealtResult(mode: DirectionMode, dealt: { options: DealtOption[]; ask: ToneQuestion[] }) {
	return {
		ok: true,
		mode,
		options: dealt.options,
		...(dealt.ask.length > 0 ? { ask: dealt.ask } : {}),
		note: dealtNote(dealt.ask, mode),
	};
}

export function registerDirectionTool(ctx: PluginContext, options: DirectionToolOptions): void {
	ctx.agent.registerTool<DirectionInput>({
		id: "vetd-direction",
		name: DIRECTION_TOOL_NAME,
		label: "%tool.vetd_direction%",
		description:
			'Set the art direction for a new landing page or app screens, so the look is decided instead of defaulted. Landing pages: `deal` returns three options drawn from a researched library. App screens: `propose` three directions of your own (the tool checks they avoid generated defaults and differ from each other); `deal` with `for: "app"` reprints how and some raw ingredients. Then `choose` one by id to get its direction sheet (theme.css tokens, fonts to install, composition), saved in the design as direction.json; `show` reprints it in a later turn; `redraw` re-deals one landing slot for a stated reason.\nDo NOT use when the design follows a style pack or DESIGN.md unless `keep` is ["palette","type"], for slides or posters, or for code in the user\'s own repository.\nOnly for the .vetd design open on the canvas.',
		parameters: {
			type: "object",
			properties: {
				action: { type: "string", enum: ["deal", "propose", "choose", "show", "redraw"] },
				for: {
					type: "string",
					enum: ["page", "app"],
					description:
						"deal: `page` for a landing or marketing page, `app` for screens people work in (dashboard, admin, settings, inbox).",
				},
				sector: { type: "string", enum: [...PAGE_SECTORS], description: "deal, page: the closest sector." },
				brief: { type: "string", description: "deal: one line about the subject, in English." },
				tone: {
					type: "string",
					enum: [...PAGE_TONES],
					description: "deal, page: only when the user clearly asked for one.",
				},
				sections: {
					type: "array",
					items: { type: "string" },
					description:
						"deal, page: section roles after the hero, in the order of the page's argument (features, showcase, how-it-works, testimonial, proof, stats, pricing, faq, cta, footer, intro, about, work, gallery, list, contact).",
				},
				screens: {
					type: "array",
					items: { type: "string" },
					description: "deal, app: the screens to design, in your words.",
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
				intent: INTENT_SCHEMA,
				obvious: {
					type: "string",
					description: "propose: the version you would make by habit for this brief — its colours, typeface and layout.",
				},
				options: PROPOSAL_SCHEMA,
				id: { type: "string", description: "choose: one of the dealt or proposed ids." },
				answers: {
					type: "object",
					additionalProperties: { type: "string" },
					description: "choose: the user's picks for the questions in `ask`, by question id (the look answer is `id`).",
				},
				preferences: PREFERENCES_SCHEMA,
				slot: {
					type: "string",
					description: "redraw (landing pages): direction, hero, type, palette, section:<role>.",
				},
				reason: {
					type: "string",
					description: "redraw: why the dealt slot cannot work. propose after a choice: why the chosen direction is being replaced.",
				},
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

			try {
				const dealSession = await openDealSession(ctx);
				const { lib, dealer, history } = dealSession;

				if (input.action === "deal") {
					const mode: DirectionMode | null = input.for === "page" || input.for === "app" ? input.for : null;
					if (!mode) throw new DirectionError('Pass `for`: "page" or "app".');
					const keep = Array.isArray(input.keep) ? input.keep : [];
					if ((await styleFixedByPack(host.fs, session.cwd, dirPath)) && !(keep.includes("palette") && keep.includes("type"))) {
						throw new DirectionError(
							'This design follows a style pack or DESIGN.md, which fixes colour and type. Deal composition only, with keep: ["palette", "type"], or skip the draw.',
						);
					}
					// 不带 intent 的重发沿用上次记下的基调：用户说过的话不该因为重发而丢掉。
					const previous = await readDirectionRecord(host.fs, dirPath);
					const stated = input.intent !== undefined ? statedIntentFrom(input.intent) : (previous?.intent?.stated ?? {});
					if (mode === "page") return dealtResult(mode, await dealIntoDesign(dealSession, host.fs, dirPath, input, stated));
					// App 没有牌可发：没选定时重置成等提案（带上新的基调），选定了就只重印说明，
					// 换方向要走 propose 并说明理由。
					if (!previous || previous.mode !== "app" || !previous.choice) {
						await writeRecord(startProposal(appInputFrom({ ...input, keep }), dealSession.seed, now, stated));
					}
					return { ok: true, mode, ...proposeBrief(dealSession, stated.boldness) };
				}

				if (input.action === "propose") {
					const existing = await readDirectionRecord(host.fs, dirPath);
					// 没经过 vetd_create 的设计（旧设计、手建的）也能直接提案；有风格包时配色字体归包。
					const packed = await styleFixedByPack(host.fs, session.cwd, dirPath);
					const base =
						existing ??
						startProposal(
							appInputFrom(packed ? { ...input, keep: ["palette", "type"] } : input),
							dealSession.seed,
							now,
							input.intent !== undefined ? statedIntentFrom(input.intent) : {},
						);
					const result = propose(base, input.options, input.obvious, history, now, typeof input.reason === "string" ? input.reason : "");
					await writeRecord(result.record);
					return dealtResult("app", { options: result.options, ask: result.record.intent?.questions ?? [] });
				}

				const record = await readDirectionRecord(host.fs, dirPath);
				if (!record) {
					throw new DirectionError(
						`This design has no ${DIRECTION_FILE} yet. Deal first with action "deal" (landing page), or propose with action "propose" (app screens).`,
					);
				}

				if (input.action === "choose") {
					if (typeof input.id !== "string") throw new DirectionError("Pass `id`, one of the dealt options.");
					const chosen = choose(dealer, record, input.id, now, input.answers, preferencesFrom(input.preferences));
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
						note: "Before the first frame: install the fonts, write theme.css exactly as the sheet gives them, and get the pictures its Pictures section asks for with vetd_assets; then state the direction in one line of your reply. In a later turn, `show` reprints this sheet.",
					};
				}

				if (input.action === "show") {
					if (!record.choice) {
						if (record.mode === "app" && record.options.length === 0) {
							return { ok: true, chosen: false, mode: "app", ...proposeBrief(dealSession, record.intent?.stated.boldness) };
						}
						const ask = record.intent?.questions ?? [];
						return {
							ok: true,
							chosen: false,
							options: record.mode === "app" ? proposalOptions(record) : record.options,
							...(ask.length > 0 ? { ask } : {}),
							note: dealtNote(ask, record.mode),
						};
					}
					const sheet = sheetFor(lib, record, frameWidth);
					return { ok: true, sheet: sheet?.text ?? "" };
				}

				if (input.action === "redraw") {
					if (typeof input.slot !== "string") throw new DirectionError("Pass `slot` to redraw.");
					const result = redraw(dealer, record, input.slot, typeof input.reason === "string" ? input.reason : "", now);
					await writeRecord(result.record);
					if (result.options) {
						return dealtResult(result.record.mode, { options: result.options, ask: result.record.intent?.questions ?? [] });
					}
					const sheet = sheetFor(lib, result.record, frameWidth);
					return {
						ok: true,
						...(sheet && sheet.packages.length > 0 ? { install: sheet.packages } : {}),
						sheet: sheet?.text ?? "",
						note: "Record this redraw and its reason in your report.",
					};
				}

				throw new DirectionError('Pass `action`: "deal", "propose", "choose", "show" or "redraw".');
			} catch (error) {
				if (error instanceof DirectionError) return { ok: false, error: error.message };
				throw error;
			}
		},
	});
}

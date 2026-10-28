/**
 * App 方向由 agent 自拟三案、工具校验（src/direction/proposal.ts）。
 *
 * 复现的问题（2026-10-27）：从前 App 按 kind 从 7 套后台风格里发牌，点单、外卖、银行全被
 * 套进后台风格，六份银行首页同一个蓝、同一款字。现在模板没了，这里守住剩下的两道闸：
 * 不许回到生成默认值，三案彼此要拉开、也不重复最近的设计。
 */
import { describe, expect, it } from "vitest";
import type { DealHistoryEntry, Dealer } from "../src/direction/deal";
import { seededRandom } from "../src/direction/deal";
import type { TasteLibrary } from "../src/direction/library";
import { contrast, hueFamily, parseProposals, ProposalError } from "../src/direction/proposal";
import { loud, night, OBVIOUS, option, type Raw } from "./proposal-fixture";
import {
	allowedTells,
	appInputFrom,
	choose,
	DIRECTION_NOT_CHOSEN_RULE,
	DirectionError,
	directionIssues,
	historyEntry,
	parseDirectionRecord,
	propose,
	redraw,
	serializeDirectionRecord,
	startProposal,
} from "../src/direction/record";

const NOW = "2026-10-27T00:00:00.000Z";
const dealer: Dealer = { lib: {} as TasteLibrary, rnd: seededRandom(1), history: [] };

const ctx = (overrides: Partial<Parameters<typeof parseProposals>[2]> = {}) => ({
	keep: [],
	stated: {},
	history: [],
	...overrides,
});

const problems = (options: Raw[], c = ctx(), obvious: unknown = OBVIOUS): string => {
	try {
		parseProposals(options, obvious, c);
	} catch (error) {
		if (error instanceof ProposalError) return error.message;
		throw error;
	}
	return "";
};

describe("颜色判断", () => {
	it("色系：Material 那档的蓝算 blue，靛蓝紫单独一档，近黑算中性", () => {
		expect(hueFamily("#1d5fd6")).toBe("blue");
		expect(hueFamily("#4f46e5")).toBe("violet");
		expect(hueFamily("#635bff")).toBe("violet");
		expect(hueFamily("#141414")).toBe("neutral");
		expect(hueFamily("#f26b1d")).toBe("orange");
		expect(hueFamily("#1f6b3a")).toBe("green");
	});

	it("对比度按 WCAG 算", () => {
		expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
		expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
	});
});

describe("提案校验", () => {
	it("三案拉开、避开默认值：收下，主色上的字自动配黑白", () => {
		const { proposals } = parseProposals([option(), night(), loud()], OBVIOUS, ctx());
		expect(proposals.map((p) => p.id)).toEqual(["roast-ledger", "night-counter", "tamper-green"]);
		expect(proposals[0].colours?.onAccent).toBe("#ffffff");
	});

	it("没写平庸版本、少一案：一次列出全部问题", () => {
		const message = problems([option(), night()], ctx(), "");
		expect(message).toMatch(/`obvious` is missing/);
		expect(message).toMatch(/exactly three options \(got 2\)/);
	});

	it("靛蓝紫主色是生成默认值；用户自己点了颜色就不拦", () => {
		const violet = loud({ colours: { ground: "#ffffff", panel: "#f3f3f7", text: "#111111", muted: "#55555f", accent: "#4f46e5" } });
		expect(problems([option(), night(), violet])).toMatch(/indigo or violet accent/);
		expect(problems([option(), night(), violet], ctx({ stated: { colour: "用品牌紫" } }))).toBe("");
	});

	it("被用烂的标题字、装不上的字体都拦下，并列出能装的", () => {
		const message = problems([
			option({ type: { display: "Inter", text: "Inter", class: "grotesk-tight" } }),
			night({ type: { display: "Helvetica Neue", text: "Public Sans", class: "grotesk-tight" } }),
			loud(),
		]);
		expect(message).toMatch(/Inter is what the average screen already uses/);
		expect(message).toMatch(/"Helvetica Neue" cannot be installed here. Installable faces: .*Fraunces/);
	});

	it("对比度不够的配色拦下", () => {
		const faint = option({ colours: { ground: "#ffffff", panel: "#f4f4f4", text: "#1d1a16", muted: "#b0b0b0", accent: "#9c3d1c" } });
		expect(problems([faint, night(), loud()])).toMatch(/muted is .*:1, needs 4.5:1/);
	});

	it("只换了主色的两案算同一个方向；蓝色最多一案", () => {
		const twin = option({ id: "roast-twin", colours: { ground: "#f4efe6", panel: "#e9e1d3", text: "#1d1a16", muted: "#5d554b", accent: "#1f6b3a" } });
		expect(problems([option(), twin, night()])).toMatch(/"roast-ledger" and "roast-twin" are the same direction twice/);

		const blue = (id: string, theme: string, display: string, cls: string): Raw =>
			option({
				id,
				theme,
				colours:
					theme === "dark"
						? { ground: "#0b0d10", panel: "#161a20", text: "#f2f4f7", muted: "#9aa3ad", accent: "#3b82f6" }
						: { ground: "#ffffff", panel: "#f2f4f7", text: "#111418", muted: "#555d66", accent: "#1d5fd6" },
				type: { display, text: "Public Sans", class: cls },
			});
		expect(problems([blue("a", "light", "Fraunces", "serif-display"), blue("b", "dark", "Syne", "extended-heavy"), loud()])).toMatch(
			/More than one option has a blue accent/,
		);
	});

	it("用户要深色、三案都是深色：只要色系和字类都不同就行", () => {
		const darkA = night({ id: "dark-a" });
		const darkB = night({
			id: "dark-b",
			colours: { ground: "#0c0f0d", panel: "#17201a", text: "#eef5ef", muted: "#9bb0a0", accent: "#4fbf7a" },
			type: { display: "Fraunces", text: "Figtree", class: "serif-display" },
		});
		const darkC = night({
			id: "dark-c",
			colours: { ground: "#100c0e", panel: "#20171b", text: "#f7eef1", muted: "#b39aa3", accent: "#e5566f" },
			type: { display: "Syne", text: "Figtree", class: "extended-heavy" },
		});
		expect(problems([darkA, darkB, darkC])).toBe("");
	});

	it("不重复最近几份 App 设计用过的组合", () => {
		const history: DealHistoryEntry[] = [{ at: NOW, mode: "app", theme: "light", hue: "orange", typeClass: "serif-display", display: "Fraunces" }];
		expect(problems([option(), night(), loud()], ctx({ history }))).toMatch(/"roast-ledger" repeats a recent design/);
	});

	it("品牌锁住配色：不要颜色，只比明暗和字类", () => {
		const bare = (id: string, theme: string, cls: string, display: string): Raw => {
			const raw = option({ id, theme, type: { display, text: "Figtree", class: cls } });
			delete raw.colours;
			return raw;
		};
		const kept = ctx({ keep: ["palette"] });
		expect(
			problems([bare("a", "light", "serif-display", "Fraunces"), bare("b", "dark", "serif-display", "Fraunces"), bare("c", "light", "condensed-heavy", "Anton")], kept),
		).toBe("");
		expect(problems([bare("a", "light", "serif-display", "Fraunces"), bare("b", "light", "serif-display", "Literata"), bare("c", "dark", "slab", "Bitter")], kept)).toMatch(
			/"a" and "b" are the same direction twice/,
		);
	});

	it("表现手法要写明理由", () => {
		expect(problems([option({ devices: [{ device: "gradient", reason: "" }] }), night(), loud()])).toMatch(/devices.gradient: give the reason/);
		expect(problems([option({ devices: [{ device: "sparkle", reason: "because" }] }), night(), loud()])).toMatch(/"sparkle" is not one of/);
	});
});

describe("提案进设计", () => {
	const input = appInputFrom({ brief: "coffee ordering app", screens: ["menu", "order"] });
	const waiting = () => startProposal(input, 1, NOW, {});

	it("建好还没提案：每帧都报没定方向；没提案不能选", () => {
		expect(directionIssues(waiting())).toMatchObject([{ rule: DIRECTION_NOT_CHOSEN_RULE, message: expect.stringMatching(/"propose"/) }]);
		expect(() => choose(dealer, waiting(), "roast-ledger", NOW)).toThrow(/Nothing has been proposed/);
	});

	it("提案 → 气质题列出看得见的特征 → 选定：放行它写明的手法，历史记下可比的几项", () => {
		const proposed = propose(
			waiting(),
			[option({ devices: [{ device: "shadow", reason: "the order sheet floats over the menu" }] }), night(), loud()],
			OBVIOUS,
			[],
			NOW,
			"",
		);
		expect(proposed.options[0]).toMatchObject({ id: "roast-ledger", look: expect.stringMatching(/^Light · ground #f4efe6, accent #9c3d1c · Fraunces \/ Figtree/) });
		expect(proposed.record.intent?.questions.map((q) => q.id)).toEqual(["direction"]);
		const chosen = choose(dealer, proposed.record, "roast-ledger", NOW);
		expect(chosen.choice).toEqual({ proposalId: "roast-ledger" });
		expect(chosen.allow).toEqual(["tell-shadow"]);
		expect(allowedTells(chosen)).toEqual(["tell-shadow"]);
		expect(historyEntry(chosen)).toEqual({ at: NOW, mode: "app", theme: "light", hue: "orange", typeClass: "serif-display", display: "Fraunces" });
		expect(directionIssues(chosen)).toEqual([]);
	});

	it("选定后再提案就是换方向：要理由，记进 redraws，选定清空", () => {
		const proposed = propose(waiting(), [option(), night(), loud()], OBVIOUS, [], NOW, "");
		const chosen = choose(dealer, proposed.record, "roast-ledger", NOW);
		expect(() => propose(chosen, [option(), night(), loud()], OBVIOUS, [], NOW, "")).toThrow(/pass `reason`/);
		const again = propose(chosen, [option(), night(), loud()], OBVIOUS, [], NOW, "用户想要更暗的");
		expect(again.record.choice).toBeNull();
		expect(again.record.redraws).toEqual([{ slot: "direction", reason: "用户想要更暗的", at: NOW }]);
	});

	it("App 不能 redraw，指向 propose", () => {
		const chosen = choose(dealer, propose(waiting(), [option(), night(), loud()], OBVIOUS, [], NOW, "").record, "night-counter", NOW);
		expect(() => redraw(dealer, chosen, "style", "x", NOW)).toThrow(DirectionError);
		expect(() => redraw(dealer, chosen, "style", "x", NOW)).toThrow(/"propose"/);
	});

	it("写出去再读回来不丢东西", () => {
		const chosen = choose(dealer, propose(waiting(), [option(), night(), loud()], OBVIOUS, [], NOW, "").record, "tamper-green", NOW);
		expect(parseDirectionRecord(serializeDirectionRecord(chosen))).toEqual(chosen);
	});

	it("旧版 App 记录（选的是退役风格库）照旧读进来，不当成没选", () => {
		const legacy = parseDirectionRecord(
			JSON.stringify({
				version: 1,
				mode: "app",
				input: { kind: "finance", brief: "bank", theme: null, screens: ["overview"], keep: [], avoid: [] },
				seed: 1,
				options: ["achromatic-ledger", "pastel-consumer"],
				choice: { styleId: "pastel-consumer", shellId: "open-plane", screens: [] },
				allow: [],
			}),
		);
		expect(legacy?.choice).toEqual({ proposalId: "legacy:pastel-consumer" });
		expect(directionIssues(legacy)).toEqual([]);
	});
});

describe("大胆度", () => {
	const BREAKS = "The whole first screen turns the colour of the roast, a full-bleed field behind the bag.";
	const bold = (shell: string, extra: Raw = {}) => ({ shell, breaks: BREAKS, ...extra });

	it("稳重（没说）时 shell 与 breaks 都不要求", () => {
		expect(problems([option(), night(), loud()])).toBe("");
	});

	it("大胆：每案都要 shell 和 breaks，缺了一次列全", () => {
		const message = problems([option(), night(), loud()], ctx({ stated: { boldness: "bold" } }));
		expect(message).toMatch(/options\[0\]\.shell is required/);
		expect(message).toMatch(/options\[2\]\.breaks is required/);
	});

	it("大胆：三案外壳必须各不相同", () => {
		const message = problems(
			[option(bold("sidebar")), night(bold("sidebar")), loud(bold("rail"))],
			ctx({ stated: { boldness: "bold" } }),
		);
		expect(message).toMatch(/three different shells/);
		expect(
			problems([option(bold("sidebar")), night(bold("bottom-tabs")), loud(bold("rail"))], ctx({ stated: { boldness: "bold" } })),
		).toBe("");
	});

	it("shell 写了不认识的值就报错", () => {
		expect(problems([option({ shell: "dock" }), night(), loud()])).toMatch(/options\[0\]\.shell is one of/);
	});

	it("选定后放行的机检规则随大胆度增加，稳重不变", () => {
		const input = appInputFrom({ for: "app", brief: "coffee orders" });
		const tellsFor = (boldness?: "restrained" | "expressive" | "bold") => {
			const stated = boldness ? { boldness } : {};
			const proposed = propose(startProposal(input, 1, NOW, stated), [option(bold("sidebar")), night(bold("rail")), loud(bold("split"))], OBVIOUS, [], NOW, "");
			return choose(dealer, proposed.record, "roast-ledger", NOW).allow;
		};
		expect(tellsFor()).toEqual([]);
		expect(tellsFor("expressive")).toEqual(["tell-gradient", "tell-gradient-text", "tell-shadow", "tell-glass"]);
		expect(tellsFor("bold")).toEqual(
			expect.arrayContaining(["tell-gradient", "tell-shadow", "tell-glass", "tell-font-count", "tell-micro-label"]),
		);
	});

	it("texture 手法放行渐变与阴影两条机检，且要写理由", () => {
		const input = appInputFrom({ for: "app", brief: "bank card manager" });
		const withTexture = option({ devices: [{ device: "texture", reason: "the bank card is the hero object" }] });
		const proposed = propose(startProposal(input, 1, NOW, {}), [withTexture, night(), loud()], OBVIOUS, [], NOW, "");
		expect(choose(dealer, proposed.record, "roast-ledger", NOW).allow).toEqual(["tell-gradient", "tell-shadow"]);
		expect(problems([option({ devices: [{ device: "texture", reason: "" }] }), night(), loud()])).toMatch(/devices\.texture: give the reason/);
	});
});

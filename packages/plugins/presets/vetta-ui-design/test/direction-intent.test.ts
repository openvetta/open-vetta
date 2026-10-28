/**
 * 设计基调：向用户了解偏好，但不过度打扰。
 *
 * 工具只保证气质（看起来像什么）这一题必问——选项来自实际发出的候选；其余问什么、问几题
 * 归 agent 读用户原话来定，这里不预设题库。agent 问过的题与回答记进 preferences，
 * 作为硬条件写进方向表，之后追加页面沿用。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/direction/deal";
import {
	checkAnswers,
	intentLines,
	mergePreferences,
	preferencesFrom,
	statedIntentFrom,
	toneQuestions,
} from "../src/direction/intent";
import { adaptLibrary } from "../src/direction/library";
import {
	appInputFrom,
	choose,
	pageInputFrom,
	parseDirectionRecord,
	propose,
	redraw,
	serializeDirectionRecord,
	startDeal,
	startProposal,
} from "../src/direction/record";
import { renderAppSheet } from "../src/direction/sheet";
import { chosenApp, loud, night, OBVIOUS, option } from "./proposal-fixture";

const LIB_DIR = join(__dirname, "../vendor/taste-skill/library");
const read = (name: string): unknown => JSON.parse(readFileSync(join(LIB_DIR, `${name}.json`), "utf8"));
const lib = adaptLibrary({
	directions: read("directions"),
	heroes: read("heroes"),
	sections: read("sections"),
	type: read("type"),
	palettes: read("palettes"),
});
const NOW = "2026-10-27T00:00:00.000Z";
const dealer = (seed = 1) => ({ lib, rnd: seededRandom(seed), history: [] });
const options = [
	{ id: "a", name: "A", summary: "a" },
	{ id: "b", name: "B", summary: "b" },
	{ id: "c", name: "C", summary: "c" },
];
const ids = (mode: "page" | "app", stated: Parameters<typeof toneQuestions>[1]) =>
	toneQuestions(mode, stated, options).map((question) => question.id);

describe("工具必问的只有气质", () => {
	it("没说气质：只问气质，App 与落地页一样，不再预设侧重和品牌色", () => {
		expect(ids("app", {})).toEqual(["direction"]);
		expect(ids("app", { colour: "深色", brand: "Emby" })).toEqual(["direction"]);
		expect(ids("page", {})).toEqual(["direction"]);
	});

	it("给了参考产品或气质：一题不问", () => {
		expect(ids("app", { mood: "像 Apple TV", colour: "深色", emphasis: "海报大图为主" })).toEqual([]);
		expect(ids("app", { mood: "极简", brand: "Emby" })).toEqual([]);
	});

	it("用户说了直接做：一题不问", () => {
		expect(ids("app", { goAhead: true })).toEqual([]);
	});

	it("候选不到两个就没有可挑的：不问", () => {
		expect(toneQuestions("app", {}, options.slice(0, 1))).toEqual([]);
	});

	it("题目是 ask_user_question 的形状：每题 2-4 个选项，不自带「其他」", () => {
		const many = [...options, { id: "d", name: "D", summary: "d" }, { id: "e", name: "E", summary: "e" }];
		for (const question of toneQuestions("app", {}, many)) {
			expect(question.options.length).toBeGreaterThanOrEqual(2);
			expect(question.options.length).toBeLessThanOrEqual(4);
			expect(question.header.length).toBeLessThanOrEqual(24);
			expect(question.options.map((option) => option.label.toLowerCase())).not.toContain("other");
		}
	});

	it("选项描述把看得见的特征放在前面，再接一句做法", () => {
		const [question] = toneQuestions("app", {}, [
			{ id: "a", name: "A (light)", summary: "Quiet ledger. The move: ink only.", look: "Light · ground #f8f8f8 · Geist" },
			{ id: "b", name: "B (dark)", summary: "Night mode. The move: lightness.", look: "Dark · ground #000000 · Inter" },
		]);
		expect(question?.options[0]?.description).toBe("Light · ground #f8f8f8 · Geist. Quiet ledger.");
		expect(question?.options[1]?.description).toBe("Dark · ground #000000 · Inter. Night mode.");
	});

	it("agent 提的 App 候选都带着看得见的特征：明暗、底色、强调色、字体", () => {
		const proposed = propose(startProposal(appInputFrom({}), 1, NOW), [option(), night(), loud()], OBVIOUS, [], NOW, "");
		for (const dealt of proposed.options) {
			expect(dealt.look, dealt.id).toMatch(/^(Light|Dark) · ground #[0-9a-f]{6}/i);
			expect(dealt.look, dealt.id).toMatch(/accent #[0-9a-f]{6}/i);
		}
		const question = proposed.record.intent?.questions[0];
		expect(question?.options[0]?.description).toContain(proposed.options[0]!.look);
	});

	it("入参只认这几个键，空串当没说", () => {
		expect(statedIntentFrom({ mood: "  ", colour: "深色", extra: 1, goAhead: "yes" })).toEqual({ colour: "深色" });
		expect(statedIntentFrom(null)).toEqual({});
		expect(statedIntentFrom({ boldness: "bold" })).toEqual({ boldness: "bold" });
		expect(statedIntentFrom({ boldness: "wild" })).toEqual({});
	});
});

describe("agent 自己问的题记成偏好", () => {
	it("只认问题和回答都非空的条目，空白修剪", () => {
		expect(
			preferencesFrom([
				{ question: " 这个 App 给谁用？ ", answer: " 顾客点单取餐 " },
				{ question: "半截", answer: "" },
				{ question: "", answer: "没题目" },
				"not an object",
			]),
		).toEqual([{ question: "这个 App 给谁用？", answer: "顾客点单取餐" }]);
		expect(preferencesFrom("nope")).toEqual([]);
		expect(statedIntentFrom({ preferences: [{ question: "q", answer: "a" }] }).preferences).toEqual([{ question: "q", answer: "a" }]);
	});

	it("同一道题再答一次以最新的为准", () => {
		const merged = mergePreferences(
			[{ question: "明暗？", answer: "亮色" }],
			[
				{ question: "明暗？", answer: "深色" },
				{ question: "素材？", answer: "有 logo" },
			],
		);
		expect(merged).toEqual([
			{ question: "明暗？", answer: "深色" },
			{ question: "素材？", answer: "有 logo" },
		]);
	});

	it("choose 时带上的偏好存进设计，不影响气质题的核对", () => {
		const { record: chosen } = chosenApp(appInputFrom({}), "night-counter", {}, [{ question: "明暗？", answer: "深色" }]);
		expect(chosen.intent?.stated.preferences).toEqual([{ question: "明暗？", answer: "深色" }]);
		expect(chosen.intent?.answers).toEqual({ direction: "night-counter" });
	});
});

describe("回答", () => {
	it("方向题的答案就是选中的 id；老记录里留下的选项题仍然核对", () => {
		const legacy = [
			...toneQuestions("app", {}, options),
			{
				id: "emphasis" as const,
				question: "What should the screens put first?",
				header: "Emphasis",
				options: [
					{ value: "pictures", label: "Pictures lead", description: "" },
					{ value: "information", label: "Information leads", description: "" },
				],
			},
		];
		expect(() => checkAnswers(legacy, {}, "a")).toThrow(/emphasis/);
		expect(() => checkAnswers(legacy, { emphasis: "posters" }, "a")).toThrow(/emphasis/);
		expect(checkAnswers(legacy, { emphasis: "pictures" }, "b")).toEqual({ direction: "b", emphasis: "pictures" });
	});

	it("用户说清楚了的设计不用回答就能选", () => {
		const dealt = startDeal(dealer(), pageInputFrom({ sector: "saas" }), 1, NOW, { mood: "像 Stripe" });
		expect(dealt.record.intent?.questions).toEqual([]);
		expect(choose(dealer(), dealt.record, dealt.options[1]!.id, NOW).choice).not.toBeNull();
	});
});

describe("方向表与记录", () => {
	it("用户的原话与回答排在方向表最前，标明它们高于方向表", () => {
		const { record: chosen, proposal } = chosenApp(
			appInputFrom({}),
			"roast-ledger",
			{ colour: "深色", emphasis: "海报大图为主", brand: "Emby" },
			[{ question: "这个 App 给谁用？", answer: "顾客点单取餐" }],
		);
		const sheet = renderAppSheet(chosen.input as never, proposal, chosen.obvious ?? "", {
			frameWidth: 390,
			seed: 1,
			redraws: [],
			intent: chosen.intent,
		}).text;
		const head = sheet.indexOf("## What the user asked for");
		expect(head).toBeGreaterThan(0);
		expect(head).toBeLessThan(sheet.indexOf("## 1. The idea"));
		expect(sheet).toContain('- Colour: "深色"');
		expect(sheet).toContain('- Emphasis: "海报大图为主"');
		expect(sheet).toContain('- Asked "这个 App 给谁用？" — the user answered "顾客点单取餐". Binding.');
		expect(intentLines(undefined)).toEqual([]);
	});

	it("换方向时沿用用户说过的基调和偏好；写出去读回来不丢", () => {
		const dealt = startDeal(dealer(), pageInputFrom({ sector: "saas" }), 1, NOW, { mood: "像 Linear" });
		const chosen = choose(dealer(), dealt.record, dealt.options[0]!.id, NOW, undefined, [{ question: "q", answer: "a" }]);
		const next = redraw(dealer(2), chosen, "direction", "too loud for the brief", NOW);
		expect(next.record.intent?.stated).toEqual({ mood: "像 Linear", preferences: [{ question: "q", answer: "a" }] });
		expect(parseDirectionRecord(serializeDirectionRecord(chosen))?.intent).toEqual(chosen.intent);
		// 旧版 direction.json 没有 intent，照样能读。
		const legacy = JSON.parse(serializeDirectionRecord(chosen));
		delete legacy.intent;
		expect(parseDirectionRecord(JSON.stringify(legacy))?.intent).toBeUndefined();
	});
});

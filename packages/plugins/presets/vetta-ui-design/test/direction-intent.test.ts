/**
 * 设计基调：说清楚的照做，只问会大幅改变结果的缺口。
 *
 * 用例按讨论里定下的几种需求写：只说了深色、给了参考产品、缺侧重、落地页、要直接做、
 * 点名品牌没说颜色。问不问由规则决定，不让模型临场判断。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/direction/deal";
import { checkAnswers, intentLines, statedIntentFrom, toneQuestions } from "../src/direction/intent";
import { adaptLibrary } from "../src/direction/library";
import {
	appInputFrom,
	choose,
	DirectionError,
	pageInputFrom,
	parseDirectionRecord,
	redraw,
	serializeDirectionRecord,
	startDeal,
} from "../src/direction/record";
import { renderAppSheet } from "../src/direction/sheet";

const LIB_DIR = join(__dirname, "../vendor/taste-skill/library");
const read = (name: string): unknown => JSON.parse(readFileSync(join(LIB_DIR, `${name}.json`), "utf8"));
const lib = adaptLibrary({
	directions: read("directions"),
	heroes: read("heroes"),
	sections: read("sections"),
	type: read("type"),
	palettes: read("palettes"),
	app: read("app"),
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

describe("问哪几题", () => {
	it("「深色风格」只说了色调：问气质和侧重，不问颜色", () => {
		expect(ids("app", { colour: "深色", brand: "Emby" })).toEqual(["direction", "emphasis"]);
	});

	it("给了参考产品、色调和侧重：一题不问", () => {
		expect(ids("app", { mood: "像 Apple TV", colour: "深色", emphasis: "海报大图为主" })).toEqual([]);
	});

	it("「深色、极简」缺侧重：只问侧重", () => {
		expect(ids("app", { mood: "极简", colour: "深色" })).toEqual(["emphasis"]);
	});

	it("落地页的侧重由论点决定，不问", () => {
		expect(ids("page", { mood: "像 Stripe", colour: "#0f766e" })).toEqual([]);
		expect(ids("page", {})).toEqual(["direction"]);
	});

	it("用户说了直接做：一题不问", () => {
		expect(ids("app", { goAhead: true })).toEqual([]);
	});

	it("点名品牌却没说颜色：问品牌色怎么用，推荐只上主操作", () => {
		const [question] = toneQuestions("page", { mood: "极简", brand: "Emby" }, options);
		expect(question?.id).toBe("brandColour");
		expect(question?.question).toContain("Emby");
		expect(question?.options[0]).toMatchObject({ value: "action-only", badges: ["Recommended"] });
	});

	it("题目是 ask_user_question 的形状：每题 2-4 个选项，不自带「其他」", () => {
		for (const question of toneQuestions("app", { brand: "Emby" }, [...options, { id: "d", name: "D", summary: "d" }, { id: "e", name: "E", summary: "e" }])) {
			expect(question.options.length).toBeGreaterThanOrEqual(2);
			expect(question.options.length).toBeLessThanOrEqual(4);
			expect(question.header.length).toBeLessThanOrEqual(24);
			expect(question.options.map((option) => option.label.toLowerCase())).not.toContain("other");
		}
	});

	it("入参只认这几个键，空串当没说", () => {
		expect(statedIntentFrom({ mood: "  ", colour: "深色", extra: 1, goAhead: "yes" })).toEqual({ colour: "深色" });
		expect(statedIntentFrom(null)).toEqual({});
	});
});

describe("回答", () => {
	const questions = toneQuestions("app", { brand: "Emby" }, options);

	it("每道问过的题都要有答案，选项题只认列出的值；方向题的答案就是选中的 id", () => {
		expect(() => checkAnswers(questions, {}, "a")).toThrow(/emphasis.*brandColour/);
		expect(() => checkAnswers(questions, { emphasis: "posters", brandColour: "none" }, "a")).toThrow(/emphasis/);
		expect(checkAnswers(questions, { emphasis: "pictures", brandColour: "none" }, "b")).toEqual({
			direction: "b",
			emphasis: "pictures",
			brandColour: "none",
		});
	});

	it("没问用户就选：拒绝并说明怎么问", () => {
		const dealt = startDeal(dealer(), "app", appInputFrom({ kind: "community" }, lib), 1, NOW, { brand: "Emby" });
		expect(() => choose(dealer(), dealt.record, dealt.options[0]!.id, NOW)).toThrow(DirectionError);
		expect(() => choose(dealer(), dealt.record, dealt.options[0]!.id, NOW)).toThrow(/ask_user_question/);
	});

	it("品牌色答「不用」就照常发配色，答「只上主操作」就保留品牌配色", () => {
		const input = appInputFrom({ kind: "community" }, lib);
		const dealt = startDeal(dealer(), "app", input, 1, NOW, { brand: "Emby" });
		const id = dealt.options[0]!.id;
		const none = choose(dealer(), dealt.record, id, NOW, { emphasis: "pictures", brandColour: "none" });
		expect(none.input.keep).not.toContain("palette");
		const kept = choose(dealer(), dealt.record, id, NOW, { emphasis: "pictures", brandColour: "action-only" });
		expect(kept.input.keep).toContain("palette");
		expect(kept.intent?.answers).toMatchObject({ emphasis: "pictures", brandColour: "action-only" });
	});

	it("用户说清楚了的设计不用回答就能选", () => {
		const dealt = startDeal(dealer(), "page", pageInputFrom({ sector: "saas" }), 1, NOW, { mood: "像 Stripe" });
		expect(dealt.record.intent?.questions).toEqual([]);
		expect(choose(dealer(), dealt.record, dealt.options[1]!.id, NOW).choice).not.toBeNull();
	});
});

describe("方向表与记录", () => {
	it("用户的原话与回答排在方向表最前，标明它们高于方向表", () => {
		const dealt = startDeal(dealer(), "app", appInputFrom({ kind: "community" }, lib), 1, NOW, {
			colour: "深色",
			brand: "Emby",
		});
		const chosen = choose(dealer(), dealt.record, dealt.options[0]!.id, NOW, { emphasis: "pictures" });
		const sheet = renderAppSheet(lib, chosen.input as never, chosen.choice as never, {
			frameWidth: 390,
			seed: 1,
			redraws: [],
			intent: chosen.intent,
		}).text;
		const head = sheet.indexOf("## What the user asked for");
		expect(head).toBeGreaterThan(0);
		expect(head).toBeLessThan(sheet.indexOf("## 1. The style"));
		expect(sheet).toContain('- Colour: "深色"');
		expect(sheet).toContain("pictures lead");
		expect(intentLines(undefined)).toEqual([]);
	});

	it("换方向时沿用用户说过的基调；写出去读回来不丢", () => {
		const dealt = startDeal(dealer(), "page", pageInputFrom({ sector: "saas" }), 1, NOW, { mood: "像 Linear" });
		const chosen = choose(dealer(), dealt.record, dealt.options[0]!.id, NOW);
		const next = redraw(dealer(2), chosen, "direction", "too loud for the brief", NOW);
		expect(next.record.intent?.stated).toEqual({ mood: "像 Linear" });
		expect(parseDirectionRecord(serializeDirectionRecord(chosen))?.intent).toEqual(chosen.intent);
		// 旧版 direction.json 没有 intent，照样能读。
		const legacy = JSON.parse(serializeDirectionRecord(chosen));
		delete legacy.intent;
		expect(parseDirectionRecord(JSON.stringify(legacy))?.intent).toBeUndefined();
	});
});

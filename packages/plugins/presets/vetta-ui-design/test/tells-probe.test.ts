/**
 * 生成感机检。探针本身只在 happy-dom 上验证不抛（没有排版引擎，量不出尺寸）；判据
 * 全在转换这一半：同一个量到的值，在落地页和 App 屏幕上结论不同，被方向放行的不报，
 * 没发过方向的设计一条都不报。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/direction/deal";
import { adaptLibrary } from "../src/direction/library";
import {
	allowedTells,
	appInputFrom,
	choose,
	directionIssues,
	pageInputFrom,
	startDeal,
	tellsFor,
} from "../src/direction/record";
import { layoutIssues } from "../src/vetd/layout-probe";
import { chosenApp } from "./proposal-fixture";
import { TELL_RULE_IDS, TELLS_PROBE_SCRIPT, tellIssues } from "../src/vetd/tells-probe";

const page = { mode: "page" as const, allow: [] };
const app = { mode: "app" as const, allow: [] };

const tell = (rule: string, over: Record<string, unknown> = {}) => ({
	rule,
	source: "frames/home.tsx:12",
	detail: "x",
	text: "Pricing",
	value: null,
	...over,
});

describe("tellIssues", () => {
	it("没发过方向的设计不报任何一条", () => {
		expect(tellIssues([tell("tell-gradient")], "home", null)).toEqual([]);
	});

	it("每条规则都有说明量到了什么、换成什么的文案", () => {
		for (const rule of TELL_RULE_IDS) {
			const value = rule === "tell-small-text" ? 10 : rule === "tell-shadow" ? 0.3 : 3;
			const [issue] = tellIssues([tell(rule, { value })], "home", page);
			expect(issue, rule).toBeDefined();
			expect(issue.message.length, rule).toBeGreaterThan(40);
		}
	});

	it("同一个量，落地页和 App 屏幕的结论不同", () => {
		const faintShadow = tell("tell-shadow", { value: 0.05 });
		expect(tellIssues([faintShadow], "home", page)).toHaveLength(1);
		expect(tellIssues([faintShadow], "home", app)).toEqual([]);
		expect(tellIssues([tell("tell-shadow", { value: 0.2 })], "home", app)).toHaveLength(1);

		const twelvePx = tell("tell-small-text", { value: 12 });
		expect(tellIssues([twelvePx], "home", page)).toHaveLength(1);
		expect(tellIssues([twelvePx], "home", app)).toEqual([]);
		expect(tellIssues([tell("tell-small-text", { value: 10 })], "home", app)).toHaveLength(1);

		// App 允许整屏一个上下文标签，两个起报。
		expect(tellIssues([tell("tell-micro-label")], "home", app)).toEqual([]);
		expect(tellIssues([tell("tell-micro-label"), tell("tell-micro-label")], "home", app)).toHaveLength(2);
		expect(tellIssues([tell("tell-micro-label")], "home", page)).toHaveLength(1);

		expect(tellIssues([tell("tell-mono")], "home", app)).toEqual([]);

		// 图片数只管落地页；App 屏幕可以完全没有图。
		expect(tellIssues([tell("tell-few-pictures", { value: 2 })], "home", page)).toHaveLength(1);
		expect(tellIssues([tell("tell-few-pictures", { value: 6 })], "home", page)).toEqual([]);
		expect(tellIssues([tell("tell-few-pictures", { value: 0 })], "home", app)).toEqual([]);
		expect(tellIssues([tell("tell-fake-media")], "home", app)).toHaveLength(1);
		expect(tellIssues([tell("tell-headline-lines")], "home", app)).toEqual([]);
	});

	it("被方向放行的规则不报", () => {
		expect(tellIssues([tell("tell-shadow", { value: 0.3 })], "home", { mode: "app", allow: ["tell-shadow"] })).toEqual([]);
	});

	it("App 屏幕上报表现手法时指出正路：写进方向的 devices 并给理由；落地页不提", () => {
		const [gradient] = tellIssues([tell("tell-gradient")], "home", app);
		expect(gradient.message).toMatch(/`gradient` in `devices`/);
		const [glass] = tellIssues([tell("tell-glass")], "home", app);
		expect(glass.message).toMatch(/`glass` in `devices`/);
		const [faces] = tellIssues([tell("tell-font-count", { value: 3 })], "home", app);
		expect(faces.message).toMatch(/`third-face` in `devices`/);
		expect(tellIssues([tell("tell-gradient")], "home", page)[0].message).not.toMatch(/devices/);
	});

	it("组件和公共外壳里的问题照报，指向组件文件；指向别的画框的丢掉", () => {
		const issues = tellIssues(
			[
				tell("tell-gradient", { source: "components/StatCard.tsx:8" }),
				tell("tell-gradient", { source: "frames/_layout.tsx:3" }),
				tell("tell-gradient", { source: "frames/other.tsx:3" }),
				tell("tell-gradient", { source: null }),
			],
			"home",
			page,
		);
		expect(issues.map((issue) => `${issue.file}:${issue.line}`)).toEqual([
			"components/StatCard.tsx:8",
			"frames/_layout.tsx:3",
			"frames/home.tsx:null",
		]);
	});

	it("两组探针结果互不越界", () => {
		const mixed = [tell("tell-gradient"), { rule: "icon-missing", source: "frames/home.tsx:4", detail: "icon-[x]", text: "" }];
		expect(tellIssues(mixed, "home", page).map((issue) => issue.rule)).toEqual(["tell-gradient"]);
		expect(layoutIssues(mixed, "home").map((issue) => issue.rule)).toEqual(["icon-missing"]);
		expect(tellIssues([tell("tell-invented-later")], "home", page)).toEqual([]);
	});

	it("探针在真 DOM 上跑得通并返回数组", () => {
		document.body.innerHTML =
			'<main data-vetd-source="frames/home.tsx:1"><h1>Hello 👋</h1><p style="font-family: monospace">x</p></main>';
		const result: unknown = eval(TELLS_PROBE_SCRIPT);
		expect(Array.isArray(result)).toBe(true);
	});
});

describe("方向决定放行哪些规则", () => {
	const LIB_DIR = join(__dirname, "../vendor/taste-skill/library");
	const read = (name: string): unknown => JSON.parse(readFileSync(join(LIB_DIR, `${name}.json`), "utf8"));
	const lib = adaptLibrary({
		directions: read("directions"),
		heroes: read("heroes"),
		sections: read("sections"),
		type: read("type"),
		palettes: read("palettes"),
	});
	const NOW = "2026-10-26T00:00:00.000Z";

	it("发过牌就按落地页或 App 报，不等选定；没发过牌的设计不报", () => {
		// 实测：模型拿到候选不选就开画，正是最需要拦的时候。
		const dealer = { lib, rnd: seededRandom(1), history: [] };
		const { record, options } = startDeal(dealer, pageInputFrom({ sector: "saas" }), 1, NOW);
		expect(tellsFor(null)).toBeNull();
		expect(tellsFor(record)).toEqual({ mode: "page", allow: [] });
		expect(tellsFor(choose(dealer, record, options[0].id, NOW))).toEqual({ mode: "page", allow: [] });
	});

	it("发了牌没选是整份设计的 issue，选定后消失", () => {
		const dealer = { lib, rnd: seededRandom(1), history: [] };
		const { record, options } = startDeal(dealer, pageInputFrom({ sector: "saas" }), 1, NOW);
		const [issue] = directionIssues(record);
		expect(issue).toMatchObject({ file: "direction.json", rule: "direction-not-chosen" });
		// 还有没问的题时，提示的是先问用户，而不是直接选。
		expect(issue.message).toMatch(/not been asked yet \(direction\)/);
		expect(directionIssues(choose(dealer, record, options[0].id, NOW))).toEqual([]);
		expect(directionIssues(null)).toEqual([]);
	});

	it("App 方向写明要用的手法才放行；保留品牌配色字体时表面规则归品牌", () => {
		const input = appInputFrom({});
		const { proposal } = chosenApp(input);
		const glassy = { ...proposal, devices: [{ device: "glass" as const, reason: "the player floats over album art" }] };
		const choice = { proposalId: glassy.id };
		expect(allowedTells({ input, choice, proposals: [glassy] })).toEqual(["tell-glass"]);
		expect(allowedTells({ input, choice, proposals: [proposal] })).toEqual([]);

		const kept = pageInputFrom({ sector: "saas", keep: ["palette", "type"] });
		const brandOwned = allowedTells({
			input: kept,
			choice: { directionId: "x", heroId: "x", typeId: null, paletteId: null, sections: [] },
		});
		expect(brandOwned).toEqual(expect.arrayContaining(["tell-gradient", "tell-shadow", "tell-mono"]));
		expect(brandOwned).not.toContain("tell-small-text");
	});
});

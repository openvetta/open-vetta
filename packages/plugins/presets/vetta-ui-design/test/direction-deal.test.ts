import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type DealHistoryEntry,
	type Dealer,
	dealPageOptions,
	imageryMode,
	type PageInput,
	seededRandom,
	sectionPool,
} from "../src/direction/deal";
import { adaptLibrary } from "../src/direction/library";
import {
	choose,
	DirectionError,
	pageInputFrom,
	parseDirectionRecord,
	redraw,
	serializeDirectionRecord,
	startDeal,
} from "../src/direction/record";

const LIB_DIR = join(__dirname, "../vendor/taste-skill/library");
const read = (name: string): unknown => JSON.parse(readFileSync(join(LIB_DIR, `${name}.json`), "utf8"));
const lib = adaptLibrary({
	directions: read("directions"),
	heroes: read("heroes"),
	sections: read("sections"),
	type: read("type"),
	palettes: read("palettes"),
});

const dealer = (seed: number, history: DealHistoryEntry[] = []): Dealer => ({ lib, rnd: seededRandom(seed), history });
const NOW = "2026-10-26T00:00:00.000Z";
const saas = (): PageInput => pageInputFrom({ sector: "saas", brief: "invoice tool for freelancers" });

describe("页面发牌", () => {
	it("同一种子发出同一副候选，不同种子不必相同", () => {
		const first = dealPageOptions(dealer(7), saas()).map((d) => d.id);
		expect(dealPageOptions(dealer(7), saas()).map((d) => d.id)).toEqual(first);
		expect(first).toHaveLength(3);
		expect(new Set(first).size).toBe(3);
	});

	it("避开最近发过的方向", () => {
		const recent = dealPageOptions(dealer(7), saas()).map((d) => d.id);
		const history: DealHistoryEntry[] = recent.map((direction) => ({ at: NOW, mode: "page", direction }));
		const next = dealPageOptions(dealer(7, history), saas()).map((d) => d.id);
		expect(next.some((id) => recent.includes(id))).toBe(false);
	});

	it("软件和实物商品避开靠照片撑的版式；其余行业用找来的真实图片", () => {
		const input = pageInputFrom({ sector: "saas" });
		expect(imageryMode(input)).toBe("interface");
		const dir = lib.directions.find((d) => d.sectors.includes("saas"));
		expect(dir).toBeDefined();
		const pool = sectionPool(dealer(1), dir!, "gallery", input);
		const honest = pool.filter(
			(s) =>
				!(s.tags.includes("photo-led") || s.tags.includes("object-led")) ||
				s.tags.some((t) => ["ui-led", "type-led", "colour-field"].includes(t)),
		);
		// 适配层只在至少还剩两个可选时才收窄，否则保留原池子。
		if (honest.length >= 2) expect(pool).toEqual(honest);
		expect(imageryMode(pageInputFrom({ sector: "restaurant", have: ["photography"] }))).toBe("own");
		expect(imageryMode(pageInputFrom({ sector: "restaurant" }))).toBe("found");
		expect(imageryMode(pageInputFrom({ sector: "ecommerce" }))).toBe("no-product-photo");
	});

	it("deal → choose 得到完整方向；keep 的那几格不发", () => {
		const { record, options } = startDeal(dealer(3), saas(), 3, NOW);
		expect(record.choice).toBeNull();
		const chosen = choose(dealer(3), record, options[1].id, NOW);
		expect(chosen.choice).toMatchObject({ directionId: options[1].id });
		const choice = chosen.choice as { typeId: string; paletteId: string; sections: { role: string }[] };
		expect(choice.typeId).toBeTruthy();
		expect(choice.paletteId).toBeTruthy();
		expect(choice.sections.map((s) => s.role)).toEqual(saas().sections);

		const kept = pageInputFrom({ sector: "saas", keep: ["palette", "type"] });
		const keptDeal = startDeal(dealer(3), kept, 3, NOW);
		const keptChoice = choose(dealer(3), keptDeal.record, keptDeal.options[0].id, NOW).choice;
		expect(keptChoice).toMatchObject({ typeId: null, paletteId: null });
	});

	it("只能选发出来的候选", () => {
		const { record } = startDeal(dealer(3), saas(), 3, NOW);
		const other = lib.directions.find((d) => !record.options.includes(d.id))!;
		expect(() => choose(dealer(3), record, other.id, NOW)).toThrow(DirectionError);
	});

	it("分区名接受常见别名，首屏不算分区", () => {
		const input = pageInputFrom({ sector: "restaurant", sections: ["hero", "menu", "Booking", "team"] });
		expect(input.sections).toEqual(["list", "contact", "about"]);
	});

	it("拒绝不认识的行业和素材", () => {
		expect(() => pageInputFrom({ sector: "bakery" })).toThrow(/sector/);
		expect(() => pageInputFrom({ sector: "saas", have: ["stock-photos"] })).toThrow(/have/);
	});
});

describe("重发", () => {
	const chosenPage = () => {
		const { record, options } = startDeal(dealer(5), saas(), 5, NOW);
		return choose(dealer(5), record, options[0].id, NOW);
	};

	it("没有理由不重发", () => {
		expect(() => redraw(dealer(6), chosenPage(), "type", "  ", NOW)).toThrow(/reason/);
	});

	it("换字体只换这一格，并记下理由", () => {
		const before = chosenPage();
		const after = redraw(dealer(6), before, "type", "the brand forbids serifs", NOW);
		expect(after.options).toBeNull();
		const was = before.choice as { typeId: string; paletteId: string; heroId: string };
		const now = after.record.choice as typeof was;
		expect(now.typeId).not.toBe(was.typeId);
		expect(now.paletteId).toBe(was.paletteId);
		expect(now.heroId).toBe(was.heroId);
		expect(after.record.redraws).toEqual([{ slot: "type", reason: "the brand forbids serifs", at: NOW }]);
	});

	it("换方向回到候选阶段，且不再发当前这个", () => {
		const before = chosenPage();
		const current = (before.choice as { directionId: string }).directionId;
		const after = redraw(dealer(6), before, "direction", "needs photographs the client does not have", NOW);
		expect(after.record.choice).toBeNull();
		expect(after.options?.map((o) => o.id)).not.toContain(current);
	});

	it("不认识的格子给出可选项", () => {
		expect(() => redraw(dealer(6), chosenPage(), "motion", "x", NOW)).toThrow(/direction, hero, type, palette/);
		expect(() => redraw(dealer(6), chosenPage(), "section:gallery", "x", NOW)).toThrow(/No gallery section/);
	});
});

describe("direction.json", () => {
	it("写出去再读回来不丢东西", () => {
		const { record, options } = startDeal(dealer(3), saas(), 3, NOW);
		const chosen = choose(dealer(3), record, options[0].id, NOW);
		expect(parseDirectionRecord(serializeDirectionRecord(chosen))).toEqual(chosen);
	});

	it("结构不对就当没有", () => {
		expect(parseDirectionRecord("not json")).toBeNull();
		expect(parseDirectionRecord(JSON.stringify({ version: 2 }))).toBeNull();
		expect(
			parseDirectionRecord(
				JSON.stringify({ version: 1, mode: "page", input: {}, options: [], seed: 1, choice: { styleId: "x" } }),
			),
		).toBeNull();
	});
});

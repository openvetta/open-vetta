/**
 * vendor 里的上游数据与适配层之间的约定。
 *
 * 上游更新靠整份覆盖拷贝（vendor/taste-skill/UPSTREAM.md），所以适配层对数据的每个
 * 假设都要在这里守住：新字体没人核对过、某个方向发不出任何字体——
 * 这些都不会在构建时报错，只会在 agent 发方向时悄悄发出一张坏表。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSections, PAGE_SECTORS } from "../src/direction/deal";
import { FONTSOURCE_FACES, UNAVAILABLE_FAMILIES } from "../src/direction/fontsource";
import { adaptLibrary, loadTasteLibrary, type RawLibrary } from "../src/direction/library";

const LIB_DIR = join(__dirname, "../vendor/taste-skill/library");
const read = (name: string): unknown => JSON.parse(readFileSync(join(LIB_DIR, `${name}.json`), "utf8"));
const raw: RawLibrary = {
	directions: read("directions"),
	heroes: read("heroes"),
	sections: read("sections"),
	type: read("type"),
	palettes: read("palettes"),
};
const lib = adaptLibrary(raw);

interface RawType {
	id: string;
	display: { family: string };
	text: { family: string };
}

describe("vendor 研究库的适配", () => {
	it("上游用到的每个字体家族都核对过 fontsource（可装或已知不可装）", () => {
		const families = new Set<string>();
		for (const entry of raw.type as RawType[]) families.add(entry.display.family).add(entry.text.family);
		const unchecked = [...families].filter(
			(family) => !(family in FONTSOURCE_FACES) && !UNAVAILABLE_FAMILIES.includes(family),
		);
		expect(unchecked, "新字体：去 npm 查 @fontsource(-variable)/<slug>，再归入两张表之一").toEqual([]);
	});

	it("只发两张面都装得上的字体组合，剔除的正是用到 Fontshare 字体的那些", () => {
		const unavailable = (raw.type as RawType[]).filter(
			(entry) =>
				UNAVAILABLE_FAMILIES.includes(entry.display.family) || UNAVAILABLE_FAMILIES.includes(entry.text.family),
		);
		expect(lib.droppedType.sort()).toEqual(unavailable.map((entry) => entry.id).sort());
		for (const type of lib.type) {
			expect(FONTSOURCE_FACES[type.display.family]).toBeDefined();
			expect(FONTSOURCE_FACES[type.text.family]).toBeDefined();
		}
		expect(lib.type.length).toBeGreaterThanOrEqual(20);
	});

	it("上游的 App 风格库不再随插件打包：App 方向由 agent 自拟", () => {
		expect(() => read("app")).toThrow();
	});

	it("没有一条上游数据因为缺字段被丢掉", () => {
		expect(lib.directions).toHaveLength((raw.directions as unknown[]).length);
		expect(lib.heroes).toHaveLength((raw.heroes as unknown[]).length);
		expect(lib.sections).toHaveLength((raw.sections as unknown[]).length);
		expect(lib.palettes).toHaveLength((raw.palettes as unknown[]).length);
	});

	it("每个行业的默认分区都有版式可发", () => {
		const roles = new Set(lib.sections.map((section) => section.role));
		for (const sector of PAGE_SECTORS) {
			for (const role of defaultSections(sector)) expect(roles.has(role), `${sector}: ${role}`).toBe(true);
		}
	});

	it("懒加载与直接适配得到同一份库", async () => {
		const loaded = await loadTasteLibrary();
		expect(loaded.directions.map((d) => d.id)).toEqual(lib.directions.map((d) => d.id));
		expect(loaded.type.map((t) => t.id)).toEqual(lib.type.map((t) => t.id));
	});
});

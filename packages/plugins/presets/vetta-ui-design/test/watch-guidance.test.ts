/**
 * Apple Watch 的引导：品类、提案说明、skill 规则三处要对得上。
 * 规则里的数字（字号表、12pt 下限、按钮个数）取自 Apple HIG，写错了 agent 会照着画。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { directionModeFor } from "../src/direction/deal-service";
import { proposeNote } from "../src/direction/proposal";
import { PRODUCT_SIZES, PRODUCT_TYPES } from "../src/vetd/product-size";
import { presetPixels } from "../src/vetd/size-presets";

const SKILL_DIR = join(__dirname, "../agent/skills/vetta-ui-design");
const read = (path: string): string => readFileSync(join(SKILL_DIR, path), "utf8");

describe("watch product", () => {
	it("默认尺寸取画布预设里的 46mm，且是合法品类", () => {
		expect(PRODUCT_TYPES).toContain("watch");
		expect(PRODUCT_SIZES.watch).toEqual(presetPixels("watch-46"));
		expect(PRODUCT_SIZES.watch).toEqual({ width: 208, height: 248 });
	});

	it("手表走 App 方向提案，落地页和幻灯片不走", () => {
		expect(directionModeFor("watch")).toBe("app");
		expect(directionModeFor("mobile")).toBe("app");
		expect(directionModeFor("slide")).toBeNull();
	});
});

describe("提案说明", () => {
	it("手表那份：纯黑底、明暗轴不可用、不选衬线", () => {
		const note = proposeNote(undefined, "watch");
		expect(note).toContain("#000000");
		expect(note).toMatch(/light\/dark axis is not available/);
		expect(note).toMatch(/Do not pick a serif/);
		expect(note).toContain("references/taste/app/watch.md");
	});

	it("手机和桌面的说明不受影响", () => {
		for (const product of ["mobile", "desktop", undefined]) {
			expect(proposeNote(undefined, product)).not.toContain("Apple Watch");
		}
	});
});

describe("watch.md", () => {
	const watch = read("references/taste/app/watch.md");

	it("被 SKILL.md 的品类表和 app-screens.md 点名，文件存在", () => {
		expect(existsSync(join(SKILL_DIR, "references/taste/app/watch.md"))).toBe(true);
		expect(read("SKILL.md")).toContain("references/taste/app/watch.md");
		expect(read("references/taste/app-screens.md")).toContain("watch");
	});

	it("写明用户要求的三条：纯黑底、不用衬线、watchOS 26 的返回 + 标题 + 时间", () => {
		expect(watch).toContain("`#000000`");
		expect(watch).toMatch(/no serif/i);
		expect(watch).toMatch(/round back button at top-left/);
		expect(watch).toMatch(/time/);
	});

	it("字号表是 Apple 的默认（Large）档", () => {
		for (const row of ["Large Title 36", "Title 1 34", "Title 2 28", "Title 3 19", "Footnote 2 12"]) {
			expect(watch).toContain(row);
		}
		expect(watch).toMatch(/nothing goes under 12/);
		expect(watch).toMatch(/Never Light, Thin or Ultralight/);
	});

	it("提醒 backdrop-filter 在大圆角画框里是关着的，别靠它做玻璃", () => {
		expect(watch).toMatch(/backdrop-filter/);
		expect(watch).toMatch(/translucent fill/);
	});
});

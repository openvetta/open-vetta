/**
 * 尺寸数据同源：画布的预设面板、agent 的 vetd_sizes、vetd_create 的品类表、SKILL.md 里
 * 抄出来的数字，必须是同一份。以后只改了其中一处，这里就红。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PRODUCT_SIZES } from "../src/vetd/product-size";
import { findPreset, presetPixels, SIZE_CATEGORIES, searchSizePresets } from "../src/vetd/size-presets";

const SKILL = readFileSync(join(__dirname, "../agent/skills/vetta-ui-design/SKILL.md"), "utf8");

it("every product default in SKILL.md matches PRODUCT_SIZES", () => {
	for (const [product, size] of Object.entries(PRODUCT_SIZES)) {
		const row = SKILL.split("\n").find((line) => line.includes(`\`${product}\``) && line.startsWith("|"));
		expect(row, `SKILL.md has a table row for ${product}`).toBeDefined();
		expect(row).toContain(`${size.width}x${size.height}`);
	}
});

it("the A4 row in SKILL.md matches the A4 preset", () => {
	const a4 = presetPixels("a4");
	const row = SKILL.split("\n").find((line) => line.startsWith("|") && line.includes("A4"));
	expect(row).toContain(`${a4.width}x${a4.height}`);
});

it("product defaults that correspond to a device come straight from the preset table", () => {
	expect(PRODUCT_SIZES.mobile).toEqual(presetPixels("iphone-14"));
	expect(PRODUCT_SIZES.desktop).toEqual(presetPixels("desktop-hd"));
	expect(PRODUCT_SIZES.slide).toEqual(presetPixels("desktop-1080p"));
});

it("vetd_sizes lookups return exactly what the canvas panel shows", () => {
	// 面板里的每个预设，agent 都查得到，数值逐项相同。
	for (const category of SIZE_CATEGORIES) {
		for (const preset of category.presets) {
			const [hit] = searchSizePresets(preset.name, category.id);
			expect(hit, preset.name).toMatchObject({
				id: preset.id,
				width: preset.width,
				height: preset.height,
				radius: preset.radius ?? 0,
			});
		}
	}
	expect(findPreset("iphone-17")?.preset.radius).toBe(62);
});

it("searches by keywords, puts the exact name first, and understands Chinese category words", () => {
	const phones = searchSizePresets("iphone 17");
	expect(phones[0]).toMatchObject({ id: "iphone-17", width: 393, height: 852, radius: 62 });
	expect(phones.map((entry) => entry.id)).toContain("iphone-17-pro-max");

	expect(searchSizePresets("ipad pro 13")[0]).toMatchObject({
		id: "ipad-pro-13",
		radius: 18,
		landscape: { width: 1376, height: 1032 },
	});
	expect(searchSizePresets("watch 46")[0]).toMatchObject({ id: "watch-46", radiusEstimated: true });
	expect(searchSizePresets("A4")[0]).toMatchObject({ id: "a4", radius: 0 });
	expect(searchSizePresets("手表").map((entry) => entry.category)).toEqual(["watch", "watch"]);
	expect(searchSizePresets("nokia 3310")).toEqual([]);
	expect(searchSizePresets(undefined, "paper")).toHaveLength(3);
});

it("keeps vetd_sizes available before any design exists", async () => {
	// 「新建一个 iPhone 17 的设计」发生在设计存在之前：这个只读查表工具不能被设计语境的闸门关掉。
	const { DESIGN_ONLY_TOOLS } = await import("../src/vetd/tool-gate");
	expect(DESIGN_ONLY_TOOLS as readonly string[]).not.toContain("vetd_sizes");
});

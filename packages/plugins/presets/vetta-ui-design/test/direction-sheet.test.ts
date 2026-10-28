/**
 * 方向表是 agent 照抄的东西：token 名、字体 import 和安装包必须彼此对得上，也不能带出
 * frame 里会坏掉的写法（远程字体、远程图片、按视口缩放的字号）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type PageChoice, seededRandom } from "../src/direction/deal";
import { fontImports } from "../src/direction/fontsource";
import { adaptLibrary } from "../src/direction/library";
import { appInputFrom, choose, pageInputFrom, startDeal } from "../src/direction/record";
import { chosenApp, OBVIOUS } from "./proposal-fixture";
import { readableOn, renderAppSheet, renderPageSheet, resolveClamp } from "../src/direction/sheet";

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
const desktop = { frameWidth: 1440, seed: 1, redraws: [] };

/** 方向表进上下文的上限。上游原表约 26KB；这里砍掉了 frame 用不上的段落。 */
const PAGE_SHEET_BUDGET = 20_000;
const APP_SHEET_BUDGET = 12_000;
/** 最后一节附带的参考部件另算：它们是 references/ 的内容随表送出，不是表自己的篇幅。 */
const APP_REFERENCE_BUDGET = 7_000;

const importedPackages = (text: string) =>
	[...text.matchAll(/@import "(@fontsource(?:-variable)?\/[^/"]+)/g)].map((m) => m[1]);

describe("字体", () => {
	it("可变包一行覆盖字重，要用的轴换成轴文件；静态包逐个字重 import", () => {
		expect(fontImports("Geist", [400, 700], false)).toEqual(['@import "@fontsource-variable/geist";']);
		expect(fontImports("Archivo", [800], false, "wdth")).toEqual(['@import "@fontsource-variable/archivo/wdth.css";']);
		expect(fontImports("Newsreader", [300], true, "opsz")).toEqual([
			'@import "@fontsource-variable/newsreader/opsz.css";',
			'@import "@fontsource-variable/newsreader/opsz-italic.css";',
		]);
		expect(fontImports("Anton", [400], false)).toEqual(['@import "@fontsource/anton/400.css";']);
		expect(fontImports("Zilla Slab", [500, 400], true)).toEqual([
			'@import "@fontsource/zilla-slab/400.css";',
			'@import "@fontsource/zilla-slab/400-italic.css";',
			'@import "@fontsource/zilla-slab/500.css";',
			'@import "@fontsource/zilla-slab/500-italic.css";',
		]);
		// 没有的轴就退回默认文件，而不是 import 一个不存在的路径把整张画布的样式弄坏。
		expect(fontImports("Geist", [400], false, "wdth")).toEqual(['@import "@fontsource-variable/geist";']);
		expect(fontImports("Switzer", [400], false)).toEqual([]);
	});

	it("clamp 字号按画框宽度算成像素", () => {
		expect(resolveClamp("clamp(2rem, 1.3rem + 3.2vw, 4rem)", 1440)).toBe("64px");
		expect(resolveClamp("clamp(2rem, 1.3rem + 3.2vw, 4rem)", 390)).toBe("33px");
		expect(resolveClamp("clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem)", 1440)).toBe("14px");
		expect(resolveClamp("1.25rem", 1440)).toBe("20px");
		expect(resolveClamp("min(10vw, 4rem)", 1440)).toBe("min(10vw, 4rem)");
	});

	it("主色上的字取对比度高的那个", () => {
		expect(readableOn("#141414")).toBe("#ffffff");
		expect(readableOn("#f5e663")).toBe("#0a0a0a");
	});
});

describe("页面方向表", () => {
	it("每个方向的表都能照抄：安装的包就是 import 的包，没有远程资源，篇幅在预算内", () => {
		for (const dir of lib.directions) {
			const input = pageInputFrom({ sector: dir.sectors.find((s) => s !== "*") ?? "other" });
			const rnd = seededRandom(11);
			const { record } = startDeal({ lib, rnd, history: [] }, input, 11, NOW);
			const chosen = choose({ lib, rnd, history: [] }, { ...record, options: [dir.id] }, dir.id, NOW);
			const sheet = renderPageSheet(lib, input, chosen.choice as PageChoice, desktop);
			expect(sheet.text.length, dir.id).toBeLessThan(PAGE_SHEET_BUDGET);
			expect(new Set(importedPackages(sheet.text)), dir.id).toEqual(new Set(sheet.packages));
			expect(sheet.text, dir.id).not.toMatch(/https?:\/\/|picsum|fonts\.googleapis|fontshare/);
			expect(sheet.text, dir.id).toMatch(/--color-surface: #[0-9a-f]{6};/i);
			expect(sheet.text, dir.id).toMatch(/--font-display: "[^"]+ ?(Variable)?",/);
		}
	});

	it("保留品牌配色与字体时，只给构图", () => {
		const input = pageInputFrom({ sector: "saas", keep: ["palette", "type"] });
		const dealt = startDeal({ lib, rnd: seededRandom(2), history: [] }, input, 2, NOW);
		const chosen = choose({ lib, rnd: seededRandom(2), history: [] }, dealt.record, dealt.options[0].id, NOW);
		const sheet = renderPageSheet(lib, input, chosen.choice as PageChoice, desktop);
		expect(sheet.packages).toEqual([]);
		// 不发任何颜色、字体 token，但要交代品牌色怎么分配，否则品牌色会铺满全屏。
		expect(sheet.text).not.toMatch(/^\t--(?:color|font)-/m);
		expect(sheet.text).toContain("Kept from the brand: type and colour.");
		expect(sheet.text).toMatch(/its hue becomes `--color-primary` and goes on the one primary action/);
	});

	it("手机画框给手机版式，并按手机宽度换算 vw", () => {
		const input = pageInputFrom({ sector: "restaurant" });
		const dealt = startDeal({ lib, rnd: seededRandom(4), history: [] }, input, 4, NOW);
		const choice = choose({ lib, rnd: seededRandom(4), history: [] }, dealt.record, dealt.options[0].id, NOW)
			.choice as PageChoice;
		const hero = lib.heroes.find((h) => h.id === choice.heroId)!;
		const phone = renderPageSheet(lib, input, choice, { ...desktop, frameWidth: 390 });
		expect(phone.text).toContain(hero.mobile);
		expect(phone.text).not.toContain(hero.blueprint);
		expect(phone.text).toContain("1vw = 3.9px");
		expect(phone.text).toContain("One screen is 844px tall");
	});

	it("库更新后找不到的方向，提示重新发牌而不是渲染半张表", () => {
		const input = pageInputFrom({ sector: "saas" });
		const sheet = renderPageSheet(
			lib,
			input,
			{ directionId: "gone", heroId: "x", typeId: null, paletteId: null, sections: [] },
			desktop,
		);
		expect(sheet.text).toMatch(/no longer in the library/);
	});
});

describe("App 方向表", () => {
	const input = appInputFrom({ brief: "coffee ordering app" });
	const sheetOf = (id: string, frameWidth = 1440, keep: ("palette" | "type")[] = []) => {
		const kept = appInputFrom({ brief: "coffee ordering app", keep });
		const { record, proposal } = chosenApp(kept, id);
		return renderAppSheet(kept, proposal, record.obvious ?? "", { ...desktop, frameWidth });
	};

	it("每一案的表都沿用脚手架 token 名、装的包就是 import 的包，篇幅在预算内", () => {
		for (const id of ["roast-ledger", "night-counter", "tamper-green"]) {
			const sheet = sheetOf(id);
			const [body, references = ""] = sheet.text.split("\n## 7. Reference for these screens");
			expect(body.length, id).toBeLessThan(APP_SHEET_BUDGET);
			expect(references.length, id).toBeLessThan(APP_REFERENCE_BUDGET);
			expect(new Set(importedPackages(sheet.text)), id).toEqual(new Set(sheet.packages));
			for (const token of ["surface", "surface-foreground", "panel", "muted", "primary", "primary-foreground"]) {
				expect(sheet.text, `${id}: ${token}`).toContain(`--color-${token}: `);
			}
			expect(sheet.text, id).toMatch(/--font-display: "[^"]+",/);
			expect(sheet.text, id).not.toMatch(/https?:\/\/|fonts\.googleapis/);
		}
	});

	it("表里写着这一案的想法、要避开的平庸版本和截图后的竞品自查", () => {
		const { text } = sheetOf("roast-ledger");
		expect(text).toContain("On these screens, the roast date printed on every bag becomes the ordering spine of the menu.");
		expect(text).toContain(`**The obvious version (do not drift back to it):** ${OBVIOUS}`);
		expect(text).toMatch(/swap the logo for the nearest competitor/);
		expect(text).toMatch(/No expressive devices/);
	});

	it("大胆度写进设备一节：有个性放行手法，大胆再点出那一处出格和外壳", () => {
		const input = appInputFrom({ brief: "coffee ordering app" });
		const { record, proposal } = chosenApp(input, "roast-ledger");
		const plain = renderAppSheet(input, proposal, "", desktop).text;
		expect(plain).toContain("No expressive devices");
		const lively = renderAppSheet(input, proposal, "", {
			...desktop,
			intent: { stated: { boldness: "expressive" }, questions: [], answers: null },
		}).text;
		expect(lively).toContain("pass the screenshot check without a stated reason");
		expect(lively).not.toContain("No expressive devices");
		const daring = renderAppSheet(input, { ...proposal, shell: "rail", breaks: "A full-bleed roast-colour field behind the bag." }, "", {
			...desktop,
			intent: { stated: { boldness: "bold" }, questions: [], answers: null },
		}).text;
		expect(daring).toContain("The deliberate break");
		expect(daring).toContain("**Shell:** rail.");
		expect(record.proposals).toBeDefined();
	});

	it("只有 400 一个字重的静态字体只 import 400", () => {
		const { record } = chosenApp(input, "roast-ledger");
		const proposal = { ...record.proposals![0], type: { display: "DM Serif Display", text: "Figtree", class: "serif-display" as const } };
		const sheet = renderAppSheet(input, proposal, "", desktop);
		expect(sheet.text).toContain('@import "@fontsource/dm-serif-display/400.css";');
		expect(sheet.text).not.toContain("dm-serif-display/700.css");
	});

	it("保留品牌配色字体时不出颜色字体 token，只交代品牌色怎么分配", () => {
		const sheet = sheetOf("roast-ledger", 1440, ["palette", "type"]);
		expect(sheet.packages).toEqual([]);
		expect(sheet.text).not.toMatch(/^\t--(?:color|font)-/m);
		expect(sheet.text).toMatch(/its hue becomes `--color-primary`/);
	});

	it("手机宽度带手机部件，桌面带外壳", () => {
		const [, phone] = sheetOf("night-counter", 390).text.split("\n## 7. Reference for these screens");
		expect(phone).toContain("### The phone");
		expect(phone).toContain("### Phone navigation");
		expect(phone).not.toContain("### Shell");
		const [, wide] = sheetOf("night-counter", 1440).text.split("\n## 7. Reference for these screens");
		expect(wide).toContain("### Shell");
		expect(wide).not.toContain("### Phone navigation");
	});
});

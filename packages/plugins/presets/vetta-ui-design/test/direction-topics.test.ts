/**
 * App 屏幕的参考部件由方向表按屏幕送出。这里守三件事：版式库里每个版式都登记了部件
 * （上游新增版式时在这里失败，而不是让那张屏幕悄悄拿不到）、部件文件都在、
 * 方向表真的把用得上的几段带出去且不带多余的。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/direction/deal";
import { adaptLibrary } from "../src/direction/library";
import { appInputFrom, choose, startDeal } from "../src/direction/record";
import { renderAppSheet } from "../src/direction/sheet";
import { APP_TOPICS, PATTERN_TOPICS, renderTopic, screenTopics, sheetTopics } from "../src/direction/topics";

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

describe("参考部件的登记", () => {
	it("版式库里的每个版式都登记了部件，登记表里也没有已经不存在的版式", () => {
		const ids = lib.app.patterns.map((pattern) => pattern.id).sort();
		expect(Object.keys(PATTERN_TOPICS).sort()).toEqual(ids);
	});

	it("登记的部件都有正文，且以二级标题开头（送出时降一级）", () => {
		for (const [topic, text] of Object.entries(APP_TOPICS)) {
			expect(text.startsWith("## "), topic).toBe(true);
			expect(text.length, topic).toBeGreaterThan(300);
		}
		for (const [id, topics] of Object.entries(PATTERN_TOPICS)) {
			expect(topics.length, id).toBeGreaterThan(0);
			for (const topic of topics) expect(topic in APP_TOPICS, `${id} → ${topic}`).toBe(true);
		}
	});

	it("核心文件点名的部件和 app/ 目录里的文件一一对应", () => {
		const core = readFileSync(join(__dirname, "../agent/skills/vetta-ui-design/references/taste/app-screens.md"), "utf8");
		for (const topic of Object.keys(APP_TOPICS)) expect(core, topic).toContain(`\`${topic}\``);
	});
});

describe("按屏幕选部件", () => {
	it("没有版式的屏幕得到全部内容部件", () => {
		expect(screenTopics(null)).toEqual(["kpis", "charts", "tables", "forms"]);
	});

	it("整张表去重，并按阅读顺序排：桌面带外壳，手机带手机，保留品牌风格才带数值", () => {
		const ids = ["bar-list-ranking", "table-filter-bar", "settings-two-column"];
		expect(sheetTopics(ids, { phone: false, keepsStyle: false })).toEqual(["shell", "charts", "tables", "forms"]);
		expect(sheetTopics(ids, { phone: true, keepsStyle: false })).toEqual(["charts", "tables", "forms", "phone"]);
		expect(sheetTopics(ids, { phone: false, keepsStyle: true })).toContain("values");
	});

	it("话题正文送出时标题降一级", () => {
		expect(renderTopic("charts").startsWith("### Charts")).toBe(true);
	});
});

describe("方向表里的参考附录", () => {
	const kind = "analytics";
	const render = (frameWidth: number, keep: ("palette" | "type")[] = []) => {
		const input = appInputFrom({ kind, keep }, lib);
		const rnd = seededRandom(3);
		const { record } = startDeal({ lib, rnd, history: [] }, "app", input, 3, NOW);
		const styleId = record.options[0];
		const chosen = choose({ lib, rnd, history: [] }, { ...record, options: [styleId] }, styleId, NOW, { emphasis: "pictures" });
		const ctx = { seed: 3, redraws: [], frameWidth } as never;
		return renderAppSheet(lib, input, chosen.choice as never, ctx).text;
	};

	it("附录只带这些屏幕用得上的部件，每个屏幕标明自己要哪几段", () => {
		const text = render(1440);
		const [, appendix] = text.split("\n## 6. Reference for these screens");
		expect(appendix).toContain("### Shell");
		expect(appendix).not.toContain("### The phone");
		expect(text).toMatch(/Reference parts for this screen \(section 6\): [a-z, ]+\./);
	});

	it("手机宽度带手机部件而不带桌面外壳", () => {
		const [, appendix] = render(390).split("\n## 6. Reference for these screens");
		expect(appendix).toContain("### The phone");
		expect(appendix).not.toContain("### Shell");
	});
});

import { describe, expect, it } from "vitest";
import {
	parseReleaseNotes,
	releaseNoteTemplate,
	summarizeReleaseNotes,
	validateReleaseNotes,
} from "./release-notes-format.mjs";

const FOOTER = "**Full Changelog**: https://github.com/openvetta/open-vetta/compare/v0.6.13...v0.6.14";

/** 一份能通过门禁的双语说明；各用例只替换要测的那一段。 */
function note({ en = "- Plugins can now reuse the host's keycaps.", zh = "- 插件可以复用宿主的快捷键键帽。" } = {}) {
	return [
		"# Vetta 0.6.14",
		"<!-- release-status: unreleased -->",
		"",
		"## English",
		"",
		"### New",
		"",
		en,
		"",
		"## 中文",
		"",
		"### 新增",
		"",
		zh,
		"",
		FOOTER,
		"",
	].join("\n");
}

const validate = (text, options = {}) => validateReleaseNotes(text, { version: "0.6.14", previousTag: "v0.6.13", ...options });

describe("parseReleaseNotes", () => {
	it("按语言与小节拆分条目", () => {
		const parsed = parseReleaseNotes(note({ zh: "- 插件可以用宿主的键帽。\n- 设置页的快捷键更好读。" }));
		expect(parsed.version).toBe("0.6.14");
		expect(parsed.hasLanguageHeadings).toBe(true);
		expect(parsed.languages.en.total).toBe(1);
		expect(parsed.languages.zh.total).toBe(2);
		expect(parsed.languages.zh.sections.added).toHaveLength(2);
		expect(parsed.footerUrl).toBe("https://github.com/openvetta/open-vetta/compare/v0.6.13...v0.6.14");
	});

	// 旧文件是单语正文，解析结果为空即可——校验会明确要求改成双语结构。
	it("旧版单语说明不会被误认成双语", () => {
		const parsed = parseReleaseNotes("# Vetta 0.5.70\n<!-- release-status: released 2026-10-29 -->\n\n## 新增\n\n- 一条\n");
		expect(parsed.hasLanguageHeadings).toBe(false);
		expect(parsed.strayHeadings).toEqual([{ level: 2, heading: "新增", line: 4 }]);
	});
});

describe("validateReleaseNotes", () => {
	it("接受定稿好的双语说明", () => {
		expect(validate(note())).toEqual({ problems: [], warnings: [], stats: { en: 1, zh: 1 } });
	});

	it("要求中英两段都在", () => {
		const single = "# Vetta 0.6.14\n<!-- release-status: unreleased -->\n\n## 新增\n\n- 一条\n";
		expect(validate(single).problems.join()).toMatch(/## English.*## 中文/s);
	});

	it("要求两段条数一一对应", () => {
		expect(validate(note({ zh: "- 一条。\n- 两条。" })).problems.join()).toMatch(/中英条目数不一致：English 1 条 \/ 中文 2 条/);
		expect(validate(note({ en: "" })).problems.join()).toMatch(/中英两段都要有条目：English 0 条 \/ 中文 1 条/);
	});

	it("超过条数上限就要求合并成主题", () => {
		const zh = Array.from({ length: 7 }, (_, i) => `- 第 ${i + 1} 件小事。`).join("\n");
		const en = Array.from({ length: 7 }, (_, i) => `- Small change ${i + 1}.`).join("\n");
		expect(validate(note({ zh, en })).problems.join()).toMatch(/中文 有 7 条，超过 6 条上限/);
	});

	it("单条过长说明还没写完", () => {
		const zh = `- ${"很长的一句话。".repeat(20)}`;
		const en = `- ${"A very long sentence. ".repeat(20)}`;
		const problems = validate(note({ zh, en })).problems.join();
		expect(problems).toMatch(/超过 90 字上限/);
		expect(problems).toMatch(/超过 240 字上限/);
	});

	it("拦下用户读不懂的内部标识", () => {
		const problems = validate(
			note({
				zh: "- 重构了快捷键渲染，改了 `release-notes.mjs`，见 #123。",
				en: "- Rewrote the updater refactor path.",
			}),
		).problems.join("\n");
		expect(problems).toMatch(/文件名「`release-notes\.mjs`」/);
		expect(problems).toMatch(/issue \/ PR 编号「#123」/);
		expect(problems).toMatch(/内部术语「重构」/);
		expect(problems).toMatch(/内部术语「refactor」/);
	});

	it("要求文末 Full Changelog 指向上一版到本版", () => {
		const withoutFooter = note().replace(`${FOOTER}\n`, "");
		expect(validate(withoutFooter).problems.join()).toMatch(/缺一行 `\*\*Full Changelog\*\*/);

		const wrongStart = note().replace("compare/v0.6.13...v0.6.14", "compare/v0.6.12...v0.6.14");
		expect(validate(wrongStart).problems.join()).toMatch(/起点应是上一版 v0\.6\.13/);

		const wrongEnd = note().replace("v0.6.14", "v0.6.15");
		expect(validate(wrongEnd).problems.join()).toMatch(/终点应是 v0\.6\.14/);
	});

	it("拒绝未知小节，条目必须落在小节里", () => {
		const unknownSection = note().replace("### 新增", "### 变化");
		expect(validate(unknownSection).problems.join()).toMatch(/不是允许的小节/);

		const strayBullet = note().replace("### 新增\n\n- 插件可以复用宿主的快捷键键帽。", "- 插件可以复用宿主的快捷键键帽。");
		expect(validate(strayBullet).problems.join()).toMatch(/不在任何小节里/);
	});

	it("占位文字仍要拦，但正文里正常使用「占位」不算", () => {
		expect(validate(note({ zh: "- TODO 补一条。", en: "- TODO fill this in." })).problems.join()).toMatch(/占位文字/);
		expect(validate(note({ zh: "- 不是仓库的项目既不占位，也能手动打开面板。", en: "- Non-repository folders still open." })).problems).toEqual([]);
	});
});

describe("summarizeReleaseNotes", () => {
	it("给预检摘要用的一句话", () => {
		expect(summarizeReleaseNotes(note({ zh: "- 一。\n- 二。" }))).toBe("中文 2 条（新增 2）/ English 1 条");
	});
});

describe("releaseNoteTemplate", () => {
	// 骨架只负责结构和 Footer：条目空着，定稿门禁会拦住直接发版。
	it("生成的结构能解析，但没条目时过不了门禁", () => {
		const text = releaseNoteTemplate({ version: "0.6.14", previousVersion: "0.6.13" });
		expect(parseReleaseNotes(text).hasLanguageHeadings).toBe(true);
		expect(validateReleaseNotes(text, { version: "0.6.14", previousTag: "v0.6.13" }).problems.join()).toMatch(/没有任何条目/);
	});
});

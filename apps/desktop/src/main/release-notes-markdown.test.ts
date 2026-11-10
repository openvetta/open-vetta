import { describe, expect, it } from "vitest";
import { releaseNotesHtmlToMarkdown } from "./release-notes-markdown";

describe("releaseNotesHtmlToMarkdown", () => {
	it("keeps markdown untouched", () => {
		const md = "## 新增\n\n- 一条\n- 两条";
		expect(releaseNotesHtmlToMarkdown(md)).toBe(md);
	});

	it("restores headings, lists and inline styles from GitHub HTML", () => {
		const html =
			'<h1>Vetta 0.5.73</h1>\n<h2>新增</h2>\n<ul>\n<li>设置 → 外观新增<code>界面大小</code>，&quot;六档&quot;</li>\n<li>见 <a href="https://x.y/z">链接</a> 与 <strong>加粗</strong></li>\n</ul>\n<h2>修复</h2>\n<ul>\n<li>修了一个 bug</li>\n</ul>';
		expect(releaseNotesHtmlToMarkdown(html)).toBe(
			[
				"# Vetta 0.5.73",
				"",
				"## 新增",
				"",
				'- 设置 → 外观新增`界面大小`，"六档"',
				"- 见 [链接](https://x.y/z) 与 **加粗**",
				"",
				"## 修复",
				"",
				"- 修了一个 bug",
			].join("\n"),
		);
	});
});

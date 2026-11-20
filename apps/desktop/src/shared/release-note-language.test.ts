import { describe, expect, it } from "vitest";
import { selectReleaseNoteLanguage } from "./release-note-language";

const BILINGUAL = [
	"# Vetta 0.6.14",
	"<!-- release-status: unreleased -->",
	"",
	"## English",
	"",
	"### New",
	"",
	"- Plugins can reuse the host's keycaps.",
	"",
	"## 中文",
	"",
	"### 新增",
	"",
	"- 插件可以复用宿主的快捷键键帽。",
	"",
	"**Full Changelog**: https://github.com/openvetta/open-vetta/compare/v0.6.13...v0.6.14",
	"",
].join("\n");

describe("selectReleaseNoteLanguage", () => {
	it("按界面语言只留一段，标题与 Full Changelog 不进正文", () => {
		expect(selectReleaseNoteLanguage(BILINGUAL, "zh")).toBe("### 新增\n\n- 插件可以复用宿主的快捷键键帽。");
		expect(selectReleaseNoteLanguage(BILINGUAL, "en")).toBe("### New\n\n- Plugins can reuse the host's keycaps.");
	});

	it("兼容 CRLF", () => {
		expect(selectReleaseNoteLanguage(BILINGUAL.replace(/\n/g, "\r\n"), "zh")).toBe(
			"### 新增\n\n- 插件可以复用宿主的快捷键键帽。",
		);
	});

	// 0.6.13 之前的说明是单语正文，应用内照旧整段显示。
	it("没有语言分段时原样返回", () => {
		const legacy = "# Vetta 0.5.70\n<!-- release-status: released 2026-10-29 -->\n\n## 新增\n\n- 一条\n";
		expect(selectReleaseNoteLanguage(legacy, "zh")).toBe(legacy);
		expect(selectReleaseNoteLanguage(legacy, "en")).toBe(legacy);
	});

	it("缺译时回落到另一段，而不是显示空白", () => {
		const englishOnly = "## English\n\n### New\n\n- Only English here.\n";
		expect(selectReleaseNoteLanguage(englishOnly, "zh")).toBe("### New\n\n- Only English here.");
	});
});

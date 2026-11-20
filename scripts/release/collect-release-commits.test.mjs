import { describe, expect, it } from "vitest";
import { areaOf, formatDigest, parseCommitLog, summarizeAreas } from "./collect-release-commits.mjs";

const FIELD = "\u001f";
const RECORD = "\u001e";

describe("parseCommitLog", () => {
	it("拆出短 hash、标题与正文动机", () => {
		const output = [
			`8b97e3033${FIELD}chore(release): 推进插件版本${FIELD}正文第一行\n\n正文第二段${RECORD}`,
			`101a003d1${FIELD}feat(desktop): 气泡颜色改用色点选择器${FIELD}${RECORD}`,
		].join("\n");
		expect(parseCommitLog(output)).toEqual([
			{ sha: "8b97e3033", subject: "chore(release): 推进插件版本", why: "正文第一行" },
			{ sha: "101a003d1", subject: "feat(desktop): 气泡颜色改用色点选择器", why: null },
		]);
	});
});

describe("areas", () => {
	it("把文件归到用户能认出来的区域", () => {
		expect(areaOf("apps/desktop/src/main/updater.ts")).toBe("apps/desktop");
		expect(areaOf("packages/plugins/presets/open-in-app/plugin.json")).toBe("packages/plugins/presets/open-in-app");
		expect(areaOf("docs/release/desktop-release-runbook.md")).toBe("docs");
		expect(areaOf("README.md")).toBe("README.md");
	});

	it("按文件数排序，让「主要动了哪块」一眼可见", () => {
		expect(summarizeAreas(["apps/desktop/a.ts", "apps/desktop/b.ts", "packages/ui/c.ts"])).toEqual([
			{ area: "apps/desktop", files: 2 },
			{ area: "packages/ui", files: 1 },
		]);
	});
});

describe("formatDigest", () => {
	const digest = {
		from: "v0.6.12",
		to: "HEAD",
		fileCount: 3,
		commits: [
			{ sha: "101a003d1", subject: "feat(desktop): 气泡颜色改用色点选择器 (#42)", why: "下拉列表看不出当前颜色" },
			{ sha: "3b6827f49", subject: "feat(ui): 新增 ColorSwatchPicker", why: null },
		],
		areas: [
			{ area: "apps/desktop", files: 2 },
			{ area: "packages/ui", files: 1 },
		],
	};

	it("说明这是原料而不是正文，并列出提交与动机", () => {
		const text = formatDigest(digest);
		expect(text).toContain("# 发版素材：v0.6.12 → HEAD");
		expect(text).toContain("这是起草发布说明的原料，不是正文");
		expect(text).toContain("apps/desktop（2 个文件）、packages/ui（1 个文件）");
		expect(text).toContain("- 101a003d1 feat(desktop): 气泡颜色改用色点选择器 (#42)");
		expect(text).toContain("gh pr view <编号>");
		expect(text).toContain("动机：下拉列表看不出当前颜色");
	});

	it("没有提交时也给出明确的空结果", () => {
		expect(formatDigest({ ...digest, commits: [], areas: [], fileCount: 0 })).toContain("这个区间没有提交");
	});
});

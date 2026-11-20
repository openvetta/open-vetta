import { describe, expect, it } from "vitest";
import { summarizeReleaseNotes } from "./release-notes-format.mjs";
import { evaluatePreflight } from "./release-preflight.mjs";

const NOTES = [
	"# Vetta 0.5.70",
	"<!-- release-status: unreleased -->",
	"",
	"## English",
	"",
	"### New",
	"",
	"- First thing.",
	"- Second thing.",
	"",
	"### Fixes",
	"",
	"- Third thing.",
	"",
	"## 中文",
	"",
	"### 新增",
	"",
	"- 第一件事。",
	"- 第二件事。",
	"",
	"### 修复",
	"",
	"- 第三件事。",
	"",
	"**Full Changelog**: https://github.com/openvetta/open-vetta/compare/v0.5.69...v0.5.70",
	"",
].join("\n");

/** 换版本号时标题与 Full Changelog 要一起换，否则会顺带触发格式校验。 */
const notesFor = (version, previous) => NOTES.replaceAll("0.5.70", version).replaceAll("0.5.69", previous);

/** 一份能通过的事实，各用例只改要测的那一项。 */
const facts = (overrides = {}) => ({
	tag: "v0.5.70",
	packageVersion: "0.5.70",
	lockVersion: "0.5.70",
	notes: NOTES,
	localTagExists: false,
	remoteTagExists: false,
	githubReleaseExists: false,
	latestReleased: "0.5.69",
	allowIrregular: false,
	branch: "main",
	devMerged: true,
	treeDiffersFromDev: "",
	dirty: "",
	head: "abc1234 chore(release): 合并 dev 发布 v0.5.70",
	commitCount: 12,
	pluginChanges: ["vetta-ui-design 0.7.6 → 0.7.8"],
	...overrides,
});

describe("release preflight", () => {
	it("passes a consistent release and prints the confirmation summary", () => {
		const { problems, warnings, summary } = evaluatePreflight(facts());
		expect(problems).toEqual([]);
		expect(warnings).toEqual([]);
		expect(summary.join("\n")).toContain("将发布 v0.5.70（修订号升级，上一个版本 v0.5.69）");
		expect(summary.join("\n")).toContain("中文 3 条（新增 2 / 修复 1）/ English 3 条");
		expect(summary.join("\n")).toContain("vetta-ui-design 0.7.6 → 0.7.8");
	});

	// desktop-release 对版本号不符的 tag 只会静默跳过，这一项必须在推 tag 前拦住。
	it("blocks a tag that does not match the package, lockfile or notes", () => {
		const { problems } = evaluatePreflight(
			facts({ packageVersion: "0.5.69", lockVersion: "0.5.69", notes: NOTES.replace("# Vetta 0.5.70", "# Vetta 0.5.69") }),
		);
		expect(problems.join("\n")).toMatch(/package\.json 是 0\.5\.69.*静默跳过/);
		expect(problems.join("\n")).toMatch(/bun\.lock 里桌面端版本是 0\.5\.69/);
		expect(problems.join("\n")).toMatch(/标题是「# Vetta 0\.5\.69」/);
	});

	it("blocks a version that was already released anywhere", () => {
		const { problems } = evaluatePreflight(
			facts({
				localTagExists: true,
				remoteTagExists: true,
				githubReleaseExists: true,
				notes: NOTES.replace("unreleased", "released 2026-10-29"),
			}),
		);
		expect(problems).toHaveLength(4);
	});

	it("warns instead of guessing when GitHub cannot be queried", () => {
		expect(evaluatePreflight(facts({ githubReleaseExists: null })).warnings.join()).toMatch(/没能查询 GitHub Release/);
	});

	it("accepts patch, minor and major steps, holds back skips until confirmed", () => {
		const minor = facts({ tag: "v0.6.0", packageVersion: "0.6.0", lockVersion: "0.6.0", notes: notesFor("0.6.0", "0.5.69") });
		expect(evaluatePreflight(minor).problems).toEqual([]);
		const skipped = facts({ tag: "v0.5.72", packageVersion: "0.5.72", lockVersion: "0.5.72", notes: notesFor("0.5.72", "0.5.69") });
		expect(evaluatePreflight(skipped).problems.join()).toMatch(/跳了号.*--allow-irregular/);
		expect(evaluatePreflight({ ...skipped, allowIrregular: true }).problems).toEqual([]);
		expect(evaluatePreflight(facts({ latestReleased: "0.5.70" })).problems.join()).toMatch(/不比最近一个已发布的 v0\.5\.70 大/);
	});

	it("requires a merged main that matches dev and a clean worktree", () => {
		const { problems } = evaluatePreflight(facts({ branch: "dev", devMerged: false, treeDiffersFromDev: " a.ts | 2 +-", dirty: " M bun.lock" }));
		expect(problems).toHaveLength(4);
	});

	it("requires release notes with entries and no placeholders", () => {
		const empty = "# Vetta 0.5.70\n<!-- release-status: unreleased -->\n";
		expect(evaluatePreflight(facts({ notes: empty })).problems.join()).toMatch(/没有任何条目/);
		expect(evaluatePreflight(facts({ notes: `${NOTES}- TODO 补一条\n` })).problems.join()).toMatch(/占位文字/);
		for (const marker of ["（占位）", "[占位]", "占位文字：链接"])
			expect(evaluatePreflight(facts({ notes: `${NOTES}- ${marker}\n` })).problems.join()).toMatch(/占位文字/);
		expect(evaluatePreflight(facts({ notes: null })).problems.join()).toMatch(/缺少发布说明/);
	});

	// 发布说明是 Release 正文，单语或旧结构不能直接发出去。
	it("requires the bilingual structure and a Full Changelog footer", () => {
		const singleLanguage = "# Vetta 0.5.70\n<!-- release-status: unreleased -->\n\n## 新增\n\n- 一条\n";
		expect(evaluatePreflight(facts({ notes: singleLanguage })).problems.join()).toMatch(/## English/);
		const withoutFooter = NOTES.replace("**Full Changelog**: https://github.com/openvetta/open-vetta/compare/v0.5.69...v0.5.70", "");
		expect(evaluatePreflight(facts({ notes: withoutFooter })).problems.join()).toMatch(/Full Changelog/);
		const wrongStart = NOTES.replace("compare/v0.5.69...", "compare/v0.5.68...");
		expect(evaluatePreflight(facts({ notes: wrongStart })).problems.join()).toMatch(/起点应是上一版 v0\.5\.69/);
	});

	// 正文里把「占位」当普通动词用是正常写法，不能用它拦下发版。
	it("does not treat a plain use of 占位 as a placeholder", () => {
		const notes = NOTES.replace("- 第三件事。", "- 不是仓库的项目既不占位，也能手动打开面板。");
		expect(evaluatePreflight(facts({ notes })).problems).toEqual([]);
	});

	it("summarises entries per language for the confirmation summary", () => {
		expect(summarizeReleaseNotes(NOTES)).toBe("中文 3 条（新增 2 / 修复 1）/ English 3 条");
	});
});

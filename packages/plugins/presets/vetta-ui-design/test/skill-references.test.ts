/**
 * skill 正文按路径点名 references 文件，agent 照着路径去 Read。路径写错不会有任何
 * 构建报错，只会让 agent 在要用那条规则的时候读到一个不存在的文件，然后凭习惯继续
 * 干——恰好就是这些文件要纠正的那种习惯。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_DIR = join(__dirname, "../agent/skills/vetta-ui-design");

const referencedPaths = (text: string): string[] => [
	...new Set([...text.matchAll(/`(references\/[\w./-]+\.md)`/g)].map((match) => match[1])),
];

describe("vetta-ui-design skill references", () => {
	it("names only reference files that ship with the skill", () => {
		const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
		const paths = referencedPaths(skill);
		expect(paths).toContain("references/taste/directions.md");
		for (const path of paths) {
			expect(existsSync(join(SKILL_DIR, path)), `${path} is referenced by SKILL.md but missing`).toBe(true);
		}
	});

	it("names only reference files that ship with the skill from the direction sheets", () => {
		// 方向表是工具返回的文字，不在 skill 目录里，路径写错时同样无声无息。
		const sheet = readFileSync(join(__dirname, "../src/direction/sheet.ts"), "utf8");
		const paths = [...new Set([...sheet.matchAll(/(references\/[\w./-]+\.md)/g)].map((match) => match[1]))];
		expect(paths).toContain("references/taste/app-screens.md");
		for (const path of paths) {
			expect(existsSync(join(SKILL_DIR, path)), `${path} is named by sheet.ts but missing`).toBe(true);
		}
	});

	it("keeps cross-references inside the reference files resolvable", () => {
		for (const file of ["references/quality.md", "references/taste/directions.md"]) {
			for (const path of referencedPaths(readFileSync(join(SKILL_DIR, file), "utf8"))) {
				expect(existsSync(join(SKILL_DIR, path)), `${path} is referenced by ${file} but missing`).toBe(true);
			}
		}
	});

	it("routes every new design through the direction step before the first frame", () => {
		const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
		const designer = readFileSync(join(__dirname, "../agent/agents/designer.md"), "utf8");
		// 缺了这一步，agent 会直接在脚手架的 indigo/slate 调色板上开画——正是 AI 味的来源。
		expect(skill).toMatch(/`vetd_create` with it → set the\s+direction → start building/);
		expect(designer).toContain("replace the scaffold palette before the first frame");
	});

	it("deals landing pages and has app screens propose a checked direction instead of defaulting the look", () => {
		const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
		const designer = readFileSync(join(__dirname, "../agent/agents/designer.md"), "utf8");
		expect(skill).toMatch(/Landing: `vetd_create` deals them/);
		expect(skill).toContain('`action: "propose"`');
		expect(skill).toContain('`action: "choose"`');
		expect(skill).toContain('`action: "show"`');
		expect(skill).toMatch(/\*\*Slides, posters and infographics\*\* are not dealt/);
		expect(designer).toContain("vetd_direction");
	});

	it("keeps the skill body that loads on every invocation within its budget", () => {
		// SKILL.md 每次 invoke_skill 都整份进上下文；审美规则的细节归方向表和按需读的
		// references。超了先删重复的说明，而不是调高这个数。
		const bytes = Buffer.byteLength(readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8"));
		expect(bytes).toBeLessThanOrEqual(32_000);
	});
});

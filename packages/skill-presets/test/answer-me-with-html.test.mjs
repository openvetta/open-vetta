import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const presetsDir = fileURLToPath(new URL("..", import.meta.url));
const skillDir = join(presetsDir, "answer-me-with-html");
const read = (path) => readFileSync(join(skillDir, path), "utf8");
const skill = read("SKILL.md");
const template = read("assets/answer-template.html");

describe("answer-me-with-html preset contract", () => {
	it("registers an enabled, offline-capable skill with localized details", () => {
		const manifest = JSON.parse(readFileSync(join(presetsDir, "skills-manifest.json"), "utf8"));
		const registration = manifest["answer-me-with-html"];
		const ability = JSON.parse(read("ability.json"));
		expect(registration).toMatchObject({
			name: "answer-me-with-html",
			source: "builtin",
			enabled: true,
			type: "skill",
			alias: "HTML可视化回答",
		});
		expect(registration.requiresCloud).not.toBe(true);
		expect(skill).toMatch(/^---\nname: answer-me-with-html\n/);
		expect(ability).toMatchObject({ schemaVersion: 1, type: "skill", slug: registration.name, version: registration.version });
		expect(ability.detail.blocks.length).toBeGreaterThan(0);
		expect(ability.detail.i18n.en.blocks.length).toBeGreaterThan(0);
	});

	it("teaches explicit inline delivery while preserving source-first HTML and concise replies", () => {
		expect(skill).toContain("closed `html-preview` Markdown fence");
		expect(skill).toContain("directly in the assistant's main reply");
		expect(skill).toContain("response is complete and the Markdown fence is closed");
		expect(skill).toContain("not an HTML well-formedness validator");
		expect(skill).toContain("ordinary `html` code fence is source-first");
		expect(skill).toContain("For a simple answer, stay with concise Markdown");
		expect(skill).toContain("Do not write an HTML file");
		expect(skill).toContain("only when the user explicitly requests a saved/exported artifact");
		expect(skill).toContain("直接在主会话用HTML展示");
	});

	it("bundles every linked asset without importing the upstream compiler or runtime", () => {
		for (const docPath of ["SKILL.md", "references/layout-recipes.md"]) {
			for (const match of read(docPath).matchAll(/\]\(([^)]+)\)/g)) {
				expect(existsSync(join(skillDir, dirname(docPath), match[1])), match[1]).toBe(true);
			}
		}
		expect(readdirSync(skillDir).sort()).toEqual(["LICENSE", "NOTICE", "SKILL.md", "ability.json", "assets", "references"]);
		expect(read("NOTICE")).toContain("not the upstream compiler");
		expect(skill).toContain("not a React component library");
	});

	it("preserves the full pinned upstream MIT notice in both redistribution surfaces", () => {
		const license = readFileSync(join(skillDir, "LICENSE"));
		const blobHash = createHash("sha1").update(`blob ${license.length}\0`).update(license).digest("hex");
		expect(blobHash).toBe("17eca290eefa4fa9d5594edcad845be8df899eb0");
		expect(template).toContain(license.toString("utf8"));
		expect(read("NOTICE")).toContain("4afe054b1a7f99b43c316c1951b113ae7c775f4e");
		expect(read("NOTICE")).toContain("Version: 0.4.9");
	});

	it("ships a self-contained, semantic static template with narrow-card recipes", () => {
		expect(template).toMatch(/<body\s+lang="zh-CN"/);
		expect(template).toContain("<details><summary>");
		expect(template).toContain('scope="col"');
		expect(template).toContain('scope="row"');
		for (const shape of ["am-sheet", "am-doc", "am-panel", "am-callout", "am-kv", "am-timeline", "am-table-wrap"]) {
			expect(template).toContain(shape);
		}
		expect(template).toContain("minmax(0, 1fr)");
		expect(template).toContain("@media (max-width: 360px)");
		expect(template).toContain("overflow-wrap: anywhere");
		expect(template).not.toMatch(/<(?:script|iframe|object|embed|form|link|img|video|audio)\b/i);
		expect(template).not.toMatch(/\s(?:on[a-z]+|src|href|srcdoc|action|formaction)\s*=/i);
		expect(template).not.toMatch(/@import\b|url\s*\(/i);
	});
});

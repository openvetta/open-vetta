import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSkillsForPrompt, loadSkills } from "@vetta/coding-agent/resources";
import { createNodeResourceAccess } from "@vetta/runtime-node/host";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the Electron shell and persisted user preferences are replaced. Packaging,
// registration, plugin contributions, discovery, and model indexing stay real.
vi.mock("electron", () => ({
	app: { isPackaged: true, getAppPath: () => "", getSystemLocale: () => "en" },
}));
vi.mock("./config/desktop-config-store.js", () => ({ readConfigSync: () => ({ language: "en" }) }));

import { getBuiltinSkillPaths, readBuiltinSkillsManifest } from "./builtin-skills.js";
import { DesktopCodingAgentPluginRuntimeSource } from "./plugins/coding-agent-plugin-runtime-source.js";

describe("built-in HTML answer skill distribution and model discovery", () => {
	let fixtureRoot: string;
	let originalResourcesPath: PropertyDescriptor | undefined;

	beforeEach(() => {
		fixtureRoot = mkdtempSync(join(tmpdir(), "vetta-inline-html-skill-"));
		originalResourcesPath = Object.getOwnPropertyDescriptor(process, "resourcesPath");
		Object.defineProperty(process, "resourcesPath", { configurable: true, value: fixtureRoot });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		if (originalResourcesPath) Object.defineProperty(process, "resourcesPath", originalResourcesPath);
		else Reflect.deleteProperty(process, "resourcesPath");
		rmSync(fixtureRoot, { recursive: true, force: true });
	});

	it.each(["false", "true"])("ships and exposes the inline skill to a fresh session (cloud=%s)", async (cloud) => {
		vi.stubEnv("VETTA_CLOUD_ENABLED", cloud);
		const stagedDir = join(fixtureRoot, "system-skills");
		// Exercise the actual packaging script under Node, as the release build does.
		// It is an untyped .mjs entry point, so keep that boundary out of TS imports.
		const stagingScript = new URL("../../scripts/stage-system-skills.mjs", import.meta.url).href;
		execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"--eval",
				`import { stageSystemSkills } from ${JSON.stringify(stagingScript)}; stageSystemSkills(process.argv[1], "builtin-html-skill-test");`,
				stagedDir,
			],
			{ env: { ...process.env, VETTA_CLOUD_ENABLED: cloud }, stdio: "pipe" },
		);
		const skillDir = join(stagedDir, "answer-me-with-html");
		const paths = getBuiltinSkillPaths();
		expect(paths).toContain(skillDir);
		expect(readBuiltinSkillsManifest()["answer-me-with-html"]).toMatchObject({ enabled: true, source: "builtin" });
		for (const asset of [
			"SKILL.md",
			"ability.json",
			"LICENSE",
			"NOTICE",
			"assets/answer-template.html",
			"references/layout-recipes.md",
		]) {
			expect(existsSync(join(skillDir, asset)), asset).toBe(true);
		}
		expect(paths.some((path) => path.endsWith("publish-ability"))).toBe(cloud === "true");

		const source = new DesktopCodingAgentPluginRuntimeSource({
			build: () => undefined,
			additionalSkillPaths: paths,
			readAdditionalSkillPaths: getBuiltinSkillPaths,
			handlerLeaseProvider: { bindForTurn: () => ({ release() {} }) },
		});
		const contributions = source.readAgentPlugins()?.skillPathContributions ?? [];
		expect(contributions).toContainEqual({ pluginId: "desktop:builtin-skills", paths });
		const cwd = join(fixtureRoot, "project");
		mkdirSync(cwd);
		const access = createNodeResourceAccess();
		const { skills, diagnostics } = await loadSkills({
			resourceAccess: { ...access, paths: { ...access.paths, homeDirectory: () => fixtureRoot } },
			cwd,
			agentDir: join(fixtureRoot, "agent"),
			sceneDir: join(fixtureRoot, "scene"),
			includeDefaults: false,
			includeAgentSkills: false,
			skillPaths: contributions.flatMap((contribution) => contribution.paths),
		});
		expect(diagnostics.filter((diagnostic) => diagnostic.path?.startsWith(skillDir))).toEqual([]);
		const htmlSkills = skills.filter((skill) => skill.name === "answer-me-with-html");
		expect(htmlSkills).toHaveLength(1);
		expect(htmlSkills[0]).toMatchObject({
			alias: "HTML可视化回答",
			type: "skill",
			disableModelInvocation: false,
			filePath: join(skillDir, "SKILL.md"),
		});
		expect(htmlSkills[0].content).toContain("closed `html-preview` Markdown fence");
		expect(htmlSkills[0].content).toContain("Do not write an HTML file");
		const modelIndex = formatSkillsForPrompt(skills);
		expect(modelIndex).toContain("<name>answer-me-with-html</name>");
		expect(modelIndex).toContain("直接在主会话用HTML展示");
		expect(modelIndex).toContain("main conversation");

		// A later disable must disappear from the same live source, without restart.
		const manifestPath = join(stagedDir, "skills-manifest.json");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
		manifest["answer-me-with-html"].enabled = false;
		writeFileSync(manifestPath, JSON.stringify(manifest));
		const refreshedPaths = source.readAgentPlugins()?.skillPathContributions?.flatMap((entry) => entry.paths) ?? [];
		expect(refreshedPaths).not.toContain(skillDir);
	});
});

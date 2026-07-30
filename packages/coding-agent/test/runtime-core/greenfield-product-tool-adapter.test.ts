import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCodingAgentGreenfieldProductToolRegistrations,
	createCodingAgentInvokeSkillRuntimeFeature,
} from "../../src/adapters/runtime-core/greenfield.js";
import type { CodingAgentPromptResourceSource } from "../../src/adapters/runtime-core/greenfield-prompt-runtime.js";
import type { Skill } from "../../src/core/skills.js";

describe("Greenfield product tool compatibility boundary", () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		for (const directory of temporaryDirectories.splice(0)) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("preserves the legacy product tool names and activation metadata", () => {
		const registrations = createCodingAgentGreenfieldProductToolRegistrations({
			cwd: process.cwd(),
			knowledgeRoot: "C:\\knowledge",
		});
		const byName = new Map(registrations.map((registration) => [registration.tool.name, registration]));

		expect([...byName.keys()]).toEqual([
			"doc_to_pdf",
			"html_to_pdf",
			"extract_text_from_pdf",
			"extract_text_from_img",
			"render_pdf_page",
			"progress",
			"kb_write_page",
		]);
		for (const name of [
			"doc_to_pdf",
			"html_to_pdf",
			"extract_text_from_pdf",
			"extract_text_from_img",
			"render_pdf_page",
			"progress",
		]) {
			expect(byName.get(name)?.agentModes).toEqual(["work"]);
		}
		expect(byName.get("kb_write_page")).toMatchObject({
			scopeUse: ["kb-processing"],
			requires: ["knowledge"],
			category: "kb-write",
		});
	});

	it("refreshes skill visibility per call and resolves the current file at execution", async () => {
		const directory = await mkdtemp(join(tmpdir(), "greenfield-invoke-skill-"));
		temporaryDirectories.push(directory);
		const filePath = join(directory, "SKILL.md");
		await writeFile(filePath, "---\nname: sample\ndescription: sample\n---\nUse the sample workflow.\n", "utf8");
		let mode = "work";
		let skills: Skill[] = [];
		let refreshCount = 0;
		const source = promptResourceSource({
			readSkills: () => skills,
			onRefresh: () => {
				refreshCount += 1;
			},
		});
		const definition = createCodingAgentInvokeSkillRuntimeFeature({
			resourceSource: source,
			readAgentMode: () => mode,
		});
		const signal = new AbortController().signal;
		const feature = await definition.prepare({ signal });

		try {
			expect((await feature.contribute({ profileId: "test", signal })).tools).toBeUndefined();
			skills = [skill(filePath, directory)];
			const workContribution = await feature.contribute({ profileId: "test", signal });
			const tool = workContribution.tools?.[0];
			expect(tool?.name).toBe("invoke_skill");
			if (!tool) throw new Error("Expected invoke_skill tool");
			const result = await tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "call-1",
				input: { description: "load sample", name: "sample" },
				signal,
			});
			expect(result.content[0]).toMatchObject({
				type: "text",
				text: expect.stringContaining("Use the sample workflow."),
			});

			mode = "coding";
			expect((await feature.contribute({ profileId: "test", signal })).tools).toBeUndefined();
			mode = "work";
			skills = [];
			expect((await feature.contribute({ profileId: "test", signal })).tools).toBeUndefined();
			expect(refreshCount).toBeGreaterThanOrEqual(5);
		} finally {
			await feature.dispose();
		}
	});
});

function skill(filePath: string, baseDir: string): Skill {
	return {
		name: "sample",
		description: "Sample skill",
		filePath,
		baseDir,
		source: "test",
		type: "skill",
		agentMode: ["work"],
		disableModelInvocation: false,
	};
}

function promptResourceSource(options: {
	readonly readSkills: () => Skill[];
	readonly onRefresh: () => void;
}): CodingAgentPromptResourceSource {
	return {
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getAppendSystemPrompt: () => [],
		getSkills: () => ({ skills: options.readSkills(), diagnostics: [] }),
		getSystemPrompt: () => undefined,
		refreshSkillsIfChanged: () => {
			options.onRefresh();
			return true;
		},
	};
}

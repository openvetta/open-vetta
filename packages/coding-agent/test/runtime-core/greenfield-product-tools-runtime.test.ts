import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKbWritePageTool, type KbWritePageOperations } from "@vetta/runtime-tools/coding";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCodingAgentGreenfieldProductToolRegistrations,
	createCodingAgentInvokeSkillRuntimeFeature,
} from "../../src/adapters/runtime-core/greenfield.js";
import type { CodingAgentPromptResourceSource } from "../../src/adapters/runtime-core/greenfield-prompt-runtime.js";
import type { CodingAgentRuntimeToolRegistration } from "../../src/adapters/runtime-core/greenfield-tool-adapter.js";
import { createDocToPdfTool } from "../../src/core/tools/doc-to-pdf/index.js";
import { createExtractTextFromImgTool } from "../../src/core/tools/extract-text-from-img/index.js";
import { createExtractTextFromPdfTool } from "../../src/core/tools/extract-text-from-pdf/index.js";
import { createHtmlToPdfTool } from "../../src/core/tools/html-to-pdf/index.js";
import { createProgressTool } from "../../src/core/tools/progress/index.js";
import { createRenderPdfPageTool } from "../../src/core/tools/render-pdf-page/index.js";
import type { Skill } from "../../src/resources/skills/index.js";

describe("Greenfield product tools runtime", () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		for (const directory of temporaryDirectories.splice(0)) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("preserves the complete legacy product tool definitions and activation metadata", () => {
		const cwd = process.cwd();
		const knowledgeOperations = createKnowledgeOperations();
		const registrations = createCodingAgentGreenfieldProductToolRegistrations({
			cwd,
			knowledgePageWriter: knowledgeOperations,
		});
		const legacy = [
			createDocToPdfTool(cwd),
			createHtmlToPdfTool(cwd),
			createExtractTextFromPdfTool(cwd),
			createExtractTextFromImgTool(cwd),
			createRenderPdfPageTool(cwd),
			createProgressTool(),
		];

		expect(registrations.slice(0, -1).map(runtimeVisibleDefinition)).toEqual(legacy.map(legacyVisibleDefinition));
		const knowledgeTool = createKbWritePageTool({ operations: knowledgeOperations });
		expect(runtimeVisibleDefinition(registrations.at(-1)!)).toEqual({
			name: knowledgeTool.name,
			label: knowledgeTool.label,
			description: knowledgeTool.description,
			schema: knowledgeTool.inputSchema,
			scopeUse: ["kb-processing"],
			requires: ["knowledge"],
			agentModes: undefined,
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

function createKnowledgeOperations(): KbWritePageOperations {
	return {
		write: async () => ({ action: "create", id: "page-1", path: "page.md" }),
		resolveAbsolutePath: (path) => path,
	};
}

interface LegacyVisibleTool {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly parameters: unknown;
	readonly scope_use?: readonly string[];
	readonly requires?: readonly string[];
	readonly agent_mode?: readonly string[];
	readonly category?: string;
}

function legacyVisibleDefinition(tool: LegacyVisibleTool) {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		schema: tool.parameters,
		scopeUse: tool.scope_use ?? [],
		requires: tool.requires,
		agentModes: tool.agent_mode,
		category: tool.category,
	};
}

function runtimeVisibleDefinition(registration: CodingAgentRuntimeToolRegistration) {
	return {
		name: registration.tool.name,
		label: registration.tool.label,
		description: registration.tool.description,
		schema: registration.tool.inputSchema,
		scopeUse: registration.scopeUse,
		requires: registration.requires,
		agentModes: registration.agentModes,
		category: registration.category,
	};
}

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

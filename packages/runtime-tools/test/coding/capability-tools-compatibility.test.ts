import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TSchema } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { listAvailableTags, queryByTags, writeWikiPage } from "@vetta/runtime-knowledge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TodoStore } from "../../../coding-agent/src/core/todo-store.js";
import { createAskUserQuestionTool as createLegacyAskUserQuestionTool } from "../../../coding-agent/src/core/tools/ask-user-question/index.js";
import { createInvokeSkillTool as createLegacyInvokeSkillTool } from "../../../coding-agent/src/core/tools/invoke-skill/index.js";
import { createKbFilterByTagsTool as createLegacyKbFilterByTagsTool } from "../../../coding-agent/src/core/tools/kb-filter-by-tags/index.js";
import { createKbListTagsTool as createLegacyKbListTagsTool } from "../../../coding-agent/src/core/tools/kb-list-tags/index.js";
import { createTodoTool as createLegacyTodoTool } from "../../../coding-agent/src/core/tools/todo/index.js";
import { createToolSearchTool as createLegacyToolSearchTool } from "../../../coding-agent/src/core/tools/tool-search/index.js";
import { stripFrontmatter } from "../../../coding-agent/src/utils/frontmatter.js";
import {
	type CodingToolRegistration,
	createAskUserQuestionToolRegistration,
	createInvokeSkillToolRegistration,
	createKbFilterByTagsToolRegistration,
	createKbListTagsToolRegistration,
	createMemoryToolRegistration,
	createTodoToolRegistration,
	createToolSearchToolRegistration,
	MEMORY_TOOL_CATEGORY,
	MEMORY_TOOL_DESCRIPTION,
	MEMORY_TOOL_SCOPES,
	MemoryToolInputSchema,
	type MemoryToolOperations,
	scoreDeferredTools,
} from "../../src/coding/index.js";

interface LegacyToolDefinition {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly parameters: TSchema;
	readonly scope_use?: readonly string[];
	readonly requires?: readonly string[];
	readonly category?: string;
}

const signal = new AbortController().signal;
let testRoot = "";

beforeAll(async () => {
	testRoot = await mkdtemp(join(tmpdir(), "runtime-capability-tools-"));
	const timestamp = "2026-08-04T00:00:00.000Z";
	await writeWikiPage(
		testRoot,
		"topic/page.md",
		{
			id: "page-1",
			source: "test",
			source_path: "test/page.md",
			source_hash: "hash-1",
			tags: ["runtime", "tool"],
			title: "Runtime Tool",
			summary: "Native tool contract",
			created_at: timestamp,
			updated_at: timestamp,
			orphaned_at: null,
		},
		"body",
	);
});

afterAll(async () => {
	if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

describe("native capability tool compatibility", () => {
	it("keeps all model-visible definitions and registration metadata", () => {
		const ask = async () => ({ cancelled: true, answers: [] });
		const skill = createSkill();
		const search = () => ({ activated: [], alreadyActive: [], totalDeferred: 0 });
		const todoStore = new TodoStore();
		const memoryOperations = createInMemoryMemoryOperations();
		const knowledgeOperations = createKnowledgeOperations();

		expectRegistrationMatchesLegacy(
			createAskUserQuestionToolRegistration({ ask }),
			createLegacyAskUserQuestionTool({ ask }),
		);
		expectRegistrationMatchesLegacy(
			createInvokeSkillToolRegistration({
				getSkills: () => [skill],
				readBody: ({ content }) => stripFrontmatter(content),
			}),
			createLegacyInvokeSkillTool({ getSkills: () => [skill] }),
		);
		expectRegistrationMatchesLegacy(
			createToolSearchToolRegistration({ search }),
			createLegacyToolSearchTool({ search }),
		);
		const memory = createMemoryToolRegistration({ operations: memoryOperations });
		expect({
			name: memory.tool.name,
			label: memory.tool.label,
			description: memory.tool.description,
			schema: memory.tool.inputSchema,
			scopeUse: memory.scopeUse,
			category: memory.category,
		}).toEqual({
			name: "memory",
			label: "Memory",
			description: MEMORY_TOOL_DESCRIPTION,
			schema: MemoryToolInputSchema,
			scopeUse: MEMORY_TOOL_SCOPES,
			category: MEMORY_TOOL_CATEGORY,
		});
		expectRegistrationMatchesLegacy(
			createTodoToolRegistration({ getTodoStore: () => todoStore }),
			createLegacyTodoTool({ getTodoStore: () => todoStore }),
		);
		expectRegistrationMatchesLegacy(
			createKbListTagsToolRegistration({ operations: knowledgeOperations }),
			createLegacyKbListTagsTool(testRoot),
		);
		expectRegistrationMatchesLegacy(
			createKbFilterByTagsToolRegistration({ operations: knowledgeOperations }),
			createLegacyKbFilterByTagsTool(testRoot),
		);
	});

	it("keeps ask_user_question answer and cancellation results", async () => {
		const ask = async () => ({
			cancelled: false,
			answers: [{ question: "Choose?", answers: ["First"] }],
		});
		const input = {
			description: "Clarify",
			questions: [
				{
					question: "Choose?",
					header: "Choice",
					options: [
						{ label: "First", description: "One" },
						{ label: "Second", description: "Two" },
					],
				},
			],
		};
		const legacy = createLegacyAskUserQuestionTool({ ask });
		const runtime = createAskUserQuestionToolRegistration({ ask }).tool;
		expect(await executeRuntime(runtime, input)).toEqual(await legacy.execute("legacy", input, signal));
	});

	it("keeps invoke_skill success, missing, and read-error results", async () => {
		const skill = createSkill();
		const legacy = createLegacyInvokeSkillTool({ getSkills: () => [skill] });
		const runtime = createInvokeSkillToolRegistration({
			getSkills: () => [skill],
			readBody: ({ content }) => stripFrontmatter(content),
		}).tool;
		for (const input of [{ name: "pdf", args: "source.pdf" }, { name: "missing" }]) {
			expect(await executeRuntime(runtime, input)).toEqual(await legacy.execute("legacy", input, signal));
		}
	});

	it("keeps deferred tool scoring, activation output, and max-result clamping", async () => {
		const entries = [
			{ name: "github_issue", description: "Manage repository issues" },
			{ name: "notion_page", description: "Manage pages" },
		];
		expect(scoreDeferredTools("github issue", entries)).toEqual([
			{ name: "github_issue", description: "Manage repository issues" },
		]);
		const calls: number[] = [];
		const search = (_query: string, maxResults: number) => {
			calls.push(maxResults);
			return { activated: [entries[0]], alreadyActive: [entries[1].name], totalDeferred: entries.length };
		};
		const legacy = createLegacyToolSearchTool({ search });
		const runtime = createToolSearchToolRegistration({ search }).tool;
		const input = { query: "issue", max_results: 99 };
		expect(await executeRuntime(runtime, input)).toEqual(await legacy.execute("legacy", input, signal));
		expect(calls).toEqual([10, 10]);
	});

	it("keeps memory add and replace state transitions", async () => {
		const runtime = createMemoryToolRegistration({
			operations: createInMemoryMemoryOperations(),
		}).tool;
		expect(await executeRuntime(runtime, { action: "add", content: "Uses Bun" })).toEqual({
			content: [{ type: "text", text: "memory add ok — 1 entry, 8/4000 chars.\n\nCurrent memory:\n1. Uses Bun" }],
			details: { action: "add", entryCount: 1, chars: 8, limit: 4_000 },
		});
		expect(
			await executeRuntime(runtime, { action: "replace", match: "Bun", content: "Uses Bun workspaces" }),
		).toEqual({
			content: [
				{
					type: "text",
					text: "memory replace ok — 1 entry, 19/4000 chars.\n\nCurrent memory:\n1. Uses Bun workspaces",
				},
			],
			details: { action: "replace", entryCount: 1, chars: 19, limit: 4_000 },
		});
	});

	it("keeps todo creation, update, listing, and clear behavior", async () => {
		const legacyStore = new TodoStore();
		const runtimeStore = new TodoStore();
		const legacy = createLegacyTodoTool({ getTodoStore: () => legacyStore });
		const runtime = createTodoToolRegistration({ getTodoStore: () => runtimeStore }).tool;
		const inputs = [
			{ action: "create" as const, items: ["First", "Second"] },
			{ action: "update" as const, id: 1, status: "in_progress" as const },
			{ action: "list" as const },
			{ action: "clear" as const },
		];
		for (const input of inputs) {
			expect(await executeRuntime(runtime, input)).toEqual(await legacy.execute("legacy", input, signal));
		}
	});

	it("keeps knowledge tag listing and filtering results", async () => {
		const operations = createKnowledgeOperations();
		const legacyList = createLegacyKbListTagsTool(testRoot);
		const runtimeList = createKbListTagsToolRegistration({ operations }).tool;
		expect(await executeRuntime(runtimeList, {})).toEqual(await legacyList.execute("legacy", {}, signal));

		const legacyFilter = createLegacyKbFilterByTagsTool(testRoot);
		const runtimeFilter = createKbFilterByTagsToolRegistration({ operations }).tool;
		const input = { all: ["runtime"] };
		expect(await executeRuntime(runtimeFilter, input)).toEqual(await legacyFilter.execute("legacy", input, signal));
	});
});

function expectRegistrationMatchesLegacy<TInput extends object>(
	registration: CodingToolRegistration<TInput>,
	legacy: LegacyToolDefinition,
): void {
	expect({
		name: registration.tool.name,
		label: registration.tool.label,
		description: registration.tool.description,
		schema: registration.tool.inputSchema,
		scopeUse: registration.scopeUse,
		requires: registration.requires,
		category: registration.category,
	}).toEqual({
		name: legacy.name,
		label: legacy.label,
		description: legacy.description,
		schema: legacy.parameters,
		scopeUse: legacy.scope_use ?? [],
		requires: legacy.requires,
		category: legacy.category ?? "",
	});
}

async function executeRuntime<TInput extends object>(tool: RuntimeToolDefinition<TInput>, input: TInput) {
	return tool.execute({
		sessionId: "session",
		turnId: "turn",
		toolCallId: "runtime",
		input,
		signal,
	});
}

function createSkill() {
	return {
		name: "pdf",
		description: "PDF workflow",
		filePath: "C:/skills/pdf/SKILL.md",
		baseDir: "C:/skills/pdf",
		source: "test",
		type: "skill" as const,
		disableModelInvocation: false,
		content: "---\nname: pdf\n---\nFollow the PDF workflow.",
	};
}

function createKnowledgeOperations() {
	return {
		listAvailableTags: () => listAvailableTags(testRoot),
		queryByTags: async (input: { all?: string[]; any?: string[]; none?: string[] }) => {
			const pages = await queryByTags(testRoot, input);
			return pages.map((page) => ({ ...page, absolutePath: join(testRoot, "wiki", page.path) }));
		},
	};
}

function createInMemoryMemoryOperations(): MemoryToolOperations {
	const entries: string[] = [];
	return {
		apply(action, input) {
			if (action === "add") entries.push(input.content ?? "");
			if (action === "replace") {
				const index = entries.findIndex((entry) => entry.includes(input.match ?? ""));
				if (index >= 0) entries[index] = input.content ?? "";
			}
			if (action === "remove") {
				const index = entries.findIndex((entry) => entry.includes(input.match ?? ""));
				if (index >= 0) entries.splice(index, 1);
			}
			return { entries: [...entries], chars: entries.join("\n\n§\n\n").length, limit: 4_000 };
		},
	};
}

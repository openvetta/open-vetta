import { describe, expect, it } from "vitest";
import { createFindTool as createLegacyFindTool } from "../../../../coding-agent/src/core/tools/find/index.js";
import {
	createFindTool,
	createFindToolRegistration,
	FIND_TOOL_SCOPES,
	selectCodingToolRegistrations,
	selectCodingToolsForScope,
} from "../../../src/coding/index.js";

const files = ["visible.txt", ".secret/hidden.txt", "src/index.ts"];

function operations() {
	return {
		exists: () => true,
		glob: async (
			_pattern: string,
			cwd: string,
			options: { readonly ignore: readonly string[]; readonly limit: number },
		) => {
			expect(cwd.replace(/\\/g, "/")).toBe("C:/workspace");
			expect(options.ignore).toEqual(["**/node_modules/**", "**/.git/**"]);
			return files.slice(0, options.limit).map((file) => `${cwd}/${file}`);
		},
	};
}

describe("runtime find tool", () => {
	it("preserves the legacy definition and empty default scope", () => {
		const legacy = createLegacyFindTool(process.cwd());
		const runtime = createFindToolRegistration(process.cwd(), { operations: operations() });

		expect({
			name: runtime.tool.name,
			label: runtime.tool.label,
			description: runtime.tool.description,
			schema: runtime.tool.inputSchema,
			scopeUse: runtime.scopeUse,
			category: runtime.category,
		}).toEqual({
			name: legacy.name,
			label: legacy.label,
			description: legacy.description,
			schema: legacy.parameters,
			scopeUse: legacy.scope_use,
			category: legacy.category,
		});
		expect(runtime.scopeUse).toEqual(FIND_TOOL_SCOPES);
		expect(selectCodingToolsForScope([runtime], "project")).toEqual([]);
	});

	it("uses an injected host resolver without downloading or discovering tools itself", async () => {
		const resolvedTools: string[] = [];
		const runtime = createFindTool(process.cwd(), {
			executableResolver: {
				resolve: async (tool) => {
					resolvedTools.push(tool);
					return undefined;
				},
			},
		});

		await expect(
			runtime.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-find",
				input: { pattern: "*.ts" },
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("fd is not available and could not be downloaded");
		expect(resolvedTools).toEqual(["fd"]);
	});

	it("preserves custom operation results, relative paths, and empty results", async () => {
		const legacy = createLegacyFindTool("C:/workspace", { operations: operations() });
		const runtime = createFindTool("C:/workspace", { operations: operations() });
		const input = { pattern: "**/*", path: "." };

		const legacyResult = await legacy.execute("legacy-find", input);
		const runtimeResult = await runtime.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-find",
			input,
			signal: new AbortController().signal,
		});

		expect(runtimeResult).toEqual(legacyResult);
		expect(runtimeResult.content).toEqual([
			{
				type: "text",
				text: files.join("\n"),
			},
		]);
	});

	it("can be explicitly activated without changing default scope exposure", () => {
		const registration = createFindToolRegistration(process.cwd(), { operations: operations() });
		expect(selectCodingToolsForScope([registration], "project")).toEqual([]);
		expect(
			selectCodingToolRegistrations([registration], {
				mode: "explicit",
				toolNames: ["find"],
			}),
		).toEqual([registration]);
	});
});

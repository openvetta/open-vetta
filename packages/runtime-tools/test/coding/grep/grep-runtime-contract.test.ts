import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGrepTool as createLegacyGrepTool } from "../../../../coding-agent/src/core/tools/grep/index.js";
import {
	createGrepTool,
	createGrepToolRegistration,
	GREP_TOOL_SCOPES,
	selectCodingToolsForScope,
} from "../../../src/coding/index.js";

describe("runtime grep tool", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("preserves the legacy definition and registration metadata", () => {
		const legacy = createLegacyGrepTool(process.cwd());
		const runtime = createGrepToolRegistration(process.cwd(), { rgPath: "rg" });

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
		expect(runtime.scopeUse).toEqual(GREP_TOOL_SCOPES);
		expect(selectCodingToolsForScope([runtime], "project").map(({ name }) => name)).toEqual(["grep"]);
	});

	it("preserves matching output, context lines, anchors, and limit notices", async () => {
		const directory = mkdtempSync(join(tmpdir(), "runtime-tools-grep-"));
		temporaryDirectories.push(directory);
		const filePath = join(directory, "context.txt");
		writeFileSync(filePath, ["before", "match one", "after", "middle", "match two", "after two"].join("\n"));

		const legacy = createLegacyGrepTool(directory);
		const runtime = createGrepTool(directory, { rgPath: "rg" });
		const input = { pattern: "match", path: filePath, limit: 1, context: 1 };
		const legacyResult = await legacy.execute("legacy-grep", input);
		const runtimeResult = await runtime.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-grep",
			input,
			signal: new AbortController().signal,
		});

		expect(runtimeResult).toEqual(legacyResult);
	});

	it("keeps cancellation at the runtime tool boundary", async () => {
		const controller = new AbortController();
		controller.abort();
		const runtime = createGrepTool(process.cwd(), { rgPath: "rg" });

		await expect(
			runtime.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-grep",
				input: { pattern: "never-called" },
				signal: controller.signal,
			}),
		).rejects.toThrow("Operation aborted");
	});
});

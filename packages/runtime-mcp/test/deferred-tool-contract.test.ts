import { describe, expect, it, vi } from "vitest";
import {
	createMcpToolSearchRuntimeTool,
	MCP_TOOL_SEARCH_DESCRIPTION,
	renderMcpToolsInstruction,
	scoreMcpDeferredTools,
} from "../src/index.js";

describe("MCP deferred tool contract", () => {
	it("scores name matches above description matches and sorts ties by name", () => {
		const tools = [
			{ name: "mcp_docs_lookup", description: "Search pages" },
			{ name: "mcp_pages_read", description: "Read docs" },
			{ name: "mcp_alpha_docs", description: "Unrelated" },
		];

		expect(scoreMcpDeferredTools("docs pages", tools).map(({ name }) => name)).toEqual([
			"mcp_docs_lookup",
			"mcp_pages_read",
			"mcp_alpha_docs",
		]);
		expect(scoreMcpDeferredTools("  ", tools)).toEqual([]);
	});

	it("renders the existing plain MCP index and truncates descriptions to one line", () => {
		const instruction = renderMcpToolsInstruction(
			[
				{
					name: "mcp_docs_lookup",
					description: `${"x".repeat(205)}\nsecond line`,
				},
			],
			true,
		);

		expect(instruction).toContain("MCP (Model Context Protocol) tools:");
		expect(instruction).toContain(`- mcp_docs_lookup: ${"x".repeat(200)}…`);
		expect(instruction).not.toContain("second line");
		expect(instruction).toContain("**MCP tool usage (deferred)**");
		expect(renderMcpToolsInstruction([], true)).toBe("");
	});

	it("keeps the tool_search schema, clamping and model-visible result", async () => {
		const search = vi.fn(() => ({
			activated: [{ name: "mcp_docs_lookup", description: "Search pages" }],
			alreadyActive: ["mcp_docs_read"],
			totalDeferred: 16,
		}));
		const tool = createMcpToolSearchRuntimeTool(search);

		expect(tool).toMatchObject({
			name: "tool_search",
			label: "Tool Search",
			description: MCP_TOOL_SEARCH_DESCRIPTION,
			inputSchema: {
				type: "object",
				required: ["query"],
			},
		});
		const result = await tool.execute({
			sessionId: "session",
			turnId: "turn",
			toolCallId: "call",
			input: { query: "docs", max_results: 99 },
			signal: new AbortController().signal,
		});

		expect(search).toHaveBeenCalledWith("docs", 10);
		expect(result).toEqual({
			content: [
				{
					type: "text",
					text:
						"Activated 1 MCP tool(s) — callable from now on:\n" +
						"- mcp_docs_lookup: Search pages\n" +
						"Already active: mcp_docs_read",
				},
			],
			details: {
				query: "docs",
				activated: [{ name: "mcp_docs_lookup", description: "Search pages" }],
				alreadyActive: ["mcp_docs_read"],
				totalDeferred: 16,
			},
		});
	});
});

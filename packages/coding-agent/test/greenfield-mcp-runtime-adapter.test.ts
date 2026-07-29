import { createMcpToolSearchRuntimeTool, renderMcpToolsInstruction, scoreMcpDeferredTools } from "@vetta/runtime-mcp";
import { describe, expect, it, vi } from "vitest";
import {
	adaptLegacyMcpManagerRuntimeToolSource,
	createCodingAgentToolSearchRuntimeTool,
	type LegacyMcpManagerRuntimePort,
	renderCodingAgentMcpToolsInstruction,
	scoreCodingAgentDeferredMcpTools,
} from "../src/adapters/runtime-core/greenfield.js";
import { adaptMcpTool, type IMcpClient, type McpServerInstance, type McpTool } from "../src/core/mcp/index.js";

describe("Greenfield MCP legacy adapter", () => {
	it("publishes legacy tools through the independent Runtime MCP source contract", async () => {
		const mcpTool: McpTool = {
			name: "lookup",
			description: "Lookup a value",
			inputSchema: { type: "object", properties: {} },
		};
		const client = mcpClient();
		const adaptedTool = adaptMcpTool(mcpTool, client, "search");
		const server: McpServerInstance = {
			name: "search",
			config: { command: "test" },
			status: "ready",
			client,
			tools: [mcpTool],
			resources: [],
			startedAt: new Date(1),
		};
		const reloadIfChanged = vi.fn(async () => false);
		const manager: LegacyMcpManagerRuntimePort = {
			reloadIfChanged,
			getServers: () => [server],
			getTools: () => [adaptedTool],
		};

		const view = await adaptLegacyMcpManagerRuntimeToolSource(manager).refresh();

		expect(reloadIfChanged).toHaveBeenCalledOnce();
		expect(view.tools).toHaveLength(1);
		expect(view.tools[0]?.tool).toMatchObject({
			name: "mcp_search_lookup",
			description: "Lookup a value",
			inputSchema: mcpTool.inputSchema,
		});
		expect(view.tools[0]?.fingerprint).toContain('"server":"search"');
		expect(view.tools[0]?.fingerprint).toContain('"startedAt":1');
	});

	it("keeps progressive disclosure scoring, prompt and tool results equivalent", async () => {
		const descriptors = [
			{ name: "mcp_docs_lookup", description: "Search pages" },
			{ name: "mcp_pages_read", description: "Read docs" },
		];
		expect(scoreMcpDeferredTools("docs pages", descriptors)).toEqual(
			scoreCodingAgentDeferredMcpTools("docs pages", descriptors),
		);
		expect(renderMcpToolsInstruction(descriptors, true)).toBe(
			renderCodingAgentMcpToolsInstruction(descriptors, true),
		);

		const search = () => ({
			activated: descriptors.slice(0, 1),
			alreadyActive: [descriptors[1]!.name],
			totalDeferred: descriptors.length,
		});
		const legacyTool = createCodingAgentToolSearchRuntimeTool(search);
		const runtimeTool = createMcpToolSearchRuntimeTool(search);
		expect(runtimeTool).toMatchObject({
			name: legacyTool.name,
			label: legacyTool.label,
			description: legacyTool.description,
			inputSchema: legacyTool.inputSchema,
		});
		const signal = new AbortController().signal;
		const input = { query: "docs", max_results: 5 };
		const legacyResult = await legacyTool.execute({
			sessionId: "session",
			turnId: "turn",
			toolCallId: "call",
			input,
			signal,
		});
		const runtimeResult = await runtimeTool.execute({
			sessionId: "session",
			turnId: "turn",
			toolCallId: "call",
			input,
			signal,
		});
		expect(runtimeResult).toEqual(legacyResult);
	});
});

function mcpClient(): IMcpClient {
	return {
		async initialize() {
			throw new Error("Not used");
		},
		async listTools() {
			throw new Error("Not used");
		},
		async callTool() {
			return { content: [{ type: "text", text: "result" }] };
		},
		async listResources() {
			throw new Error("Not used");
		},
		async readResource() {
			throw new Error("Not used");
		},
		async listPrompts() {
			throw new Error("Not used");
		},
		async close() {},
	};
}

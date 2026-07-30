/**
 * MCP Tool Adapter
 *
 * Converts MCP tools to AgentTool interface,
 * allowing MCP tools to be used in the agent system.
 */

import type { AgentTool } from "@vetta/agent-core";
import { convertMcpJsonSchemaToTypeBox, executeMcpToolCall } from "@vetta/runtime-mcp";
import type { EcosystemHookAwareTool } from "../hooks/tool-wrapper.js";
import type { IMcpClient, McpTool } from "./types.js";

/**
 * Adapt an MCP tool to AgentTool interface
 */
export function adaptMcpTool(mcpTool: McpTool, client: IMcpClient, serverName: string): AgentTool {
	// Convert JSON Schema to TypeBox
	const parameters = convertMcpJsonSchemaToTypeBox(mcpTool.inputSchema);

	// Create AgentTool
	const agentTool: EcosystemHookAwareTool = {
		name: `mcp_${serverName}_${mcpTool.name}`,
		label: `${serverName}: ${mcpTool.name}`,
		description: mcpTool.description || `MCP tool from ${serverName}`,
		parameters,
		ecosystemHook: {
			hostName: `mcp_${serverName}_${mcpTool.name}`,
			kind: "mcp",
			source: {
				ecosystem: "mcp",
				serverName,
				originalName: mcpTool.name,
			},
		},

		async execute(_toolCallId, params, _signal, _onUpdate) {
			const result = await executeMcpToolCall(client, mcpTool, params as Readonly<Record<string, unknown>>);
			return { content: [...result.content], details: result.details };
		},
	};

	return agentTool;
}

/**
 * Adapt multiple MCP tools to AgentTools
 */
export function adaptMcpTools(mcpTools: McpTool[], client: IMcpClient, serverName: string): AgentTool[] {
	return mcpTools.map((tool) => adaptMcpTool(tool, client, serverName));
}

/**
 * Extract original MCP tool name from adapted tool name
 * Format: mcp_<serverName>_<toolName>
 */
export function extractMcpToolName(adaptedName: string): { serverName: string; toolName: string } | null {
	const match = adaptedName.match(/^mcp_([^_]+)_(.+)$/);
	if (!match) {
		return null;
	}
	return {
		serverName: match[1],
		toolName: match[2],
	};
}

/**
 * Check if a tool name is an MCP tool
 */
export function isMcpTool(toolName: string): boolean {
	return toolName.startsWith("mcp_");
}

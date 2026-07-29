import type { McpRuntimeToolDescriptor } from "./runtime-tool-synchronizer.js";

export function renderMcpToolsInstruction(tools: readonly McpRuntimeToolDescriptor[], deferred: boolean): string {
	if (tools.length === 0) return "";
	const toolsList = tools.map((tool) => `- ${tool.name}: ${firstLine(tool.description)}`).join("\n");
	const usage = deferred
		? '**MCP tool usage (deferred)**: the list above is an INDEX — these tools are not loaded into your tool list yet. Before calling one, activate it via the `tool_search` tool (keyword search over this index); activated tools stay callable for the rest of the session. Tool names are prefixed with "mcp_[servername]_". When the user explicitly asks to use a specific MCP server or tool, search for it by name and use it instead of a built-in equivalent.'
		: '**MCP tool usage**: tool names are prefixed with "mcp_[servername]_" (e.g., mcp_filesystem_list_directory). When the user explicitly asks to use a specific MCP server or tool (e.g. "use filesystem MCP to list files"), you MUST use the corresponding MCP tool instead of a built-in equivalent.';
	return `MCP (Model Context Protocol) tools:

${toolsList}

${usage}`;
}

function firstLine(text: string): string {
	const line = text.split("\n", 1)[0]?.trim() ?? "";
	return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

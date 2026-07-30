import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { renderMcpToolsSection } from "../../core/system-prompt.js";
import {
	createToolSearchTool,
	type DeferredToolIndexEntry,
	scoreDeferredTools,
	type ToolSearchResult,
} from "../../core/tools/tool-search/index.js";
import { CODING_AGENT_MODEL_TOOL_ORDER } from "./greenfield-model-tool-order.js";
import { adaptCodingAgentToolRegistration } from "./greenfield-tool-adapter.js";

export interface CodingAgentDeferredMcpTool {
	readonly name: string;
	readonly description: string;
}

export function renderCodingAgentMcpToolsInstruction(
	tools: readonly CodingAgentDeferredMcpTool[],
	deferred: boolean,
): string {
	return renderMcpToolsSection(
		tools.map(({ name, description }) => ({ name, description })),
		false,
		deferred,
	);
}

export function scoreCodingAgentDeferredMcpTools(
	query: string,
	tools: readonly CodingAgentDeferredMcpTool[],
): readonly CodingAgentDeferredMcpTool[] {
	return scoreDeferredTools(query, tools.map(toDeferredToolIndexEntry));
}

export function createCodingAgentToolSearchRuntimeTool(
	search: (query: string, maxResults: number) => ToolSearchResult,
): RuntimeToolDefinition {
	return adaptCodingAgentToolRegistration(createToolSearchTool({ search }), {
		modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.toolSearch,
	}).tool;
}

function toDeferredToolIndexEntry(tool: CodingAgentDeferredMcpTool): DeferredToolIndexEntry {
	return { name: tool.name, description: tool.description };
}

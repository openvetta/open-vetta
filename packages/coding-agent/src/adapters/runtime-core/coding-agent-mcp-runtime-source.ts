import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import {
	createMcpServerRuntimeToolSource,
	type ManagedMcpRuntimeToolSource,
	type McpRuntimeToolDecorationContext,
} from "@vetta/runtime-mcp";
import {
	type CodingAgentMcpSupervisorOptions,
	createCodingAgentMcpSupervisor,
} from "../../core/mcp/mcp-supervisor-composition.js";
import type { EcosystemHookAwareRuntimeTool } from "./greenfield-hook-tool-wrapper.js";

export interface CodingAgentMcpRuntimeToolSourceOptions extends CodingAgentMcpSupervisorOptions {}

/** Greenfield product composition that bypasses the legacy Manager and AgentTool protocol. */
export async function createCodingAgentMcpRuntimeToolSource(
	options: CodingAgentMcpRuntimeToolSourceOptions = {},
): Promise<ManagedMcpRuntimeToolSource> {
	const debug = options.debug || false;
	const composition = createCodingAgentMcpSupervisor(options, (message) => {
		if (debug) console.error(`[MCPManager] ${message}`);
	});
	await composition.supervisor.initialize();
	return {
		source: createMcpServerRuntimeToolSource(composition.supervisor, {
			decorateTool: decorateCodingAgentMcpRuntimeTool,
		}),
		dispose: () => composition.supervisor.shutdown(),
	};
}

export function decorateCodingAgentMcpRuntimeTool(
	tool: RuntimeToolDefinition,
	context: McpRuntimeToolDecorationContext,
): EcosystemHookAwareRuntimeTool {
	return {
		...tool,
		ecosystemHook: {
			hostName: tool.name,
			kind: "mcp",
			source: {
				ecosystem: "mcp",
				serverName: context.serverName,
				originalName: context.toolName,
			},
		},
	};
}

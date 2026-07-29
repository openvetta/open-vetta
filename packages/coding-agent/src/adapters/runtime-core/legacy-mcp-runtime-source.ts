import type {
	ManagedMcpRuntimeToolSource,
	McpRuntimeToolBinding,
	McpRuntimeToolSource,
	McpRuntimeToolView,
} from "@vetta/runtime-mcp";
import { createMcpManager, type McpManager, type McpManagerOptions } from "../../core/mcp/index.js";
import { ALL_SCENARIOS, type CodingAgentTool } from "../../core/session/tool-scope.js";
import { adaptCodingAgentToolRegistration } from "./greenfield-tool-adapter.js";

export type LegacyMcpManagerRuntimePort = Pick<McpManager, "getServers" | "getTools" | "reloadIfChanged">;

/** 把旧 McpManager 隔离在 Coding Agent 一侧，向 Greenfield MCP Feature 发布独立能力视图。 */
export class LegacyMcpManagerRuntimeToolSource implements McpRuntimeToolSource {
	constructor(private readonly manager: LegacyMcpManagerRuntimePort) {}

	async refresh(): Promise<McpRuntimeToolView> {
		await this.manager.reloadIfChanged();
		const fingerprints = buildLegacyMcpToolFingerprints(this.manager);
		const tools = this.manager.getTools().map((tool): McpRuntimeToolBinding => {
			const codingTool: CodingAgentTool = {
				...tool,
				scope_use: ALL_SCENARIOS,
				category: "external",
			};
			const runtimeTool = adaptCodingAgentToolRegistration(codingTool).tool;
			return Object.freeze({
				tool: runtimeTool,
				fingerprint:
					fingerprints.get(runtimeTool.name) ??
					JSON.stringify({
						name: runtimeTool.name,
						description: runtimeTool.description,
						inputSchema: runtimeTool.inputSchema,
					}),
			});
		});
		return Object.freeze({ tools: Object.freeze(tools) });
	}
}

export function adaptLegacyMcpManagerRuntimeToolSource(manager: LegacyMcpManagerRuntimePort): McpRuntimeToolSource {
	return new LegacyMcpManagerRuntimeToolSource(manager);
}

export async function createLegacyMcpManagerRuntimeToolSource(
	options?: McpManagerOptions,
): Promise<ManagedMcpRuntimeToolSource> {
	const manager = createMcpManager(options);
	await manager.initialize();
	return {
		source: adaptLegacyMcpManagerRuntimeToolSource(manager),
		dispose: () => manager.shutdown(),
	};
}

function buildLegacyMcpToolFingerprints(manager: Pick<McpManager, "getServers">): ReadonlyMap<string, string> {
	const fingerprints = new Map<string, string>();
	for (const server of manager.getServers()) {
		for (const tool of server.tools) {
			fingerprints.set(
				`mcp_${server.name}_${tool.name}`,
				JSON.stringify({
					server: server.name,
					status: server.status,
					startedAt: server.startedAt?.getTime(),
					tool,
				}),
			);
		}
	}
	return fingerprints;
}

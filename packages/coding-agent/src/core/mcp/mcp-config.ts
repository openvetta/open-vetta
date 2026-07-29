import { join } from "node:path";
import { FileMcpConfigSource, type McpConfig, type McpConfigSource } from "@vetta/runtime-mcp";
import { CONFIG_DIR_NAME, getAgentDir } from "../../config.js";

export { FileMcpConfigSource, type FileMcpConfigSourceOptions, type McpConfigSource } from "@vetta/runtime-mcp";

/** @deprecated Product path compatibility wrapper for the legacy Coding Agent API. */
export class McpConfigLoader extends FileMcpConfigSource implements McpConfigSource {
	constructor(projectRoot: string = process.cwd(), agentDir: string = getAgentDir()) {
		super({
			globalConfigPath: join(agentDir, "mcp.json"),
			projectConfigPath: join(projectRoot, CONFIG_DIR_NAME, "mcp.json"),
			projectRoot,
		});
	}
}

export function loadMcpConfig(projectRoot?: string): McpConfig {
	return new McpConfigLoader(projectRoot).loadMerged();
}

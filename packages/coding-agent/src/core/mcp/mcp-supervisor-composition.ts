import { type McpClientHandle, type McpServerConfig, McpServerSupervisor } from "@vetta/runtime-mcp";
import { getAgentDir } from "../../config.js";
import { createMcpClient } from "./mcp-client.js";
import { McpConfigLoader, type McpConfigSource } from "./mcp-config.js";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const CLIENT_NAME = "vetta";
const CLIENT_VERSION = "1.0.0";

export interface McpClientFactoryOptions {
	readonly debug?: boolean;
	readonly timeout?: number;
	readonly agentDir?: string;
}

export type McpClientFactory = (
	name: string,
	config: McpServerConfig,
	options?: McpClientFactoryOptions,
) => McpClientHandle;

export interface CodingAgentMcpSupervisorOptions {
	/** Project root directory */
	projectRoot?: string;
	/** Agent directory (for global config and OAuth state) */
	agentDir?: string;
	/** Enable debug logging */
	debug?: boolean;
	/** Whether MCP is globally enabled */
	enabled?: boolean;
	/** Explicit config boundary for deterministic hosts and tests. */
	configSource?: McpConfigSource;
	/** Explicit client boundary for stdio/HTTP implementations and tests. */
	clientFactory?: McpClientFactory;
}

export interface CodingAgentMcpSupervisorComposition {
	readonly supervisor: McpServerSupervisor;
	readonly configSource: McpConfigSource;
	readonly agentDir: string;
	readonly debug: boolean;
}

/** Compose product paths and the OAuth-aware client around the generic Runtime supervisor. */
export function createCodingAgentMcpSupervisor(
	options: CodingAgentMcpSupervisorOptions = {},
	onDiagnostic?: (message: string) => void,
): CodingAgentMcpSupervisorComposition {
	const projectRoot = options.projectRoot || process.cwd();
	const agentDir = options.agentDir || getAgentDir();
	const debug = options.debug || false;
	const configSource = options.configSource ?? new McpConfigLoader(projectRoot, agentDir);
	const clientFactory = options.clientFactory ?? createMcpClient;
	const supervisor = new McpServerSupervisor({
		configSource,
		clientFactory: (name, config, clientOptions) =>
			clientFactory(name, config, {
				debug: clientOptions?.debug,
				timeout: clientOptions?.timeout,
				agentDir,
			}),
		protocolVersion: MCP_PROTOCOL_VERSION,
		clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
		enabled: options.enabled,
		debug,
		onDiagnostic,
	});
	return { supervisor, configSource, agentDir, debug };
}

import {
	isHttpServerConfig,
	type McpClientHandle,
	type McpServerConfig,
	StdioMcpClient,
	type StdioMcpClientOptions,
} from "@vetta/runtime-mcp";
import { HttpMcpClient } from "./mcp-http-client.js";

export type { McpClientHandle };
export type McpClientOptions = StdioMcpClientOptions;

/** @deprecated The stdio client now lives in @vetta/runtime-mcp. */
export class McpClient extends StdioMcpClient {}

/** @deprecated Compatibility factory retaining the existing OAuth product adapter. */
export function createMcpClient(
	name: string,
	config: McpServerConfig,
	options?: { debug?: boolean; timeout?: number; agentDir?: string },
): McpClientHandle {
	if (isHttpServerConfig(config)) {
		return new HttpMcpClient({
			name,
			config,
			debug: options?.debug,
			timeout: options?.timeout,
			agentDir: options?.agentDir,
		});
	}
	return new McpClient({ name, config, debug: options?.debug, timeout: options?.timeout });
}

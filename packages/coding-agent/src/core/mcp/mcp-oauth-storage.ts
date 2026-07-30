/**
 * Persistent OAuth credentials for remote MCP servers.
 *
 * Stored separately from mcp.json under:
 *   ~/.vetta/agent/mcp-auth/<serverName>.json
 *
 * Never put access/refresh tokens into mcp.json.
 */

import { join } from "node:path";
import { FileMcpOAuthStateStore, type McpOAuthStoredState } from "@vetta/runtime-mcp";
import { getAgentDir } from "../../config.js";

export type { McpOAuthStoredState } from "@vetta/runtime-mcp";

export function getMcpAuthDir(agentDir: string = getAgentDir()): string {
	return join(agentDir, "mcp-auth");
}

export function getMcpAuthPath(serverName: string, agentDir: string = getAgentDir()): string {
	return createFileStore(agentDir).getPath(serverName);
}

export function loadMcpOAuthState(
	serverName: string,
	agentDir: string = getAgentDir(),
): McpOAuthStoredState | undefined {
	return createFileStore(agentDir).load(serverName);
}

export function saveMcpOAuthState(
	serverName: string,
	state: McpOAuthStoredState,
	agentDir: string = getAgentDir(),
): void {
	createFileStore(agentDir).save(serverName, state);
}

export function clearMcpOAuthState(serverName: string, agentDir: string = getAgentDir()): void {
	createFileStore(agentDir).clear(serverName);
}

/** True when we have at least an access or refresh token on disk. */
export function hasMcpOAuthTokens(serverName: string, agentDir: string = getAgentDir()): boolean {
	return createFileStore(agentDir).hasTokens(serverName);
}

function createFileStore(agentDir: string): FileMcpOAuthStateStore {
	return new FileMcpOAuthStateStore({ authDirectory: getMcpAuthDir(agentDir) });
}

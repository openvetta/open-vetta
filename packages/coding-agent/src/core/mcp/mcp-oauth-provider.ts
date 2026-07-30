/**
 * File-backed OAuthClientProvider for remote HTTP MCP servers.
 *
 * Implements the MCP SDK OAuthClientProvider contract so StreamableHTTPClientTransport
 * can discover metadata, register clients (DCR), exchange codes, and refresh tokens.
 */

import { FileMcpOAuthStateStore, McpOAuthProvider } from "@vetta/runtime-mcp";
import { getAgentDir } from "../../config.js";
import { getMcpAuthDir } from "./mcp-oauth-storage.js";

export interface FileMcpOAuthProviderOptions {
	/** mcp.json server key */
	serverName: string;
	/** MCP server endpoint URL */
	serverUrl: string;
	/** OAuth redirect URI (localhost callback) */
	redirectUri: string;
	/** Called when the user must visit the authorization URL */
	onRedirect: (authorizationUrl: URL) => void | Promise<void>;
	/** Agent config directory (default: getAgentDir()) */
	agentDir?: string;
	/** Display name for dynamic client registration */
	clientName?: string;
	/**
	 * Pre-registered OAuth client_id for servers without DCR (e.g. GitHub).
	 * When set, seeds client information so the SDK skips dynamic registration.
	 */
	clientId?: string;
}

export class FileMcpOAuthProvider extends McpOAuthProvider {
	constructor(options: FileMcpOAuthProviderOptions) {
		const agentDir = options.agentDir ?? getAgentDir();
		super({
			serverName: options.serverName,
			serverUrl: options.serverUrl,
			redirectUri: options.redirectUri,
			onRedirect: options.onRedirect,
			store: new FileMcpOAuthStateStore({ authDirectory: getMcpAuthDir(agentDir) }),
			clientName: options.clientName ?? "Vetta",
			clientId: options.clientId,
		});
	}
}

import {
	type McpHttpAuthProviderFactory,
	type McpHttpServerConfig,
	HttpMcpClient as RuntimeHttpMcpClient,
} from "@vetta/runtime-mcp";
import { getAgentDir } from "../../config.js";
import { FileMcpOAuthProvider } from "./mcp-oauth-provider.js";
import { hasMcpOAuthTokens, loadMcpOAuthState } from "./mcp-oauth-storage.js";

export { isMcpAuthRequiredError, McpAuthRequiredError } from "@vetta/runtime-mcp";

export interface HttpMcpClientOptions {
	config: McpHttpServerConfig;
	name: string;
	debug?: boolean;
	timeout?: number;
	agentDir?: string;
}

/** @deprecated Product credential-path wrapper for the runtime HTTP client. */
export class HttpMcpClient extends RuntimeHttpMcpClient {
	constructor(options: HttpMcpClientOptions) {
		const agentDir = options.agentDir ?? getAgentDir();
		super({
			name: options.name,
			config: options.config,
			debug: options.debug,
			timeout: options.timeout,
			authProviderFactory: createFileAuthProviderFactory(agentDir),
		});
	}
}

function createFileAuthProviderFactory(agentDir: string): McpHttpAuthProviderFactory {
	return ({ serverName, config }) => {
		if (!hasMcpOAuthTokens(serverName, agentDir)) return undefined;
		return new FileMcpOAuthProvider({
			serverName,
			serverUrl: config.url,
			redirectUri: loadMcpOAuthState(serverName, agentDir)?.redirectUri ?? "http://127.0.0.1/callback",
			agentDir,
			clientId: config.oauthClientId,
			onRedirect: () => {
				// Non-interactive connections surface Unauthorized as needs_auth.
			},
		});
	};
}

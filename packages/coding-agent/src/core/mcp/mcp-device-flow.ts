/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628) for remote HTTP MCP servers.
 *
 * Used for providers that do NOT support secret-less authorization-code flow
 * (e.g. GitHub, which always requires a client_secret for the code flow but
 * allows the device flow with only a client_id). The resulting user access
 * token is stored in the shared mcp-auth storage as OAuthTokens, so the normal
 * HTTP client OAuth path attaches it as `Authorization: Bearer <token>`.
 */

import { createServer, type Server } from "node:http";
import {
	FileMcpOAuthStateStore,
	type McpDeviceCodeInfo,
	McpDeviceCodeRequestError,
	runMcpDeviceAuthorizationFlow,
} from "@vetta/runtime-mcp";
import { getAgentDir } from "../../config.js";
import { type OpenUrlHandler, openUrlInBrowser } from "./mcp-oauth-flow.js";
import { getMcpAuthDir } from "./mcp-oauth-storage.js";

export interface DeviceFlowLoginOptions {
	/** mcp.json server key */
	serverName: string;
	/** Remote MCP endpoint (e.g. https://api.githubcopilot.com/mcp/) */
	serverUrl: string;
	/** Pre-registered public client_id */
	clientId: string;
	/** Space-separated OAuth scopes to request */
	scopes?: string;
	/** Agent config directory */
	agentDir?: string;
	/** Open the verification URL (default: system browser) */
	openUrl?: OpenUrlHandler;
	/** Surface the user code / verification URL to the UI (optional) */
	onUserCode?: (info: { userCode: string; verificationUri: string }) => void | Promise<void>;
	/** Max wait for the user to authorize */
	pollTimeoutMs?: number;
}

export interface DeviceFlowLoginResult {
	serverName: string;
	serverUrl: string;
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Serve a small localhost page that shows the user code and links to the
 * provider's device page. Device responses have no pre-filled URL, so the user
 * must read the code and enter it — this page makes that reliable without any
 * renderer/IPC plumbing.
 */
async function startDeviceCodePage(info: McpDeviceCodeInfo): Promise<{ url: string; close: () => Promise<void> }> {
	const userCode = info.userCode;
	const verificationUri = info.verificationUriComplete ?? info.verificationUri;
	const code = escapeHtml(userCode);
	const uri = escapeHtml(verificationUri);
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connect GitHub</title></head>
<body style="font-family:system-ui,sans-serif;padding:2.5rem;text-align:center;background:#f6f8fa;color:#24292e">
  <h1 style="font-weight:600">Connect GitHub</h1>
  <p>Enter this code on the GitHub page, then click Authorize.</p>
  <div style="font-family:ui-monospace,monospace;font-size:2.2rem;letter-spacing:.2rem;font-weight:700;margin:1.2rem 0;padding:.8rem 1.2rem;background:#fff;border:1px solid #d0d7de;border-radius:10px;display:inline-block">${code}</div>
  <p><button id="copy" style="font-size:1rem;padding:.5rem 1rem;border:1px solid #d0d7de;border-radius:8px;background:#fff;cursor:pointer">Copy code</button></p>
  <p style="margin-top:1.5rem"><a href="${uri}" target="_blank" rel="noopener" style="display:inline-block;font-size:1.05rem;padding:.7rem 1.4rem;background:#1f883d;color:#fff;border-radius:8px;text-decoration:none">Open GitHub to authorize &rarr;</a></p>
  <p style="color:#57606a;margin-top:1.5rem">You can close this window once you have authorized in Vetta.</p>
  <script>
    navigator.clipboard && navigator.clipboard.writeText(${JSON.stringify(userCode)}).catch(() => {});
    document.getElementById('copy').addEventListener('click', () => navigator.clipboard.writeText(${JSON.stringify(userCode)}));
  </script>
</body></html>`;

	const server: Server = createServer((req, res) => {
		if (req.url === "/favicon.ico") {
			res.writeHead(404);
			res.end();
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end(html);
	});
	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Failed to bind device-code page server"));
				return;
			}
			resolve(address.port);
		});
	});
	return {
		url: `http://127.0.0.1:${port}/`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

/**
 * Run the full device authorization flow and persist the resulting user token.
 */
export async function loginMcpDeviceFlow(options: DeviceFlowLoginOptions): Promise<DeviceFlowLoginResult> {
	const agentDir = options.agentDir ?? getAgentDir();
	const openUrl = options.openUrl ?? openUrlInBrowser;
	try {
		return await runMcpDeviceAuthorizationFlow({
			serverName: options.serverName,
			serverUrl: options.serverUrl,
			clientId: options.clientId,
			scopes: options.scopes,
			pollTimeoutMs: options.pollTimeoutMs,
			fallbackIssuer: "https://github.com/login/oauth",
			store: new FileMcpOAuthStateStore({ authDirectory: getMcpAuthDir(agentDir) }),
			onUserCode: options.onUserCode,
			createPresentation: startDeviceCodePage,
			openUrl,
		});
	} catch (error) {
		if (error instanceof McpDeviceCodeRequestError && error.status === 422) {
			throw new Error(
				`Device code request failed (422) (GitHub returns 422 when Device Flow is not enabled for the OAuth/GitHub App — enable it in the app settings): ${error.bodyPreview}`,
			);
		}
		throw error;
	}
}

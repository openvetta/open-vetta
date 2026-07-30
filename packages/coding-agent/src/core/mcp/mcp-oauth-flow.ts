/**
 * Interactive OAuth login for remote HTTP MCP servers.
 *
 * Starts a localhost callback server, opens the system browser, exchanges the
 * authorization code via the MCP SDK transport, and persists tokens.
 */

import { exec } from "node:child_process";
import { createServer, type Server } from "node:http";
import {
	createMcpBrowserOAuthSdkSession,
	type McpOAuthCallbackSession,
	runMcpBrowserOAuthFlow,
} from "@vetta/runtime-mcp";
import { getAgentDir } from "../../config.js";
import { FileMcpOAuthProvider } from "./mcp-oauth-provider.js";

const CLIENT_NAME = "Vetta";
const CLIENT_VERSION = "1.0.0";
const DEFAULT_TIMEOUT_MS = 60_000;
const AUTH_WAIT_TIMEOUT_MS = 5 * 60_000;

const SUCCESS_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorization successful</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">
  <h1>Authorization successful</h1>
  <p>You can close this window and return to Vetta.</p>
  <script>setTimeout(() => window.close(), 1500)</script>
</body></html>`;

const ERROR_HTML = (message: string) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorization failed</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">
  <h1>Authorization failed</h1>
  <p>${escapeHtml(message)}</p>
  <p>You can close this window and try again in Vetta.</p>
</body></html>`;

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type OpenUrlHandler = (url: string) => void | Promise<void>;

export interface LoginHttpMcpServerOptions {
	/** mcp.json server key */
	serverName: string;
	/** Remote MCP endpoint (e.g. https://mcp.notion.com/mcp) */
	serverUrl: string;
	/** Pre-registered OAuth client_id for servers without DCR (e.g. GitHub) */
	oauthClientId?: string;
	/** Open authorization URL (default: system browser) */
	openUrl?: OpenUrlHandler;
	/** Agent config directory */
	agentDir?: string;
	/** Request timeout for MCP connect */
	timeoutMs?: number;
	/** Max wait for browser callback */
	authTimeoutMs?: number;
}

export interface LoginHttpMcpServerResult {
	serverName: string;
	serverUrl: string;
}

/**
 * Open a URL with the OS default browser.
 * Desktop may pass shell.openExternal instead.
 */
export async function openUrlInBrowser(url: string): Promise<void> {
	const platform = process.platform;
	const command =
		platform === "darwin"
			? `open ${JSON.stringify(url)}`
			: platform === "win32"
				? `cmd /c start "" ${JSON.stringify(url)}`
				: `xdg-open ${JSON.stringify(url)}`;
	await new Promise<void>((resolve, reject) => {
		exec(command, (error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

async function startOAuthCallbackServer(): Promise<McpOAuthCallbackSession> {
	let resolveCode: ((code: string) => void) | null = null;
	let rejectCode: ((error: Error) => void) | null = null;
	let settled = false;
	/** Buffer if the browser hits callback before waitForCode is attached */
	let pendingCode: string | null = null;
	let pendingError: Error | null = null;

	const settleOk = (code: string) => {
		if (settled) return;
		if (resolveCode) {
			settled = true;
			resolveCode(code);
		} else {
			pendingCode = code;
		}
	};

	const settleErr = (error: Error) => {
		if (settled) return;
		if (rejectCode) {
			settled = true;
			rejectCode(error);
		} else {
			pendingError = error;
		}
	};

	const server: Server = createServer((req, res) => {
		try {
			const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
			if (requestUrl.pathname === "/favicon.ico") {
				res.writeHead(404);
				res.end();
				return;
			}

			const code = requestUrl.searchParams.get("code");
			const error = requestUrl.searchParams.get("error");
			const errorDescription = requestUrl.searchParams.get("error_description");

			if (code) {
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(SUCCESS_HTML);
				settleOk(code);
				return;
			}

			const message = errorDescription || error || "Missing authorization code";
			res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
			res.end(ERROR_HTML(message));
			settleErr(new Error(`OAuth authorization failed: ${message}`));
		} catch (err) {
			res.writeHead(500);
			res.end("Internal error");
			settleErr(err instanceof Error ? err : new Error(String(err)));
		}
	});

	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Failed to bind OAuth callback server"));
				return;
			}
			resolve(address.port);
		});
	});

	const redirectUri = `http://127.0.0.1:${port}/callback`;

	return {
		redirectUri,
		waitForCode: (timeoutMs: number) =>
			new Promise<string>((resolve, reject) => {
				if (pendingError) {
					settled = true;
					reject(pendingError);
					return;
				}
				if (pendingCode) {
					settled = true;
					resolve(pendingCode);
					return;
				}
				if (settled) {
					reject(new Error("OAuth callback already settled"));
					return;
				}
				const timer = setTimeout(() => {
					if (!settled) {
						settled = true;
						reject(new Error("Timed out waiting for OAuth authorization in the browser"));
					}
				}, timeoutMs);
				resolveCode = (code) => {
					clearTimeout(timer);
					resolve(code);
				};
				rejectCode = (error) => {
					clearTimeout(timer);
					reject(error);
				};
			}),
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
			}),
	};
}

/**
 * Run the full browser OAuth flow for a remote HTTP MCP server and persist tokens.
 * Safe to call from desktop IPC or agent/CLI without an active session.
 */
export async function loginHttpMcpServer(options: LoginHttpMcpServerOptions): Promise<LoginHttpMcpServerResult> {
	const agentDir = options.agentDir ?? getAgentDir();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const authTimeoutMs = options.authTimeoutMs ?? AUTH_WAIT_TIMEOUT_MS;
	const openUrl = options.openUrl ?? openUrlInBrowser;
	return runMcpBrowserOAuthFlow({
		serverName: options.serverName,
		serverUrl: options.serverUrl,
		authTimeoutMs,
		createCallbackSession: startOAuthCallbackServer,
		openUrl,
		createOAuthSession: ({ redirectUri, onRedirect }) => {
			const serverUrl = options.serverUrl.trim();
			const provider = new FileMcpOAuthProvider({
				serverName: options.serverName.trim(),
				serverUrl,
				redirectUri,
				agentDir,
				clientName: CLIENT_NAME,
				clientId: options.oauthClientId,
				onRedirect,
			});
			return createMcpBrowserOAuthSdkSession({
				url: new URL(serverUrl),
				authProvider: provider,
				clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
				timeout: timeoutMs,
			});
		},
	});
}

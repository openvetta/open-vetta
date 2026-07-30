import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { afterEach, describe, expect, it, vi } from "vitest";

interface MockTransportOptions {
	authProvider?: OAuthClientProvider;
	fetch?: typeof fetch;
}

interface MockTransport {
	options: MockTransportOptions;
}

const sdk = vi.hoisted(() => ({
	connectMode: "authorized" as "authorized" | "authorization_required" | "error",
	connectCalls: 0,
	closeCalls: 0,
	finishCodes: [] as string[],
	transports: [] as MockTransport[],
}));

vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
	UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", async () => {
	const { UnauthorizedError } = await import("@modelcontextprotocol/sdk/client/auth.js");
	return {
		Client: class Client {
			async connect(transport: MockTransport): Promise<void> {
				sdk.connectCalls += 1;
				if (sdk.connectCalls !== 1) return;
				if (sdk.connectMode === "error") throw new Error("connect failed");
				if (sdk.connectMode === "authorization_required") {
					await transport.options.authProvider?.redirectToAuthorization(new URL("https://auth.test/authorize"));
					throw new UnauthorizedError("authorization required");
				}
			}

			async close(): Promise<void> {
				sdk.closeCalls += 1;
			}
		},
	};
});

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: class StreamableHTTPClientTransport {
		readonly options: MockTransportOptions;

		constructor(_url: URL, options: MockTransportOptions) {
			this.options = options;
			sdk.transports.push(this);
		}

		async finishAuth(code: string): Promise<void> {
			sdk.finishCodes.push(code);
		}
	},
}));

import { loginMcpDeviceFlow } from "../src/core/mcp/mcp-device-flow.js";
import { loginHttpMcpServer } from "../src/core/mcp/mcp-oauth-flow.js";
import { loadMcpOAuthState } from "../src/core/mcp/mcp-oauth-storage.js";

describe("interactive MCP OAuth compatibility behavior", () => {
	const temporaryDirectories: string[] = [];
	const systemFetch = globalThis.fetch;

	afterEach(async () => {
		vi.unstubAllGlobals();
		sdk.connectMode = "authorized";
		sdk.connectCalls = 0;
		sdk.closeCalls = 0;
		sdk.finishCodes = [];
		sdk.transports = [];
		await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});

	it("completes browser authorization through callback and verifies the new tokens", async () => {
		const agentDir = await createAgentDir();
		sdk.connectMode = "authorization_required";
		let openedUrl: string | undefined;

		await expect(
			loginHttpMcpServer({
				serverName: "remote",
				serverUrl: "https://example.test/mcp",
				agentDir,
				openUrl: async (url) => {
					openedUrl = url;
					const provider = sdk.transports[0]?.options.authProvider;
					if (!provider?.redirectUrl) throw new Error("Missing callback redirect URL");
					await systemFetch(`${provider.redirectUrl}?code=authorization-code`);
				},
			}),
		).resolves.toEqual({ serverName: "remote", serverUrl: "https://example.test/mcp" });

		expect(openedUrl).toBe("https://auth.test/authorize");
		expect(sdk.finishCodes).toEqual(["authorization-code"]);
		expect(sdk.connectCalls).toBe(2);
		expect(sdk.closeCalls).toBe(1);
	});

	it("returns immediately for existing authorization and propagates non-auth connection errors", async () => {
		const agentDir = await createAgentDir();
		const openUrl = vi.fn();
		await expect(
			loginHttpMcpServer({
				serverName: "remote",
				serverUrl: "https://example.test/mcp",
				agentDir,
				openUrl,
			}),
		).resolves.toEqual({ serverName: "remote", serverUrl: "https://example.test/mcp" });
		expect(openUrl).not.toHaveBeenCalled();
		expect(sdk.closeCalls).toBe(1);

		sdk.connectMode = "error";
		sdk.connectCalls = 0;
		await expect(
			loginHttpMcpServer({
				serverName: "remote",
				serverUrl: "https://example.test/mcp",
				agentDir,
				openUrl,
			}),
		).rejects.toThrow("connect failed");
	});

	it("preserves browser callback denial and timeout errors", async () => {
		const agentDir = await createAgentDir();
		sdk.connectMode = "authorization_required";
		await expect(
			loginHttpMcpServer({
				serverName: "remote",
				serverUrl: "https://example.test/mcp",
				agentDir,
				openUrl: async () => {
					const provider = sdk.transports[0]?.options.authProvider;
					if (!provider?.redirectUrl) throw new Error("Missing callback redirect URL");
					await systemFetch(`${provider.redirectUrl}?error=access_denied&error_description=User%20denied`);
				},
			}),
		).rejects.toThrow("OAuth authorization failed: User denied");

		sdk.connectCalls = 0;
		sdk.transports = [];
		await expect(
			loginHttpMcpServer({
				serverName: "remote",
				serverUrl: "https://example.test/mcp",
				agentDir,
				authTimeoutMs: 1,
				openUrl: () => undefined,
			}),
		).rejects.toThrow("Timed out waiting for OAuth authorization in the browser");
	});

	it("discovers, presents and persists a successful device authorization", async () => {
		const agentDir = await createAgentDir();
		const networkRequests: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request) => {
			const url = String(input);
			networkRequests.push(url);
			if (url.includes("oauth-protected-resource")) {
				return jsonResponse({ authorization_servers: ["https://issuer.test/oauth/"] });
			}
			if (url === "https://issuer.test/oauth/device/code") {
				return jsonResponse({
					device_code: "device-code",
					user_code: "USER-CODE",
					verification_uri: "https://issuer.test/verify",
					expires_in: 30,
					interval: 1,
				});
			}
			if (url === "https://issuer.test/oauth/access_token") {
				return jsonResponse({ access_token: "device-access", token_type: "bearer", scope: "repo" });
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		let pageHtml = "";
		const userCodes: Array<{ userCode: string; verificationUri: string }> = [];

		await expect(
			loginMcpDeviceFlow({
				serverName: "remote",
				serverUrl: "https://example.test/mcp",
				clientId: "client-id",
				scopes: "repo",
				agentDir,
				onUserCode: (info) => {
					userCodes.push(info);
				},
				openUrl: async (url) => {
					pageHtml = await (await systemFetch(url)).text();
				},
			}),
		).resolves.toEqual({ serverName: "remote", serverUrl: "https://example.test/mcp" });

		expect(networkRequests).toEqual([
			"https://example.test/.well-known/oauth-protected-resource/mcp",
			"https://issuer.test/oauth/device/code",
			"https://issuer.test/oauth/access_token",
		]);
		expect(userCodes).toEqual([{ userCode: "USER-CODE", verificationUri: "https://issuer.test/verify" }]);
		expect(pageHtml).toContain("USER-CODE");
		expect(loadMcpOAuthState("remote", agentDir)).toMatchObject({
			serverUrl: "https://example.test/mcp",
			redirectUri: "http://127.0.0.1/callback",
			clientInformation: { client_id: "client-id" },
			tokens: { access_token: "device-access", token_type: "bearer", scope: "repo" },
		});
	});

	it("preserves the GitHub-specific 422 device-flow guidance", async () => {
		const agentDir = await createAgentDir();
		vi.stubGlobal("fetch", async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes("oauth-protected-resource")) return new Response("missing", { status: 404 });
			return new Response("unprocessable", { status: 422 });
		});

		await expect(
			loginMcpDeviceFlow({
				serverName: "remote",
				serverUrl: "https://example.test/mcp",
				clientId: "client-id",
				agentDir,
				openUrl: () => undefined,
			}),
		).rejects.toThrow(
			"Device code request failed (422) (GitHub returns 422 when Device Flow is not enabled for the OAuth/GitHub App — enable it in the app settings): unprocessable",
		);
	});

	async function createAgentDir(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "coding-agent-interactive-oauth-"));
		temporaryDirectories.push(root);
		return root;
	}
});

function jsonResponse(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileMcpOAuthProvider } from "../src/core/mcp/mcp-oauth-provider.js";
import {
	clearMcpOAuthState,
	getMcpAuthPath,
	hasMcpOAuthTokens,
	loadMcpOAuthState,
	saveMcpOAuthState,
} from "../src/core/mcp/mcp-oauth-storage.js";

describe("MCP OAuth compatibility behavior", () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});

	it("preserves file naming, tolerant loading, timestamps and token detection", async () => {
		expect(FileMcpOAuthProvider.name).toBe("FileMcpOAuthProvider");
		const agentDir = await createAgentDir();
		const path = getMcpAuthPath(" remote server/one ", agentDir);
		expect(path).toBe(join(agentDir, "mcp-auth", "remote_server_one.json"));

		saveMcpOAuthState(
			" remote server/one ",
			{
				serverUrl: "https://example.test/mcp",
				tokens: { access_token: "access", refresh_token: "refresh", token_type: "Bearer" },
			},
			agentDir,
		);
		const storedText = await readFile(path, "utf8");
		expect(storedText.endsWith("\n")).toBe(true);
		expect(loadMcpOAuthState(" remote server/one ", agentDir)).toMatchObject({
			serverUrl: "https://example.test/mcp",
			tokens: { access_token: "access", refresh_token: "refresh" },
			updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
		});
		expect(hasMcpOAuthTokens(" remote server/one ", agentDir)).toBe(true);

		await writeJson(path, { serverUrl: "https://example.test/mcp", tokens: { refresh_token: "refresh-only" } });
		expect(hasMcpOAuthTokens(" remote server/one ", agentDir)).toBe(true);
		await writeFile(path, "{broken", "utf8");
		expect(loadMcpOAuthState(" remote server/one ", agentDir)).toBeUndefined();
		await writeJson(path, { tokens: { access_token: "orphan" } });
		expect(loadMcpOAuthState(" remote server/one ", agentDir)).toBeUndefined();

		clearMcpOAuthState(" remote server/one ", agentDir);
		expect(loadMcpOAuthState(" remote server/one ", agentDir)).toBeUndefined();
	});

	it("keeps stored credentials for placeholder redirects and resets a changed server binding", async () => {
		const agentDir = await createAgentDir();
		saveMcpOAuthState(
			"remote",
			{
				serverUrl: "https://old.test/mcp",
				redirectUri: "http://127.0.0.1:4100/callback",
				clientInformation: { client_id: "registered" },
				tokens: { access_token: "access", token_type: "Bearer" },
			},
			agentDir,
		);

		const connecting = createProvider({
			agentDir,
			serverUrl: "https://old.test/mcp",
			redirectUri: "http://127.0.0.1/callback",
		});
		expect(connecting.redirectUrl).toBe("http://127.0.0.1:4100/callback");
		expect(connecting.clientInformation()).toEqual({ client_id: "registered" });
		expect(connecting.tokens()).toMatchObject({ access_token: "access" });

		createProvider({ agentDir, serverUrl: "https://new.test/mcp" });
		expect(loadMcpOAuthState("remote", agentDir)).toMatchObject({
			serverUrl: "https://new.test/mcp",
			redirectUri: "http://127.0.0.1:4200/callback",
		});
		expect(loadMcpOAuthState("remote", agentDir)?.clientInformation).toBeUndefined();
		expect(loadMcpOAuthState("remote", agentDir)?.tokens).toBeUndefined();
	});

	it("re-registers DCR clients on an interactive redirect change without dropping tokens", async () => {
		const agentDir = await createAgentDir();
		saveMcpOAuthState(
			"remote",
			{
				serverUrl: "https://example.test/mcp",
				redirectUri: "http://127.0.0.1:4100/callback",
				clientInformation: { client_id: "dynamic" },
				tokens: { access_token: "access", token_type: "Bearer" },
				discoveryState: { authorizationServerUrl: "https://auth.test" },
			},
			agentDir,
		);

		const provider = createProvider({ agentDir });
		expect(provider.redirectUrl).toBe("http://127.0.0.1:4200/callback");
		expect(provider.clientInformation()).toBeUndefined();
		expect(provider.tokens()).toMatchObject({ access_token: "access" });
		expect(provider.discoveryState()).toBeUndefined();

		const stableClient = createProvider({
			agentDir,
			redirectUri: "http://127.0.0.1:4300/callback",
			clientId: "stable",
		});
		expect(stableClient.clientInformation()).toEqual({ client_id: "stable" });
	});

	it("preserves refresh tokens, clears PKCE after exchange and delegates redirects", async () => {
		const agentDir = await createAgentDir();
		let redirectedTo: string | undefined;
		const provider = createProvider({
			agentDir,
			onRedirect: (url) => {
				redirectedTo = url.toString();
			},
		});

		await expect(provider.codeVerifier()).rejects.toThrow("No PKCE code verifier stored");
		await provider.saveCodeVerifier("pkce");
		expect(await provider.codeVerifier()).toBe("pkce");
		await provider.saveTokens({ access_token: "first", refresh_token: "refresh", token_type: "Bearer" });
		await provider.saveCodeVerifier("second-pkce");
		await provider.saveTokens({ access_token: "second", token_type: "Bearer" });
		expect(provider.tokens()).toEqual({ access_token: "second", refresh_token: "refresh", token_type: "Bearer" });
		await expect(provider.codeVerifier()).rejects.toThrow("No PKCE code verifier stored");

		await provider.redirectToAuthorization(new URL("https://auth.test/authorize"));
		expect(redirectedTo).toBe("https://auth.test/authorize");
	});

	it("invalidates individual credential scopes and the complete persisted state", async () => {
		const agentDir = await createAgentDir();
		const provider = createProvider({ agentDir, clientId: "stable" });
		await provider.saveTokens({ access_token: "access", token_type: "Bearer" });
		await provider.saveCodeVerifier("pkce");
		await provider.saveDiscoveryState({ authorizationServerUrl: "https://auth.test" });

		await provider.invalidateCredentials("tokens");
		expect(provider.tokens()).toBeUndefined();
		await provider.invalidateCredentials("verifier");
		await expect(provider.codeVerifier()).rejects.toThrow("No PKCE code verifier stored");
		await provider.invalidateCredentials("discovery");
		expect(provider.discoveryState()).toBeUndefined();
		await provider.invalidateCredentials("client");
		expect(provider.clientInformation()).toBeUndefined();

		await provider.invalidateCredentials("all");
		expect(loadMcpOAuthState("remote", agentDir)).toBeUndefined();
		expect(provider.redirectUrl).toBe("http://127.0.0.1:4200/callback");
	});

	async function createAgentDir(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "coding-agent-mcp-oauth-"));
		temporaryDirectories.push(root);
		return root;
	}
});

interface ProviderOverrides {
	agentDir: string;
	serverUrl?: string;
	redirectUri?: string;
	clientId?: string;
	onRedirect?: (authorizationUrl: URL) => void | Promise<void>;
}

function createProvider(overrides: ProviderOverrides): FileMcpOAuthProvider {
	return new FileMcpOAuthProvider({
		serverName: "remote",
		serverUrl: overrides.serverUrl ?? "https://example.test/mcp",
		redirectUri: overrides.redirectUri ?? "http://127.0.0.1:4200/callback",
		clientId: overrides.clientId,
		agentDir: overrides.agentDir,
		onRedirect: overrides.onRedirect ?? (() => undefined),
	});
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(value), "utf8");
}

import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
	browserLogin: vi.fn(async () => ({ serverName: "browser", serverUrl: "https://browser.test/mcp" })),
	deviceLogin: vi.fn(async () => ({ serverName: "device", serverUrl: "https://device.test/mcp" })),
}));

vi.mock("../src/core/mcp/mcp-oauth-flow.js", () => ({
	loginHttpMcpServer: auth.browserLogin,
}));

vi.mock("../src/core/mcp/mcp-device-flow.js", () => ({
	loginMcpDeviceFlow: auth.deviceLogin,
}));

import {
	type IMcpClient,
	type McpClientFactory,
	type McpClientHandle,
	type McpConfig,
	type McpConfigSource,
	McpManager,
	type McpResourceReadResult,
	type McpServerConfig,
	type McpToolCallResult,
} from "../src/core/mcp/index.js";
import { McpAuthRequiredError } from "../src/core/mcp/mcp-http-client.js";

describe("MCP manager behavior", () => {
	it("isolates ready, failed, auth-required and disabled server initialization", async () => {
		const source = new MutableConfigSource({
			mcpServers: {
				ready: { command: "ready" },
				broken: { command: "broken" },
				auth: { type: "http", url: "https://auth.test/mcp" },
				disabled: { command: "disabled", disabled: true },
			},
		});
		const clients = new FakeClientFactory({
			broken: new Error("startup failed"),
			auth: new McpAuthRequiredError("auth", "https://auth.test/mcp"),
		});
		const manager = new McpManager({ configSource: source, clientFactory: clients.create });

		await manager.initialize();

		expect(manager.getServer("ready")?.status).toBe("ready");
		expect(manager.getServer("ready")?.tools.map(({ name }) => name)).toEqual(["tool-ready"]);
		expect(manager.getServer("broken")).toMatchObject({ status: "error", error: "startup failed" });
		expect(manager.getServer("auth")).toMatchObject({ status: "needs_auth" });
		expect(manager.getServer("auth")?.client).toBeUndefined();
		expect(manager.getServer("disabled")).toBeUndefined();
		expect(manager.getTools().map(({ name }) => name)).toEqual(["mcp_ready_tool-ready"]);
	});

	it("diff-reloads only added, changed and removed servers", async () => {
		const source = new MutableConfigSource({ mcpServers: { stable: { command: "one" } } });
		const clients = new FakeClientFactory();
		const manager = new McpManager({ configSource: source, clientFactory: clients.create });
		await manager.initialize();
		const firstStable = manager.getServer("stable")?.client;

		expect(await manager.reloadIfChanged()).toBe(false);
		expect(clients.createdNames).toEqual(["stable"]);

		source.setConfig({
			mcpServers: {
				stable: { command: "one" },
				added: { command: "added" },
			},
		});
		expect(await manager.reloadIfChanged()).toBe(true);
		expect(manager.getServer("stable")?.client).toBe(firstStable);
		expect(clients.createdNames).toEqual(["stable", "added"]);

		const firstAdded = clients.latest("added");
		source.setConfig({
			mcpServers: {
				stable: { command: "two" },
				added: { command: "added" },
			},
		});
		expect(await manager.reloadIfChanged()).toBe(true);
		expect(clients.first("stable").closeCalls).toBe(1);
		expect(manager.getServer("stable")?.client).not.toBe(firstStable);
		expect(manager.getServer("added")?.client).toBe(firstAdded);

		source.setConfig({ mcpServers: { stable: { command: "two" } } });
		expect(await manager.reloadIfChanged()).toBe(true);
		expect(firstAdded.closeCalls).toBe(1);
		expect(manager.getServer("added")).toBeUndefined();
	});

	it("keeps the current running set when a changed config cannot be loaded", async () => {
		const source = new MutableConfigSource({ mcpServers: { stable: { command: "one" } } });
		const clients = new FakeClientFactory();
		const manager = new McpManager({ configSource: source, clientFactory: clients.create });
		await manager.initialize();
		const stable = manager.getServer("stable")?.client;
		source.failNextLoad();

		expect(await manager.reloadIfChanged()).toBe(false);
		expect(manager.getServer("stable")?.client).toBe(stable);
		expect(clients.first("stable").closeCalls).toBe(0);
	});

	it("treats plugin server ordering as unchanged and reconciles real changes", async () => {
		const source = new MutableConfigSource({ mcpServers: {} });
		const clients = new FakeClientFactory();
		const manager = new McpManager({ configSource: source, clientFactory: clients.create });
		await manager.initialize();
		const first = [
			{ runtimeName: "plugin-alpha-docs", config: { command: "alpha" } },
			{ runtimeName: "plugin-beta-docs", config: { command: "beta" } },
		] satisfies Array<{ runtimeName: string; config: McpServerConfig }>;

		expect(await manager.setPluginServers(first)).toBe(true);
		expect(await manager.setPluginServers([...first].reverse())).toBe(false);
		expect(clients.createdNames).toEqual(["plugin-alpha-docs", "plugin-beta-docs"]);

		expect(
			await manager.setPluginServers([{ runtimeName: "plugin-alpha-docs", config: { command: "alpha-v2" } }]),
		).toBe(true);
		expect(clients.first("plugin-alpha-docs").closeCalls).toBe(1);
		expect(clients.first("plugin-beta-docs").closeCalls).toBe(1);
		expect(manager.getServer("plugin-beta-docs")).toBeUndefined();
	});

	it("closes every client and clears state even when one close fails", async () => {
		const source = new MutableConfigSource({
			mcpServers: { first: { command: "first" }, second: { command: "second" } },
		});
		const clients = new FakeClientFactory({}, new Set(["first"]));
		const manager = new McpManager({ configSource: source, clientFactory: clients.create });
		await manager.initialize();

		await expect(manager.shutdown()).resolves.toBeUndefined();
		expect(clients.first("first").closeCalls).toBe(1);
		expect(clients.first("second").closeCalls).toBe(1);
		expect(manager.getServers()).toEqual([]);
	});

	it("keeps servers ready when optional tool or resource discovery fails", async () => {
		const source = new MutableConfigSource({
			mcpServers: { toolsFail: { command: "tools" }, resourcesFail: { command: "resources" } },
		});
		const clients = new FakeClientFactory({}, new Set(), new Set(["toolsFail"]), new Set(["resourcesFail"]));
		const manager = new McpManager({ configSource: source, clientFactory: clients.create });

		await manager.initialize();

		expect(manager.getServer("toolsFail")).toMatchObject({
			status: "ready",
			tools: [],
			resources: [{ name: "toolsFail" }],
		});
		expect(manager.getServer("resourcesFail")).toMatchObject({
			status: "ready",
			tools: [{ name: "tool-resourcesFail" }],
			resources: [],
		});
	});

	it("preserves enable, disable, global enabled flag and read projections", async () => {
		const source = new MutableConfigSource({
			mcpServers: { ready: { command: "ready", autoApprove: ["tool-ready"] } },
		});
		const clients = new FakeClientFactory();
		const manager = new McpManager({ configSource: source, clientFactory: clients.create });
		await manager.initialize();

		expect(manager.getStats()).toEqual({
			totalServers: 1,
			readyServers: 1,
			errorServers: 0,
			totalTools: 1,
			totalResources: 1,
		});
		expect(manager.getServersByStatus().ready.map(({ name }) => name)).toEqual(["ready"]);
		expect(manager.shouldAutoApprove("ready", "tool-ready")).toBe(true);
		expect(manager.shouldAutoApprove("missing", "tool-ready")).toBe(false);
		expect(manager.getState().servers).not.toBe(manager.getState().servers);

		await manager.disableServer("ready");
		expect(manager.getServer("ready")).toMatchObject({ status: "stopped", config: { disabled: true } });
		expect(clients.first("ready").closeCalls).toBe(1);
		await manager.enableServer("ready");
		expect(manager.getServer("ready")).toMatchObject({ status: "ready", config: { disabled: false } });
		expect(clients.createdNames).toEqual(["ready", "ready"]);

		manager.setEnabled(false);
		expect(manager.isEnabled()).toBe(false);
		expect(clients.latest("ready").closeCalls).toBe(0);
	});

	it("preserves plugin servers across full reload", async () => {
		const source = new MutableConfigSource({ mcpServers: {} });
		const clients = new FakeClientFactory();
		const manager = new McpManager({ configSource: source, clientFactory: clients.create });
		await manager.initialize();
		await manager.setPluginServers([{ runtimeName: "plugin-alpha-docs", config: { command: "alpha" } }]);

		await manager.reload();

		expect(manager.getServer("plugin-alpha-docs")?.status).toBe("ready");
		expect(clients.createdNames).toEqual(["plugin-alpha-docs", "plugin-alpha-docs"]);
		expect(clients.first("plugin-alpha-docs").closeCalls).toBe(1);
	});

	it("delegates browser and device login, reconnects, then clears logout state", async () => {
		auth.browserLogin.mockClear();
		auth.deviceLogin.mockClear();
		const source = new MutableConfigSource({
			mcpServers: {
				browser: { type: "http", url: "https://browser.test/mcp", oauthClientId: "browser-id" },
				device: {
					type: "http",
					url: "https://device.test/mcp",
					oauthClientId: "device-id",
					oauthDeviceFlow: true,
					oauthScopes: "repo",
				},
			},
		});
		const clients = new FakeClientFactory();
		const manager = new McpManager({
			configSource: source,
			clientFactory: clients.create,
			agentDir: "C:/manager-auth-test",
		});
		await manager.initialize();
		const openUrl = vi.fn();

		await manager.loginServer("browser", { openUrl });
		await manager.loginServer("device", { openUrl });

		expect(auth.browserLogin).toHaveBeenCalledWith({
			serverName: "browser",
			serverUrl: "https://browser.test/mcp",
			oauthClientId: "browser-id",
			agentDir: "C:/manager-auth-test",
			openUrl,
		});
		expect(auth.deviceLogin).toHaveBeenCalledWith({
			serverName: "device",
			serverUrl: "https://device.test/mcp",
			clientId: "device-id",
			scopes: "repo",
			agentDir: "C:/manager-auth-test",
			openUrl,
		});
		expect(clients.createdNames).toEqual(["browser", "device", "browser", "device"]);

		await manager.logoutServer("browser");
		expect(manager.getServer("browser")).toMatchObject({
			status: "needs_auth",
			error: "OAuth credentials cleared",
			tools: [],
			resources: [],
		});
		expect(manager.getServer("browser")?.client).toBeUndefined();
	});
});

class MutableConfigSource implements McpConfigSource {
	private signatureRevision = 0;
	private failLoad = false;

	constructor(private config: McpConfig) {}

	loadGlobal(): McpConfig | null {
		return this.config;
	}

	loadProject(): McpConfig | null {
		return null;
	}

	loadMerged(): McpConfig {
		if (this.failLoad) {
			this.failLoad = false;
			throw new Error("invalid changed config");
		}
		return this.config;
	}

	getMergedSignature(): string {
		return `config:${this.signatureRevision}`;
	}

	getConfigPaths(): { readonly global: string; readonly project: string } {
		return { global: "global-mcp.json", project: "project-mcp.json" };
	}

	setConfig(config: McpConfig): void {
		this.config = config;
		this.signatureRevision += 1;
	}

	failNextLoad(): void {
		this.failLoad = true;
		this.signatureRevision += 1;
	}
}

class FakeClientFactory {
	readonly create: McpClientFactory;
	readonly clients: FakeMcpClient[] = [];

	constructor(
		private readonly initializeErrors: Readonly<Record<string, Error>> = {},
		private readonly closeErrors: ReadonlySet<string> = new Set(),
		private readonly toolListErrors: ReadonlySet<string> = new Set(),
		private readonly resourceListErrors: ReadonlySet<string> = new Set(),
	) {
		this.create = (name) => {
			const client = new FakeMcpClient(
				name,
				this.initializeErrors[name],
				this.closeErrors.has(name),
				this.toolListErrors.has(name),
				this.resourceListErrors.has(name),
			);
			this.clients.push(client);
			return client;
		};
	}

	get createdNames(): string[] {
		return this.clients.map(({ name }) => name);
	}

	first(name: string): FakeMcpClient {
		const client = this.clients.find((candidate) => candidate.name === name);
		if (!client) throw new Error(`Missing fake client: ${name}`);
		return client;
	}

	latest(name: string): FakeMcpClient {
		const client = this.clients
			.slice()
			.reverse()
			.find((candidate) => candidate.name === name);
		if (!client) throw new Error(`Missing fake client: ${name}`);
		return client;
	}
}

class FakeMcpClient implements McpClientHandle, IMcpClient {
	closeCalls = 0;

	constructor(
		readonly name: string,
		private readonly initializeError: Error | undefined,
		private readonly closeError: boolean,
		private readonly toolListError: boolean,
		private readonly resourceListError: boolean,
	) {}

	async initialize() {
		if (this.initializeError) throw this.initializeError;
		return {
			protocolVersion: "2024-11-05",
			serverInfo: { name: this.name, version: "test" },
			capabilities: { tools: {}, resources: {} },
		};
	}

	async listTools() {
		if (this.toolListError) throw new Error(`tool list failed: ${this.name}`);
		return {
			tools: [{ name: `tool-${this.name}`, description: this.name, inputSchema: { type: "object" as const } }],
		};
	}

	async callTool(): Promise<McpToolCallResult> {
		return { content: [{ type: "text", text: this.name }] };
	}

	async listResources() {
		if (this.resourceListError) throw new Error(`resource list failed: ${this.name}`);
		return { resources: [{ uri: `test://${this.name}`, name: this.name }] };
	}

	async readResource(): Promise<McpResourceReadResult> {
		return { contents: [] };
	}

	async listPrompts() {
		return { prompts: [] };
	}

	async close(): Promise<void> {
		this.closeCalls += 1;
		if (this.closeError) throw new Error(`close failed: ${this.name}`);
	}

	getName(): string {
		return this.name;
	}

	getPid(): number | undefined {
		return undefined;
	}

	isClientInitialized(): boolean {
		return this.initializeError === undefined;
	}
}

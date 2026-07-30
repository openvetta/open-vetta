import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import {
	createMcpServerRuntimeToolSource,
	McpAuthRequiredError,
	type McpClientHandle,
	type McpRuntimeToolSource,
	type McpRuntimeToolView,
	type McpServerSupervisor,
	type McpToolCallResult,
} from "@vetta/runtime-mcp";
import { describe, expect, it } from "vitest";
import {
	adaptLegacyMcpManagerRuntimeToolSource,
	decorateCodingAgentMcpRuntimeTool,
	type EcosystemHookAwareRuntimeTool,
} from "../src/adapters/runtime-core/greenfield.js";
import type { McpClientFactory, McpConfig, McpConfigSource, McpResourceReadResult } from "../src/core/mcp/index.js";
import { McpManager } from "../src/core/mcp/mcp-manager.js";
import { createCodingAgentMcpSupervisor } from "../src/core/mcp/mcp-supervisor-composition.js";

describe("MCP runtime cutover differential", () => {
	it("keeps startup state, model-visible tool definitions and execution results equivalent", async () => {
		const config: McpConfig = {
			mcpServers: {
				ready: { command: "ready" },
				"call-error": { command: "call-error" },
				broken: { command: "broken" },
				auth: { type: "http", url: "https://auth.test/mcp" },
				disabled: { command: "disabled", disabled: true },
				"tools-fail": { command: "tools-fail" },
			},
		};
		const legacyClients = new FakeClientFactory({
			initializeErrors: {
				broken: new Error("startup failed"),
				auth: new McpAuthRequiredError("auth", "https://auth.test/mcp"),
			},
			toolListErrors: new Set(["tools-fail"]),
			callErrors: new Set(["call-error"]),
		});
		const nativeClients = new FakeClientFactory({
			initializeErrors: {
				broken: new Error("startup failed"),
				auth: new McpAuthRequiredError("auth", "https://auth.test/mcp"),
			},
			toolListErrors: new Set(["tools-fail"]),
			callErrors: new Set(["call-error"]),
		});
		const harness = await createHarness(config, legacyClients, nativeClients);

		try {
			expect(projectLegacyServers(harness.legacyManager)).toEqual(projectNativeServers(harness.nativeSupervisor));

			const [legacyView, nativeView] = await Promise.all([
				harness.legacySource.refresh(),
				harness.nativeSource.refresh(),
			]);
			expect(projectTools(legacyView)).toEqual(projectTools(nativeView));
			expect(projectTools(nativeView).map(({ name }) => name)).toEqual([
				"mcp_call-error_tool-call-error",
				"mcp_ready_tool-ready",
			]);

			for (const toolName of ["mcp_ready_tool-ready", "mcp_call-error_tool-call-error"]) {
				const legacyTool = findTool(legacyView, toolName);
				const nativeTool = findTool(nativeView, toolName);
				const request = {
					sessionId: "session",
					turnId: "turn",
					toolCallId: `call-${toolName}`,
					input: { query: "value" },
					signal: new AbortController().signal,
				};
				expect(await nativeTool.execute(request)).toEqual(await legacyTool.execute(request));
			}
		} finally {
			await harness.dispose();
		}
	});

	it("keeps file reconciliation, failed reload retention and client ownership equivalent", async () => {
		const initial: McpConfig = {
			mcpServers: {
				stable: { command: "stable" },
				changed: { command: "changed-v1" },
				removed: { command: "removed" },
			},
		};
		const legacyClients = new FakeClientFactory();
		const nativeClients = new FakeClientFactory();
		const harness = await createHarness(initial, legacyClients, nativeClients);

		try {
			const legacyStable = legacyClients.first("stable");
			const nativeStable = nativeClients.first("stable");
			const next: McpConfig = {
				mcpServers: {
					stable: { command: "stable" },
					changed: { command: "changed-v2" },
					added: { command: "added" },
				},
			};
			harness.legacyConfig.setConfig(next);
			harness.nativeConfig.setConfig(next);

			const [legacyView, nativeView] = await Promise.all([
				harness.legacySource.refresh(),
				harness.nativeSource.refresh(),
			]);

			expect(projectTools(legacyView)).toEqual(projectTools(nativeView));
			expect(projectLegacyServers(harness.legacyManager)).toEqual(projectNativeServers(harness.nativeSupervisor));
			expect(legacyClients.createdNames).toEqual(nativeClients.createdNames);
			expect(legacyClients.first("stable")).toBe(legacyStable);
			expect(nativeClients.first("stable")).toBe(nativeStable);
			expect(legacyClients.first("removed").closeCalls).toBe(1);
			expect(nativeClients.first("removed").closeCalls).toBe(1);
			expect(legacyClients.first("changed").closeCalls).toBe(1);
			expect(nativeClients.first("changed").closeCalls).toBe(1);

			const retainedTools = projectTools(legacyView);
			harness.legacyConfig.failNextLoad();
			harness.nativeConfig.failNextLoad();
			const [legacyRetained, nativeRetained] = await Promise.all([
				harness.legacySource.refresh(),
				harness.nativeSource.refresh(),
			]);

			expect(projectTools(legacyRetained)).toEqual(retainedTools);
			expect(projectTools(nativeRetained)).toEqual(retainedTools);
			expect(legacyClients.first("stable").closeCalls).toBe(0);
			expect(nativeClients.first("stable").closeCalls).toBe(0);
		} finally {
			await harness.dispose();
		}

		expect(projectClientClosures(legacyClients)).toEqual(projectClientClosures(nativeClients));
	});
});

interface DifferentialHarness {
	readonly legacyManager: McpManager;
	readonly nativeSupervisor: McpServerSupervisor;
	readonly legacySource: McpRuntimeToolSource;
	readonly nativeSource: McpRuntimeToolSource;
	readonly legacyConfig: MutableConfigSource;
	readonly nativeConfig: MutableConfigSource;
	dispose(): Promise<void>;
}

async function createHarness(
	config: McpConfig,
	legacyClients: FakeClientFactory,
	nativeClients: FakeClientFactory,
): Promise<DifferentialHarness> {
	const legacyConfig = new MutableConfigSource(config);
	const nativeConfig = new MutableConfigSource(config);
	const legacyManager = new McpManager({ configSource: legacyConfig, clientFactory: legacyClients.create });
	const nativeComposition = createCodingAgentMcpSupervisor({
		configSource: nativeConfig,
		clientFactory: nativeClients.create,
	});
	await Promise.all([legacyManager.initialize(), nativeComposition.supervisor.initialize()]);
	return {
		legacyManager,
		nativeSupervisor: nativeComposition.supervisor,
		legacySource: adaptLegacyMcpManagerRuntimeToolSource(legacyManager),
		nativeSource: createMcpServerRuntimeToolSource(nativeComposition.supervisor, {
			decorateTool: decorateCodingAgentMcpRuntimeTool,
		}),
		legacyConfig,
		nativeConfig,
		async dispose() {
			await Promise.all([legacyManager.shutdown(), nativeComposition.supervisor.shutdown()]);
		},
	};
}

function projectLegacyServers(manager: McpManager) {
	return manager
		.getServers()
		.map((server) => ({
			name: server.name,
			status: server.status,
			error: server.error,
			tools: server.tools.map(({ name }) => name),
			resources: server.resources.map(({ name }) => name),
		}))
		.sort(compareNames);
}

function projectNativeServers(supervisor: McpServerSupervisor) {
	return supervisor
		.getState()
		.servers.map((server) => ({
			name: server.name,
			status: server.status,
			error: server.error,
			tools: server.tools.map(({ name }) => name),
			resources: server.resources.map(({ name }) => name),
		}))
		.sort(compareNames);
}

function projectTools(view: McpRuntimeToolView) {
	return view.tools
		.map(({ tool }) => {
			const hookAwareTool = tool as EcosystemHookAwareRuntimeTool;
			return {
				name: tool.name,
				label: tool.label,
				description: tool.description,
				inputSchema: tool.inputSchema,
				ecosystemHook: hookAwareTool.ecosystemHook,
			};
		})
		.sort(compareNames);
}

function findTool(view: McpRuntimeToolView, name: string): RuntimeToolDefinition {
	const tool = view.tools.find(({ tool: candidate }) => candidate.name === name)?.tool;
	if (!tool) throw new Error(`Missing MCP tool: ${name}`);
	return tool;
}

function projectClientClosures(factory: FakeClientFactory) {
	return factory.clients.map(({ name, closeCalls }) => ({ name, closeCalls }));
}

function compareNames(left: { readonly name: string }, right: { readonly name: string }): number {
	return left.name.localeCompare(right.name);
}

class MutableConfigSource implements McpConfigSource {
	private revision = 0;
	private loadError: Error | undefined;

	constructor(private config: McpConfig) {}

	loadGlobal(): McpConfig | null {
		return this.config;
	}

	loadProject(): McpConfig | null {
		return null;
	}

	loadMerged(): McpConfig {
		if (this.loadError) {
			const error = this.loadError;
			this.loadError = undefined;
			throw error;
		}
		return this.config;
	}

	getMergedSignature(): string {
		return `config:${this.revision}`;
	}

	getConfigPaths(): { readonly global: string; readonly project: string } {
		return { global: "global-mcp.json", project: "project-mcp.json" };
	}

	setConfig(config: McpConfig): void {
		this.config = config;
		this.revision += 1;
	}

	failNextLoad(): void {
		this.loadError = new Error("invalid changed config");
		this.revision += 1;
	}
}

interface FakeClientFactoryOptions {
	readonly initializeErrors?: Readonly<Record<string, Error>>;
	readonly toolListErrors?: ReadonlySet<string>;
	readonly callErrors?: ReadonlySet<string>;
}

class FakeClientFactory {
	readonly clients: FakeMcpClient[] = [];
	readonly create: McpClientFactory;

	constructor(private readonly options: FakeClientFactoryOptions = {}) {
		this.create = (name) => {
			const client = new FakeMcpClient(
				name,
				this.options.initializeErrors?.[name],
				this.options.toolListErrors?.has(name) ?? false,
				this.options.callErrors?.has(name) ?? false,
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
}

class FakeMcpClient implements McpClientHandle {
	closeCalls = 0;

	constructor(
		readonly name: string,
		private readonly initializeError: Error | undefined,
		private readonly toolListError: boolean,
		private readonly callError: boolean,
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
			tools: [
				{
					name: `tool-${this.name}`,
					description: `Tool from ${this.name}`,
					inputSchema: {
						type: "object" as const,
						properties: { query: { type: "string" } },
						required: ["query"],
					},
				},
			],
		};
	}

	async callTool(): Promise<McpToolCallResult> {
		if (this.callError) throw new Error(`call failed: ${this.name}`);
		return {
			content: [
				{ type: "text", text: `result:${this.name}` },
				{ type: "image", data: "image-data", mimeType: "image/png" },
				{ type: "resource", resource: { uri: `test://${this.name}`, text: "resource text" } },
			],
		};
	}

	async listResources() {
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

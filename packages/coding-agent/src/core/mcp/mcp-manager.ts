/**
 * Product compatibility adapter around the transport-neutral Runtime MCP supervisor.
 */

import type { AgentTool } from "@vetta/agent-core";
import {
	isHttpServerConfig,
	type McpClientHandle,
	type McpServerBinding,
	type McpServerConfig,
	McpServerSupervisor,
	type McpServerView,
} from "@vetta/runtime-mcp";
import { getAgentDir } from "../../config.js";
import { createMcpClient } from "./mcp-client.js";
import { McpConfigLoader, type McpConfigSource } from "./mcp-config.js";
import { loginMcpDeviceFlow } from "./mcp-device-flow.js";
import { loginHttpMcpServer, type OpenUrlHandler } from "./mcp-oauth-flow.js";
import { clearMcpOAuthState, hasMcpOAuthTokens } from "./mcp-oauth-storage.js";
import { adaptMcpTools } from "./mcp-tool-adapter.js";
import { fingerprintPluginMcpServers, type PluginMcpServerSpec } from "./plugin-mcp.js";
import type { McpManagerState, McpServerInstance, McpServerStatus } from "./types.js";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const CLIENT_NAME = "vetta";
const CLIENT_VERSION = "1.0.0";

export interface McpManagerOptions {
	/** Project root directory */
	projectRoot?: string;
	/** Agent directory (for global config) */
	agentDir?: string;
	/** Enable debug logging */
	debug?: boolean;
	/** Whether MCP is globally enabled */
	enabled?: boolean;
	/** Explicit config boundary for deterministic hosts and tests. */
	configSource?: McpConfigSource;
	/** Explicit client boundary for stdio/HTTP implementations and tests. */
	clientFactory?: McpClientFactory;
}

export interface McpClientFactoryOptions {
	readonly debug?: boolean;
	readonly timeout?: number;
	readonly agentDir?: string;
}

export type McpClientFactory = (
	name: string,
	config: McpServerConfig,
	options?: McpClientFactoryOptions,
) => McpClientHandle;

/**
 * Retains the existing Coding Agent API while delegating generic server lifecycle,
 * observation, and config reconciliation to @vetta/runtime-mcp.
 */
export class McpManager {
	private readonly configLoader: McpConfigSource;
	private readonly agentDir: string;
	private readonly debug: boolean;
	private readonly supervisor: McpServerSupervisor;

	constructor(options: McpManagerOptions = {}) {
		const projectRoot = options.projectRoot || process.cwd();
		this.agentDir = options.agentDir || getAgentDir();
		this.debug = options.debug || false;
		this.configLoader = options.configSource ?? new McpConfigLoader(projectRoot, this.agentDir);
		const clientFactory = options.clientFactory ?? createMcpClient;
		this.supervisor = new McpServerSupervisor({
			configSource: this.configLoader,
			clientFactory: (name, config, clientOptions) =>
				clientFactory(name, config, {
					debug: clientOptions?.debug,
					timeout: clientOptions?.timeout,
					agentDir: this.agentDir,
				}),
			protocolVersion: MCP_PROTOCOL_VERSION,
			clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
			enabled: options.enabled,
			debug: this.debug,
			onDiagnostic: (message) => this.log(message),
		});
	}

	async initialize(): Promise<void> {
		await this.supervisor.initialize();
	}

	/** Run the product OAuth flow and reconnect the runtime-owned server. */
	async loginServer(name: string, options?: { openUrl?: OpenUrlHandler }): Promise<void> {
		const binding = this.supervisor.getServerBinding(name);
		const config = binding?.view.config ?? this.configLoader.loadMerged().mcpServers[name];
		if (!config) throw new Error(`Server '${name}' not found`);
		if (!isHttpServerConfig(config)) {
			throw new Error(`Server '${name}' is not an HTTP MCP server (OAuth only applies to type:http)`);
		}

		if (config.oauthDeviceFlow) {
			if (!config.oauthClientId) {
				throw new Error(`Server '${name}' is missing oauthClientId for the device flow`);
			}
			await loginMcpDeviceFlow({
				serverName: name,
				serverUrl: config.url,
				clientId: config.oauthClientId,
				scopes: config.oauthScopes,
				agentDir: this.agentDir,
				openUrl: options?.openUrl,
			});
		} else {
			await loginHttpMcpServer({
				serverName: name,
				serverUrl: config.url,
				oauthClientId: config.oauthClientId,
				agentDir: this.agentDir,
				openUrl: options?.openUrl,
			});
		}

		await this.supervisor.restartServer(name, config);
	}

	/** Clear product OAuth state and project the result into runtime lifecycle state. */
	async logoutServer(name: string): Promise<void> {
		clearMcpOAuthState(name, this.agentDir);
		const binding = this.supervisor.getServerBinding(name);
		if (!binding) return;
		const needsAuth = isHttpServerConfig(binding.view.config) && !binding.view.config.disabled;
		await this.supervisor.disconnectServer(
			name,
			needsAuth ? { status: "needs_auth", error: "OAuth credentials cleared" } : { status: "stopped" },
		);
	}

	hasAuthTokens(name: string): boolean {
		return hasMcpOAuthTokens(name, this.agentDir);
	}

	getTools(): AgentTool[] {
		const tools: AgentTool[] = [];
		for (const binding of this.supervisor.getReadyServerBindings()) {
			if (!binding.client || binding.view.tools.length === 0) continue;
			tools.push(...adaptMcpTools([...binding.view.tools], binding.client, binding.view.name));
		}
		return tools;
	}

	getServer(name: string): McpServerInstance | undefined {
		const binding = this.supervisor.getServerBinding(name);
		return binding ? toLegacyServer(binding) : undefined;
	}

	getServers(): McpServerInstance[] {
		return this.supervisor.getServerBindings().map(toLegacyServer);
	}

	getServersByStatus(): Record<McpServerStatus, McpServerInstance[]> {
		const grouped: Record<McpServerStatus, McpServerInstance[]> = {
			starting: [],
			ready: [],
			error: [],
			stopped: [],
			needs_auth: [],
		};
		for (const server of this.getServers()) grouped[server.status].push(server);
		return grouped;
	}

	shouldAutoApprove(serverName: string, toolName: string): boolean {
		return this.supervisor.getServerBinding(serverName)?.view.config.autoApprove?.includes(toolName) ?? false;
	}

	hasConfigChanged(): boolean {
		return this.supervisor.hasConfigChanged();
	}

	async setPluginServers(specs: readonly PluginMcpServerSpec[]): Promise<boolean> {
		const servers = new Map<string, McpServerConfig>();
		for (const spec of specs) {
			if (!spec.runtimeName || spec.runtimeName.includes("_")) {
				this.log(`Rejecting plugin MCP server with invalid runtimeName: ${spec.runtimeName}`);
				continue;
			}
			servers.set(spec.runtimeName, spec.config);
		}

		const signature = fingerprintPluginMcpServers(
			[...servers].map(([runtimeName, config]) => ({ runtimeName, config })),
		);
		const changed = await this.supervisor.setDynamicServers({ servers, signature });
		if (!changed) return false;

		this.log(`Plugin MCP set updated (${servers.size} servers), reconciled`);
		for (const server of this.supervisor.getState().servers) {
			if (!server.name.startsWith("plugin-")) continue;
			if (server.status === "error" || server.status === "needs_auth") {
				console.error(`[MCP] Plugin server ${server.name} status=${server.status}: ${server.error ?? "unknown"}`);
			} else if (server.status === "ready") {
				this.log(`Plugin server ${server.name} ready with ${server.tools.length} tools`);
			}
		}
		return true;
	}

	async reloadIfChanged(): Promise<boolean> {
		return this.supervisor.reloadIfChanged();
	}

	async reload(): Promise<void> {
		await this.supervisor.reload();
	}

	async enableServer(name: string): Promise<void> {
		await this.supervisor.enableServer(name);
	}

	async disableServer(name: string): Promise<void> {
		await this.supervisor.disableServer(name);
	}

	async shutdown(): Promise<void> {
		await this.supervisor.shutdown();
	}

	getState(): Readonly<McpManagerState> {
		const state = this.supervisor.getState();
		return {
			enabled: state.enabled,
			globalConfig: state.globalConfig,
			projectConfig: state.projectConfig,
			servers: new Map(
				this.supervisor.getServerBindings().map((binding) => [binding.view.name, toLegacyServer(binding)]),
			),
		};
	}

	isEnabled(): boolean {
		return this.supervisor.isEnabled();
	}

	setEnabled(enabled: boolean): void {
		this.supervisor.setEnabled(enabled);
	}

	getConfigPaths(): { global: string; project: string } {
		return this.supervisor.getConfigPaths();
	}

	getStats(): {
		totalServers: number;
		readyServers: number;
		errorServers: number;
		totalTools: number;
		totalResources: number;
	} {
		return this.supervisor.getStats();
	}

	private log(message: string): void {
		if (this.debug) console.error(`[MCPManager] ${message}`);
	}
}

function toLegacyServer(binding: McpServerBinding): McpServerInstance {
	const view: McpServerView = binding.view;
	return {
		name: view.name,
		config: view.config,
		status: view.status,
		serverInfo: view.serverInfo,
		client: binding.client,
		tools: [...view.tools],
		resources: [...view.resources],
		error: view.error,
		pid: view.pid,
		startedAt: view.startedAt === undefined ? undefined : new Date(view.startedAt),
	};
}

export function createMcpManager(options?: McpManagerOptions): McpManager {
	return new McpManager(options);
}

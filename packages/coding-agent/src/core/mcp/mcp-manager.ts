/**
 * MCP Manager
 *
 * Central manager for all MCP servers, handling initialization,
 * lifecycle management, tool registration, and state management.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { createMcpClient } from "./mcp-client.js";
import { McpConfigLoader } from "./mcp-config.js";
import { adaptMcpTools } from "./mcp-tool-adapter.js";
import type { McpManagerState, McpServerConfig, McpServerInstance, McpServerStatus } from "./types.js";

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
}

/**
 * MCP Manager - manages all MCP servers
 */
export class McpManager {
	private state: McpManagerState;
	private configLoader: McpConfigLoader;
	private projectRoot: string;
	private debug: boolean;

	constructor(options: McpManagerOptions = {}) {
		this.projectRoot = options.projectRoot || process.cwd();
		this.debug = options.debug || false;
		this.configLoader = new McpConfigLoader(this.projectRoot, options.agentDir);

		this.state = {
			servers: new Map(),
			enabled: options.enabled !== undefined ? options.enabled : true,
		};
	}

	/**
	 * Initialize all MCP servers from configuration
	 */
	async initialize(): Promise<void> {
		if (!this.state.enabled) {
			this.log("MCP is disabled, skipping initialization");
			return;
		}

		try {
			// Load configurations
			this.state.globalConfig = this.configLoader.loadGlobal() || undefined;
			this.state.projectConfig = this.configLoader.loadProject() || undefined;

			// Merge configurations
			const mergedConfig = this.configLoader.loadMerged();

			// Initialize servers
			const initPromises: Promise<void>[] = [];
			for (const [name, config] of Object.entries(mergedConfig.mcpServers)) {
				if (!config.disabled) {
					initPromises.push(this.initializeServer(name, config));
				} else {
					this.log(`Skipping disabled server: ${name}`);
				}
			}

			// Wait for all servers to initialize (in parallel)
			await Promise.allSettled(initPromises);

			this.log(`Initialized ${this.state.servers.size} MCP servers`);
		} catch (error) {
			this.log(`Failed to initialize MCP servers: ${(error as Error).message}`);
			throw error;
		}
	}

	/**
	 * Initialize a single MCP server
	 */
	private async initializeServer(name: string, config: McpServerConfig): Promise<void> {
		this.log(`Initializing server: ${name}`);

		// Create server instance
		const instance: McpServerInstance = {
			name,
			config,
			status: "starting",
			tools: [],
			resources: [],
		};

		this.state.servers.set(name, instance);

		try {
			// Create and start client
			const client = createMcpClient(name, config, { debug: this.debug || config.debug });

			instance.client = client;
			instance.startedAt = new Date();

			// Initialize connection
			const initResult = await client.initialize({
				protocolVersion: MCP_PROTOCOL_VERSION,
				clientInfo: {
					name: CLIENT_NAME,
					version: CLIENT_VERSION,
				},
				capabilities: {},
			});

			instance.serverInfo = initResult.serverInfo;
			instance.pid = client.getPid();

			// List available tools
			if (initResult.capabilities?.tools) {
				try {
					const toolsResult = await client.listTools();
					instance.tools = toolsResult.tools;
					this.log(`Server ${name} provides ${instance.tools.length} tools`);
				} catch (error) {
					this.log(`Failed to list tools for ${name}: ${(error as Error).message}`);
				}
			}

			// List available resources
			if (initResult.capabilities?.resources) {
				try {
					const resourcesResult = await client.listResources();
					instance.resources = resourcesResult.resources;
					this.log(`Server ${name} provides ${instance.resources.length} resources`);
				} catch (error) {
					this.log(`Failed to list resources for ${name}: ${(error as Error).message}`);
				}
			}

			instance.status = "ready";
			this.log(`Server ${name} is ready`);
		} catch (error) {
			instance.status = "error";
			instance.error = (error as Error).message;
			this.log(`Failed to initialize server ${name}: ${instance.error}`);
			// Don't throw - allow other servers to initialize
		}
	}

	/**
	 * Get all available MCP tools as AgentTools
	 */
	getTools(): AgentTool[] {
		const tools: AgentTool[] = [];

		for (const instance of this.state.servers.values()) {
			if (instance.status === "ready" && instance.client && instance.tools.length > 0) {
				const adaptedTools = adaptMcpTools(instance.tools, instance.client, instance.name);
				tools.push(...adaptedTools);
			}
		}

		return tools;
	}

	/**
	 * Get a specific server instance
	 */
	getServer(name: string): McpServerInstance | undefined {
		return this.state.servers.get(name);
	}

	/**
	 * Get all server instances
	 */
	getServers(): McpServerInstance[] {
		return Array.from(this.state.servers.values());
	}

	/**
	 * Get servers grouped by status
	 */
	getServersByStatus(): Record<McpServerStatus, McpServerInstance[]> {
		const grouped: Record<McpServerStatus, McpServerInstance[]> = {
			starting: [],
			ready: [],
			error: [],
			stopped: [],
		};

		for (const instance of this.state.servers.values()) {
			grouped[instance.status].push(instance);
		}

		return grouped;
	}

	/**
	 * Check if a tool should be auto-approved
	 */
	shouldAutoApprove(serverName: string, toolName: string): boolean {
		const instance = this.state.servers.get(serverName);
		if (!instance) {
			return false;
		}

		return instance.config.autoApprove?.includes(toolName) || false;
	}

	/**
	 * Reload configuration and restart servers
	 */
	async reload(): Promise<void> {
		this.log("Reloading MCP configuration");

		// Stop all servers
		await this.shutdown();

		// Clear state
		this.state.servers.clear();

		// Reinitialize
		await this.initialize();
	}

	/**
	 * Enable a specific server
	 */
	async enableServer(name: string): Promise<void> {
		const instance = this.state.servers.get(name);
		if (!instance) {
			throw new Error(`Server '${name}' not found`);
		}

		if (instance.status === "ready") {
			this.log(`Server ${name} is already enabled`);
			return;
		}

		// Update config to enable
		instance.config.disabled = false;

		// Reinitialize the server
		await this.initializeServer(name, instance.config);
	}

	/**
	 * Disable a specific server
	 */
	async disableServer(name: string): Promise<void> {
		const instance = this.state.servers.get(name);
		if (!instance) {
			throw new Error(`Server '${name}' not found`);
		}

		// Update config to disable
		instance.config.disabled = true;

		// Stop the server
		if (instance.client) {
			await instance.client.close();
		}

		instance.status = "stopped";
		instance.client = undefined;
		this.log(`Server ${name} disabled`);
	}

	/**
	 * Shutdown all MCP servers
	 */
	async shutdown(): Promise<void> {
		this.log("Shutting down all MCP servers");

		const shutdownPromises: Promise<void>[] = [];

		for (const instance of this.state.servers.values()) {
			if (instance.client) {
				shutdownPromises.push(
					instance.client.close().catch((error) => {
						this.log(`Error closing server ${instance.name}: ${(error as Error).message}`);
					}),
				);
			}
		}

		await Promise.allSettled(shutdownPromises);

		// Clear all servers
		this.state.servers.clear();
		this.log("All MCP servers shut down");
	}

	/**
	 * Get manager state
	 */
	getState(): Readonly<McpManagerState> {
		return {
			...this.state,
			servers: new Map(this.state.servers),
		};
	}

	/**
	 * Check if MCP is enabled
	 */
	isEnabled(): boolean {
		return this.state.enabled;
	}

	/**
	 * Enable or disable MCP globally
	 */
	setEnabled(enabled: boolean): void {
		this.state.enabled = enabled;
	}

	/**
	 * Get configuration file paths
	 */
	getConfigPaths(): { global: string; project: string } {
		return this.configLoader.getConfigPaths();
	}

	/**
	 * Get summary statistics
	 */
	getStats(): {
		totalServers: number;
		readyServers: number;
		errorServers: number;
		totalTools: number;
		totalResources: number;
	} {
		let readyServers = 0;
		let errorServers = 0;
		let totalTools = 0;
		let totalResources = 0;

		for (const instance of this.state.servers.values()) {
			if (instance.status === "ready") {
				readyServers++;
				totalTools += instance.tools.length;
				totalResources += instance.resources.length;
			} else if (instance.status === "error") {
				errorServers++;
			}
		}

		return {
			totalServers: this.state.servers.size,
			readyServers,
			errorServers,
			totalTools,
			totalResources,
		};
	}

	/**
	 * Log a message (if debug is enabled)
	 */
	private log(message: string): void {
		if (this.debug) {
			console.error(`[MCPManager] ${message}`);
		}
	}
}

/**
 * Create a new MCP manager instance
 */
export function createMcpManager(options?: McpManagerOptions): McpManager {
	return new McpManager(options);
}

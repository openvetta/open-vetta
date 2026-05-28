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
	/** mcp.json 签名快照，用于 reloadIfChanged 的 fast-path 判等。 */
	private lastSignature: string | undefined;

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

			this.lastSignature = this.configLoader.getMergedSignature();
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
	 * 仅探测：mcp.json 是否自上次加载后发生变化。无副作用，O(stat+hash)。
	 * 用于 prompt 入口的 fast-path 判等。
	 */
	hasConfigChanged(): boolean {
		if (!this.state.enabled) return false;
		const sig = this.configLoader.getMergedSignature();
		return this.lastSignature !== sig;
	}

	/**
	 * 若 mcp.json 自上次加载以来发生变化，则按需重启变化的 server。
	 *
	 * Fast-path：mtime+hash 签名相等直接返回 false，0 副作用。
	 * Slow-path：diff 旧/新配置：
	 *   - 删除的 server → close client + 移除实例
	 *   - 新增的 server → initializeServer
	 *   - 配置改变的 server → close 旧 client + 用新配置重建
	 *   - 不变的 server → 保留运行中的 client，不抖
	 * 这种最小化重启避免了 "改 A server 把 B 也抖一下" 的副作用。
	 *
	 * @returns 是否真的执行了重启（false = 配置未变 / MCP 关闭）
	 */
	async reloadIfChanged(): Promise<boolean> {
		if (!this.state.enabled) return false;

		const currentSignature = this.configLoader.getMergedSignature();
		if (this.lastSignature !== undefined && this.lastSignature === currentSignature) {
			return false;
		}

		this.log("MCP config changed, diff-reloading");

		// 解析新配置
		let mergedConfig: { mcpServers: Record<string, McpServerConfig> };
		try {
			mergedConfig = this.configLoader.loadMerged();
		} catch (err) {
			this.log(`Failed to load new MCP config, keeping current state: ${(err as Error).message}`);
			// 签名仍然推进，避免下一轮 prompt 再次踩坑
			this.lastSignature = currentSignature;
			return false;
		}

		const oldNames = new Set(this.state.servers.keys());
		const newNames = new Set(Object.keys(mergedConfig.mcpServers));

		// 1) 删除：旧有新没
		for (const name of oldNames) {
			if (!newNames.has(name)) {
				const instance = this.state.servers.get(name);
				if (instance?.client) {
					try {
						await instance.client.close();
					} catch (err) {
						this.log(`Error closing removed server ${name}: ${(err as Error).message}`);
					}
				}
				this.state.servers.delete(name);
				this.log(`Removed server: ${name}`);
			}
		}

		// 2) 新增 + 修改
		const tasks: Promise<void>[] = [];
		for (const [name, newConfig] of Object.entries(mergedConfig.mcpServers)) {
			const oldInstance = this.state.servers.get(name);
			const newDisabled = !!newConfig.disabled;

			if (!oldInstance) {
				// 新增（仅启用项才真起进程）
				if (!newDisabled) tasks.push(this.initializeServer(name, newConfig));
				continue;
			}

			const oldConfigJson = JSON.stringify(oldInstance.config);
			const newConfigJson = JSON.stringify(newConfig);
			if (oldConfigJson === newConfigJson) {
				// 完全没变，保留
				continue;
			}

			// 改了：先停旧的（不管旧的是不是 disabled，都清理一次）
			if (oldInstance.client) {
				try {
					await oldInstance.client.close();
				} catch (err) {
					this.log(`Error closing changed server ${name}: ${(err as Error).message}`);
				}
			}
			this.state.servers.delete(name);
			if (!newDisabled) {
				tasks.push(this.initializeServer(name, newConfig));
			} else {
				this.log(`Server ${name} is now disabled, kept stopped`);
			}
		}

		await Promise.allSettled(tasks);

		// 更新 cached config / signature
		this.state.globalConfig = this.configLoader.loadGlobal() || undefined;
		this.state.projectConfig = this.configLoader.loadProject() || undefined;
		this.lastSignature = currentSignature;

		this.log(`Diff-reload done, ${this.state.servers.size} servers active`);
		return true;
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
		this.lastSignature = undefined;

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

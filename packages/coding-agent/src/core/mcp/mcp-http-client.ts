/**
 * MCP HTTP Client
 *
 * Implements IMcpClient using the official @modelcontextprotocol/sdk
 * with Streamable HTTP transport.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
	IMcpClient,
	McpHttpServerConfig,
	McpInitializeParams,
	McpInitializeResult,
	McpPromptsListResult,
	McpResourceReadResult,
	McpResourcesListResult,
	McpToolCallResult,
	McpToolsListResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30000;

export interface HttpMcpClientOptions {
	config: McpHttpServerConfig;
	name: string;
	debug?: boolean;
	timeout?: number;
}

export class HttpMcpClient implements IMcpClient {
	private name: string;
	private config: McpHttpServerConfig;
	private debug: boolean;
	private timeout: number;
	private client: Client | null = null;
	private transport: StreamableHTTPClientTransport | null = null;
	private initialized = false;

	constructor(options: HttpMcpClientOptions) {
		this.name = options.name;
		this.config = options.config;
		this.debug = options.debug || options.config.debug || false;
		this.timeout = options.timeout || options.config.startupTimeout || DEFAULT_TIMEOUT_MS;
	}

	async initialize(params: McpInitializeParams): Promise<McpInitializeResult> {
		const url = new URL(this.config.url);
		const requestInit: RequestInit | undefined = this.config.headers ? { headers: this.config.headers } : undefined;

		this.transport = new StreamableHTTPClientTransport(url, { requestInit });
		this.client = new Client(
			{ name: params.clientInfo.name, version: params.clientInfo.version },
			{ capabilities: params.capabilities ?? {} },
		);

		await this.client.connect(this.transport, { timeout: this.timeout });
		this.initialized = true;

		const serverVersion = this.client.getServerVersion();
		const serverCapabilities = this.client.getServerCapabilities();

		this.log(`Connected to ${this.config.url}`);

		return {
			protocolVersion: params.protocolVersion,
			serverInfo: {
				name: serverVersion?.name ?? this.name,
				version: serverVersion?.version ?? "unknown",
				capabilities: serverCapabilities as McpInitializeResult["serverInfo"]["capabilities"],
			},
			capabilities: serverCapabilities as McpInitializeResult["capabilities"],
		};
	}

	async listTools(cursor?: string): Promise<McpToolsListResult> {
		this.ensureInitialized();
		const result = await this.client!.listTools(cursor ? { cursor } : undefined);
		return result as unknown as McpToolsListResult;
	}

	async callTool(name: string, args?: Record<string, any>): Promise<McpToolCallResult> {
		this.ensureInitialized();
		const result = await this.client!.callTool({ name, arguments: args });
		return result as unknown as McpToolCallResult;
	}

	async listResources(cursor?: string): Promise<McpResourcesListResult> {
		this.ensureInitialized();
		const result = await this.client!.listResources(cursor ? { cursor } : undefined);
		return result as unknown as McpResourcesListResult;
	}

	async readResource(uri: string): Promise<McpResourceReadResult> {
		this.ensureInitialized();
		const result = await this.client!.readResource({ uri });
		return result as unknown as McpResourceReadResult;
	}

	async listPrompts(cursor?: string): Promise<McpPromptsListResult> {
		this.ensureInitialized();
		const result = await this.client!.listPrompts(cursor ? { cursor } : undefined);
		return result as unknown as McpPromptsListResult;
	}

	async close(): Promise<void> {
		if (this.client) {
			try {
				await this.client.close();
			} catch (error) {
				this.log(`Error closing client: ${(error as Error).message}`);
			}
		}
		this.client = null;
		this.transport = null;
		this.initialized = false;
	}

	getName(): string {
		return this.name;
	}

	getPid(): number | undefined {
		return undefined;
	}

	isClientInitialized(): boolean {
		return this.initialized;
	}

	private ensureInitialized(): void {
		if (!this.initialized || !this.client) {
			throw new Error("HTTP MCP client is not initialized");
		}
	}

	private log(message: string): void {
		if (this.debug) {
			console.error(`[MCPClient:${this.name}] ${message}`);
		}
	}
}

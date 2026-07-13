export interface McpServerCommonConfigData {
	disabled?: boolean;
	autoApprove?: string[];
	startupTimeout?: number;
	debug?: boolean;
	/** 仅 UI 展示用的可读名（mcp.json 里的 key 仍是真实 name）。 */
	displayName?: string;
	/** 仅 UI 展示用的描述。 */
	description?: string;
	/** 仅 UI 展示用的图标 URL（远程市场/自定义配置）。 */
	icon?: string;
}

export interface McpStdioServerConfigData extends McpServerCommonConfigData {
	type?: "stdio";
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface McpHttpServerConfigData extends McpServerCommonConfigData {
	type: "http";
	url: string;
	headers?: Record<string, string>;
}

export type McpServerConfigData = McpStdioServerConfigData | McpHttpServerConfigData;

export interface McpConfigData {
	mcpServers: Record<string, McpServerConfigData>;
}

export interface DesktopMcpApi {
	get(): Promise<McpConfigData>;
	set(config: McpConfigData): Promise<void>;
}

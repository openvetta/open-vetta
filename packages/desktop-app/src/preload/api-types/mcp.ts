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
	/**
	 * 对 type:http 的远程 MCP 发起浏览器 OAuth 授权（通用机制，不限 Notion）。
	 * 成功后 token 写入 ~/.vetta/agent/mcp-auth/<name>.json。
	 * `url` 可选：首次添加时尚未写入 mcp.json，可直接传远程 MCP 地址。
	 */
	login(serverName: string, options?: { url?: string }): Promise<void>;
	/** 清除该 server 的 OAuth 凭证 */
	logout(serverName: string): Promise<void>;
	/** 是否已有该 server 的 OAuth token（不探测连通性） */
	hasAuth(serverName: string): Promise<boolean>;
	/** 批量查询多个 server 的授权状态 */
	authStatus(serverNames: string[]): Promise<Record<string, boolean>>;
}

import type { McpServerConfig } from "../../ipc/fs.js";
import { readMcpConfig, writeMcpConfig } from "../../ipc/fs.js";
import { genericApproval, redactRecordSecrets, runActionService, toJsonValue } from "../shared.js";
import { type ActionDefinition, ActionError, type ActionExample, type ActionInputSchema } from "../types.js";
import {
	type McpManageInput,
	type McpQueryInput,
	validateMcpManageInput,
	validateMcpQueryInput,
} from "./mcp.schema.js";

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help"、"list" 或 "get"。headers/env 中的密钥字段会脱敏。',
	operations: [
		{
			name: "help",
			description: "返回 mcp 域 Action 说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出全部 MCP server。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
		{
			name: "get",
			description: "读取指定 MCP server 配置。",
			parameters: [
				{ name: "operation", type: '"get"', required: true, description: "固定为 get。" },
				{ name: "name", type: "string", required: true, description: "mcp.json 中的 server 名称。" },
			],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "upsert"、"set-enabled" 或 "remove"。stdio 需 command；http 需 type:"http" 与 url。set-enabled 的 enabled=true 表示启用（disabled=false）。',
	operations: [
		{
			name: "upsert",
			description: "创建或 patch 更新 MCP server。",
			parameters: [
				{ name: "operation", type: '"upsert"', required: true, description: "固定为 upsert。" },
				{ name: "name", type: "string", required: true, description: "server 名称。" },
				{ name: "data", type: "object", required: true, description: "要写入的字段。" },
			],
		},
		{
			name: "set-enabled",
			description: "启用或禁用 MCP server。",
			parameters: [
				{ name: "operation", type: '"set-enabled"', required: true, description: "固定为 set-enabled。" },
				{ name: "name", type: "string", required: true, description: "server 名称。" },
				{ name: "enabled", type: "boolean", required: true, description: "true 启用，false 禁用。" },
			],
		},
		{
			name: "remove",
			description: "删除 MCP server。",
			parameters: [
				{ name: "operation", type: '"remove"', required: true, description: "固定为 remove。" },
				{ name: "name", type: "string", required: true, description: "server 名称。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "列出 MCP", input: { operation: "list" } },
	{ description: "查看指定 server", input: { operation: "get", name: "filesystem" } },
];

const manageExamples: ActionExample[] = [
	{
		description: "添加 stdio MCP",
		input: {
			operation: "upsert",
			name: "filesystem",
			data: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
		},
	},
	{ description: "禁用 MCP", input: { operation: "set-enabled", name: "filesystem", enabled: false } },
];

function redactServer(server: McpServerConfig): McpServerConfig {
	if (server.type === "http") {
		return { ...server, headers: redactRecordSecrets(server.headers) };
	}
	return {
		...server,
		env: redactRecordSecrets(server.env, ["token", "key", "secret", "password", "authorization"]),
	};
}

export function createMcpActions(): ActionDefinition[] {
	const queryAction: ActionDefinition = {
		id: "mcp.query",
		domain: "mcp",
		title: "查询 MCP 服务器",
		summary: "列出或查看本地 MCP server 配置。",
		availability: "gui-main",
		permission: "mcp.read",
		keywords: ["mcp", "MCP", "服务器", "tools", "stdio", "http"],
		inputSchema: queryInputSchema,
		examples: queryExamples,
		validateInput: validateMcpQueryInput,
		run: async (input) => {
			const request = input as unknown as McpQueryInput;
			if (request.operation === "help") {
				return toJsonValue({
					guidance: "写操作使用 mcp.manage。会话会在下次 prompt 时按需 reload MCP。",
					actions: [
						{ id: "mcp.query", inputSchema: queryInputSchema, examples: queryExamples },
						{ id: "mcp.manage", inputSchema: manageInputSchema, examples: manageExamples },
					],
				});
			}
			const config = await readMcpConfig();
			if (request.operation === "list") {
				return toJsonValue({
					servers: Object.entries(config.mcpServers).map(([name, server]) => ({
						name,
						type: server.type === "http" ? "http" : "stdio",
						disabled: Boolean(server.disabled),
						command: server.type === "http" ? undefined : server.command,
						url: server.type === "http" ? server.url : undefined,
					})),
				});
			}
			const server = config.mcpServers[request.name];
			if (!server) throw new ActionError("ACTION_NOT_FOUND", `MCP server not found: ${request.name}`);
			return toJsonValue({ name: request.name, ...redactServer(server) });
		},
	};

	const manageAction: ActionDefinition = {
		id: "mcp.manage",
		domain: "mcp",
		title: "管理 MCP 服务器",
		summary: "创建、更新、启用/禁用或删除 MCP server。",
		availability: "gui-main",
		permission: "mcp.write",
		keywords: ["mcp", "MCP", "添加", "删除", "启用", "禁用", "command"],
		approval: genericApproval,
		inputSchema: manageInputSchema,
		examples: manageExamples,
		validateInput: validateMcpManageInput,
		requiresApproval: (_input, context) => context.source === "local-server",
		run: async (input) => {
			const request = input as unknown as McpManageInput;
			return await runActionService(async () => {
				const config = await readMcpConfig();
				if (request.operation === "remove") {
					if (!config.mcpServers[request.name]) {
						throw new ActionError("ACTION_NOT_FOUND", `MCP server not found: ${request.name}`);
					}
					delete config.mcpServers[request.name];
					await writeMcpConfig(config);
					return { operation: "remove", name: request.name };
				}
				if (request.operation === "set-enabled") {
					const existing = config.mcpServers[request.name];
					if (!existing) throw new ActionError("ACTION_NOT_FOUND", `MCP server not found: ${request.name}`);
					existing.disabled = !request.enabled;
					config.mcpServers[request.name] = existing;
					await writeMcpConfig(config);
					return { operation: "set-enabled", name: request.name, enabled: request.enabled };
				}
				const existing = config.mcpServers[request.name];
				const data = request.data;
				if (data.type === "http") {
					const next = {
						...(existing?.type === "http" ? existing : {}),
						...data,
						type: "http" as const,
						url: data.url ?? (existing?.type === "http" ? existing.url : undefined),
					};
					if (!next.url) {
						throw new ActionError("ACTION_INVALID_INPUT", "HTTP MCP server requires url.");
					}
					config.mcpServers[request.name] = next as McpServerConfig;
				} else {
					const prev = existing && existing.type !== "http" ? existing : undefined;
					const next = {
						...prev,
						...data,
						type: data.type,
						command: data.command ?? prev?.command,
					};
					if (!next.command) {
						throw new ActionError("ACTION_INVALID_INPUT", "stdio MCP server requires command.");
					}
					config.mcpServers[request.name] = next as McpServerConfig;
				}
				await writeMcpConfig(config);
				return {
					operation: "upsert",
					name: request.name,
					server: redactServer(config.mcpServers[request.name]),
				};
			});
		},
	};

	return [queryAction, manageAction];
}

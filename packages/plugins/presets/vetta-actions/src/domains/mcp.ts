import type {
	PluginAppActionExample,
	PluginContext,
	PluginJsonSchema,
	PluginOfficialMcpTarget,
	PluginOfficialMcpUpsertData,
} from "@vetta-org/plugin-sdk";
import { throwEntityNotFound } from "../action-errors";
import { createVettaActionRegistrar } from "../action-usage";

type McpQueryInput =
	| ({ operation: "help" })
	| ({ operation: "list" } & PluginOfficialMcpTarget)
	| ({ operation: "get"; name: string } & PluginOfficialMcpTarget);
type McpManageInput =
	| ({ operation: "upsert"; name: string; data: PluginOfficialMcpUpsertData } & PluginOfficialMcpTarget)
	| ({ operation: "set-enabled"; name: string; enabled: boolean } & PluginOfficialMcpTarget)
	| ({ operation: "remove"; name: string } & PluginOfficialMcpTarget);

/** scope/cwd 在每个分支里写法一致：global 为缺省，project 必须带项目根 cwd。 */
const targetProperties = {
	scope: { enum: ["global", "project"] },
	cwd: { type: "string", minLength: 1 },
} as const;

function targetOf(input: PluginOfficialMcpTarget): PluginOfficialMcpTarget {
	return {
		...(input.scope === undefined ? {} : { scope: input.scope }),
		...(input.cwd === undefined ? {} : { cwd: input.cwd }),
	};
}

const querySchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{ properties: { operation: { const: "help" } }, required: ["operation"], additionalProperties: false },
		{
			properties: { operation: { const: "list" }, ...targetProperties },
			required: ["operation"],
			additionalProperties: false,
		},
		{
			properties: {
				operation: { const: "get" },
				name: { type: "string", minLength: 1 },
				...targetProperties,
			},
			required: ["operation", "name"],
			additionalProperties: false,
		},
	],
};

const manageSchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{
			properties: {
				operation: { const: "upsert" },
				name: { type: "string", minLength: 1 },
				...targetProperties,
				data: {
					oneOf: [
						{
							type: "object",
							properties: {
								type: { const: "stdio" },
								command: { type: "string", minLength: 1 },
								args: { type: "array", items: { type: "string" } },
								env: { type: "object", additionalProperties: { type: "string" } },
								cwd: { type: "string", minLength: 1 },
								disabled: { type: "boolean" },
								autoApprove: { type: "array", items: { type: "string" } },
								startupTimeout: { type: "integer", minimum: 1 },
								debug: { type: "boolean" },
							},
							minProperties: 1,
							additionalProperties: false,
						},
						{
							type: "object",
							properties: {
								type: { enum: ["http", "sse"] },
								url: { type: "string", minLength: 1 },
								headers: { type: "object", additionalProperties: { type: "string" } },
								disabled: { type: "boolean" },
								autoApprove: { type: "array", items: { type: "string" } },
								startupTimeout: { type: "integer", minimum: 1 },
								debug: { type: "boolean" },
							},
							required: ["type"],
							additionalProperties: false,
						},
					],
				},
			},
			required: ["operation", "name", "data"],
			additionalProperties: false,
		},
		{
			properties: {
				operation: { const: "set-enabled" },
				name: { type: "string", minLength: 1 },
				enabled: { type: "boolean" },
				...targetProperties,
			},
			required: ["operation", "name", "enabled"],
			additionalProperties: false,
		},
		{
			properties: {
				operation: { const: "remove" },
				name: { type: "string", minLength: 1 },
				...targetProperties,
			},
			required: ["operation", "name"],
			additionalProperties: false,
		},
	],
};

const queryExamples: PluginAppActionExample<McpQueryInput>[] = [
	{ description: "列出全局 MCP", input: { operation: "list" } },
	{ description: "列出全局加指定项目里的 MCP（标明来源）", input: { operation: "list", cwd: "/abs/project" } },
	{ description: "查看指定 server", input: { operation: "get", name: "filesystem" } },
];
const manageExamples: PluginAppActionExample<McpManageInput>[] = [
	{
		description: "添加 stdio MCP",
		input: {
			operation: "upsert",
			name: "filesystem",
			data: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
		},
	},
	{
		description: "只给这个项目添加 MCP（写入 <cwd>/.vetta/mcp.json，可随仓库提交；密钥用 ${VAR} 引用）",
		input: {
			operation: "upsert",
			name: "docs",
			scope: "project",
			cwd: "/abs/project",
			data: { command: "npx", args: ["-y", "docs-mcp"], env: { DOCS_TOKEN: "${DOCS_TOKEN}" } },
		},
	},
	{ description: "禁用 MCP", input: { operation: "set-enabled", name: "filesystem", enabled: false } },
];

export function registerMcpActions(ctx: PluginContext): void {
	const register = createVettaActionRegistrar(ctx, "mcp");
	register<McpQueryInput>({
		id: "mcp.query",
		publicId: "mcp.query",
		title: "查询 MCP 服务器",
		summary: "列出或查看本地 MCP server 配置。",
		description:
			'对象参数；operation 为 "help"、"list" 或 "get"。headers/env 中的密钥字段会脱敏。不传 scope/cwd 只看全局；传 cwd（项目根）则把该项目的 MCP 一并列出并标明 scope，来自项目根 .mcp.json 的条目带 readOnly:true。',
		keywords: ["mcp", "MCP", "服务器", "tools", "stdio", "http"],
		effect: "read",
		inputSchema: querySchema,
		examples: queryExamples,
		handler: async ({ input }) => {
			if (input.operation === "help") {
				return {
					guidance:
						"写操作使用 mcp.manage。会话会在下次 prompt 时按需 reload MCP。upsert 时 env/headers 中的密钥请省略，审批弹窗可让用户手填。scope 缺省为全局（~/.vetta/agent/mcp.json）；scope:\"project\" 必须同时传项目根 cwd，写入 <cwd>/.vetta/mcp.json，该文件会随仓库提交，所以密钥只能写成 ${VAR} 引用。项目根 .mcp.json 里的 server 只读（list/get 里 readOnly:true），不能经 mcp.manage 修改。",
					actions: [
						{ id: "mcp.query", inputSchema: querySchema, examples: queryExamples },
						{ id: "mcp.manage", inputSchema: manageSchema, examples: manageExamples },
					],
				};
			}
			if (input.operation === "list") return { servers: await ctx.official.mcp.list(targetOf(input)) };
			return ctx.official.mcp.get(input.name, targetOf(input));
		},
	});
	register<McpManageInput>({
		id: "mcp.manage",
		publicId: "mcp.manage",
		title: "管理 MCP 服务器",
		summary: "创建、更新、启用/禁用或删除 MCP server。",
		description:
			'对象参数；operation 为 "upsert"、"set-enabled" 或 "remove"。stdio 需 command；远程需 type:"http"（Streamable HTTP，首选）或 type:"sse"（旧式 HTTP+SSE，仅用于只提供 SSE 端点的服务器）与 url。env/headers 密钥勿写入参数，审批弹窗可手填。scope 缺省为全局；scope:"project" 必须传项目根 cwd，写入该项目的 .vetta/mcp.json（可随仓库提交，密钥须用 ${VAR} 引用）。set-enabled/remove 只给 cwd 不给 scope 时按名字自动定位，全局与项目同名则必须指明 scope。',
		keywords: ["mcp", "MCP", "添加", "删除", "启用", "禁用", "command", "密钥", "env"],
		effect: "write",
		approval: {
			defaultPresentation: "mcp.upsert",
			presentations: [
				{ id: "mcp.upsert", title: "创建或更新 MCP 服务确认", description: "展示 MCP 服务配置，允许用户编辑后确认。" },
				{ id: "mcp.set-enabled", title: "启用/停用 MCP 服务确认", description: "展示 MCP 服务启用状态变更。" },
				{ id: "mcp.remove", title: "删除 MCP 服务确认", description: "展示待删除的 MCP 服务。" },
			],
			presentationByOperation: {
				upsert: "mcp.upsert",
				"set-enabled": "mcp.set-enabled",
				remove: "mcp.remove",
			},
		},
		inputSchema: manageSchema,
		examples: manageExamples,
		assertReady: async ({ input }) => {
			if (input.operation === "upsert") return;
			const names = await ctx.official.mcp.listNames(targetOf(input));
			if (names.includes(input.name)) return;
			throwEntityNotFound({
				operation: input.operation,
				entity: "MCP server",
				idField: "name",
				id: input.name,
				queryAction: "mcp.query",
				queryExample: { operation: "list" },
				resultIdPath: "servers[].name",
				availableIds: names,
			});
		},
		handler: async ({ input }) => {
			if (input.operation === "remove") {
				await ctx.official.mcp.remove(input.name, targetOf(input));
				return { operation: input.operation, name: input.name };
			}
			if (input.operation === "set-enabled") {
				await ctx.official.mcp.setEnabled(input.name, input.enabled, targetOf(input));
				return { operation: input.operation, name: input.name, enabled: input.enabled };
			}
			const server = await ctx.official.mcp.upsert(input.name, input.data, targetOf(input));
			return { operation: input.operation, name: input.name, server };
		},
	});
}

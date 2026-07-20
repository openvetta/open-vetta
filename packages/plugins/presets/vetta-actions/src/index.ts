import {
	definePlugin,
	type PluginAppActionExample,
	type PluginJsonSchema,
} from "@vetta-org/plugin-sdk";

type GeneralQueryInput = { operation: "help" } | { operation: "get" };

const generalQueryInputSchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{
			properties: { operation: { const: "help" } },
			required: ["operation"],
			additionalProperties: false,
		},
		{
			properties: { operation: { const: "get" } },
			required: ["operation"],
			additionalProperties: false,
		},
	],
};

const generalManageInputSchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{
			properties: {
				operation: { const: "set-notifications" },
				enabled: { type: "boolean" },
			},
			required: ["operation", "enabled"],
			additionalProperties: false,
		},
		{
			properties: {
				operation: { const: "set-execution-mode" },
				mode: { enum: ["sandbox", "full-access"] },
			},
			required: ["operation", "mode"],
			additionalProperties: false,
		},
		{
			properties: {
				operation: { const: "set-workspace" },
				path: { type: "string", minLength: 1 },
			},
			required: ["operation", "path"],
			additionalProperties: false,
		},
	],
};

const queryExamples: PluginAppActionExample<GeneralQueryInput>[] = [
	{ description: "读取通用设置", input: { operation: "get" } },
];
const manageExamples = [
	{ description: "默认沙盒执行", input: { operation: "set-execution-mode", mode: "sandbox" } },
	{ description: "关闭系统通知", input: { operation: "set-notifications", enabled: false } },
];

export default definePlugin({
	activate(ctx) {
		ctx.appActions.register<GeneralQueryInput>({
			id: "general.query",
			publicId: "general.query",
			title: "查询通用设置",
			summary: "读取工作区、通知与默认执行模式（设置 → 通用）。",
			description:
				'对象参数；operation 为 "help" 或 "get"。get 返回工作区、通知、默认执行模式与 sandbox 能力。',
			keywords: ["通用", "general", "通知", "沙盒", "workspace", "工作区", "执行模式", "设置"],
			effect: "read",
			inputSchema: generalQueryInputSchema,
			examples: queryExamples,
			handler: async ({ input }) => {
				if (input.operation === "help") {
					return {
						guidance:
							"general 对应设置 → 通用。语言 → appearance.theme（set-language）；Agent 实验开关 → agent.query / agent.manage；知识库加工 → knowledge.query get-processing / knowledge.manage set-processing；模型/MCP 用 models.* / mcp.*。",
						actions: [
							{ id: "general.query", inputSchema: generalQueryInputSchema, examples: queryExamples },
							{ id: "general.manage", inputSchema: generalManageInputSchema, examples: manageExamples },
						],
					};
				}
				return ctx.official.general.getSettings();
			},
		});
	},
});

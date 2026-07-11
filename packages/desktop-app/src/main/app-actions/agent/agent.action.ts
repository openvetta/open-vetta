import { readDesktopConfig, writeDesktopConfig } from "../../ipc/fs.js";
import { createOperationApprovals, runActionService, toJsonValue } from "../shared.js";
import type { ActionDefinition, ActionExample, ActionInputSchema } from "../types.js";
import {
	type AgentManageInput,
	type AgentQueryInput,
	validateAgentManageInput,
	validateAgentQueryInput,
} from "./agent.schema.js";

const queryInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "help" 或 "get"。get 返回 Agent 实验开关快照。对应设置 → Agent 配置。通用项 → general.*；人设/自定义指令等个性化能力若未暴露在此 Action 中则走 GUI。',
	operations: [
		{
			name: "help",
			description: "返回 agent（设置 → Agent 配置）域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "get",
			description: "读取 Agent 实验开关。",
			parameters: [{ name: "operation", type: '"get"', required: true, description: "固定为 get。" }],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "set-experimental"。patch 实验功能开关。',
	operations: [
		{
			name: "set-experimental",
			description: "patch 实验功能开关（vettaCli / promptPrediction / agentSkills）。",
			parameters: [
				{ name: "operation", type: '"set-experimental"', required: true, description: "固定为 set-experimental。" },
				{
					name: "data",
					type: "object",
					required: true,
					description: "至少一项：vettaCli、promptPrediction、agentSkills（boolean）。",
				},
			],
		},
	],
};

const queryExamples: ActionExample[] = [{ description: "读取 Agent 实验开关", input: { operation: "get" } }];

const manageExamples: ActionExample[] = [
	{
		description: "开启输入预测",
		input: { operation: "set-experimental", data: { promptPrediction: true } },
	},
];

export function createAgentActions(): ActionDefinition[] {
	return [
		{
			id: "agent.query",
			domain: "agent",
			title: "查询 Agent 配置",
			summary: "读取 Agent 实验开关（设置 → Agent 配置）。",
			availability: "gui-main",
			permission: "agent.read",
			keywords: ["agent", "Agent", "实验", "experimental", "Vetta CLI", "输入预测", "技能扩展", "agentSkills"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateAgentQueryInput,
			run: async (input) => {
				const request = input as unknown as AgentQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance:
							"agent 对应设置 → Agent 配置的实验开关。工作区/通知/执行模式 → general.*；语言 → appearance.theme；技能启停 → skills.*。",
						actions: [
							{ id: "agent.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "agent.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				const config = await readDesktopConfig();
				return toJsonValue({
					experimental: {
						vettaCli: config.experimental?.vettaCli !== false,
						promptPrediction: config.experimental?.promptPrediction !== false,
						agentSkills: config.experimental?.agentSkills !== false,
					},
				});
			},
		},
		{
			id: "agent.manage",
			domain: "agent",
			title: "修改 Agent 配置",
			summary: "修改 Agent 实验功能开关。",
			availability: "gui-main",
			permission: "agent.write",
			keywords: ["agent", "实验", "experimental", "vettaCli", "promptPrediction", "agentSkills"],
			approval: createOperationApprovals("agent.set-experimental", [
				{ id: "agent.set-experimental", title: "修改实验功能确认", description: "确认实验功能变更。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateAgentManageInput,
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as AgentManageInput;
				return await runActionService(async () => {
					const config = await readDesktopConfig();
					config.experimental = { ...config.experimental, ...request.data };
					await writeDesktopConfig(config);
					return { operation: "set-experimental", experimental: config.experimental };
				});
			},
		},
	];
}

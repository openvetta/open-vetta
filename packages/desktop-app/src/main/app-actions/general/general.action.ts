import { isAbsolute, resolve } from "node:path";
import { readDesktopConfig, writeDesktopConfig } from "../../ipc/fs.js";
import { getSandboxCapability } from "../../sandbox/capability.js";
import { createOperationApprovals, runActionService, toJsonValue } from "../shared.js";
import { type ActionDefinition, ActionError, type ActionExample, type ActionInputSchema } from "../types.js";
import {
	type GeneralManageInput,
	type GeneralQueryInput,
	validateGeneralManageInput,
	validateGeneralQueryInput,
} from "./general.schema.js";

const queryInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "help" 或 "get"。get 返回工作区、通知、默认执行模式与 sandbox 能力。对应设置 → 通用。界面语言 → appearance.theme；实验开关 → agent.*；知识库加工 → knowledge.*。',
	operations: [
		{
			name: "help",
			description: "返回 general（设置 → 通用）域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "get",
			description: "读取通用设置快照。",
			parameters: [{ name: "operation", type: '"get"', required: true, description: "固定为 get。" }],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "set-notifications"、"set-execution-mode" 或 "set-workspace"。实验功能 → agent.manage set-experimental；语言 → appearance.theme set-language。',
	operations: [
		{
			name: "set-notifications",
			description: "系统通知总开关。",
			parameters: [
				{
					name: "operation",
					type: '"set-notifications"',
					required: true,
					description: "固定为 set-notifications。",
				},
				{ name: "enabled", type: "boolean", required: true, description: "是否启用通知。" },
			],
		},
		{
			name: "set-execution-mode",
			description: "设置默认执行模式（沙盒 / 完整权限）。",
			parameters: [
				{
					name: "operation",
					type: '"set-execution-mode"',
					required: true,
					description: "固定为 set-execution-mode。",
				},
				{ name: "mode", type: '"sandbox" | "full-access"', required: true, description: "默认执行模式。" },
			],
		},
		{
			name: "set-workspace",
			description: "设置默认工作区绝对路径。",
			parameters: [
				{ name: "operation", type: '"set-workspace"', required: true, description: "固定为 set-workspace。" },
				{ name: "path", type: "string", required: true, description: "绝对路径。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [{ description: "读取通用设置", input: { operation: "get" } }];

const manageExamples: ActionExample[] = [
	{ description: "默认沙盒执行", input: { operation: "set-execution-mode", mode: "sandbox" } },
	{ description: "关闭系统通知", input: { operation: "set-notifications", enabled: false } },
];

export function createGeneralActions(): ActionDefinition[] {
	return [
		{
			id: "general.query",
			domain: "general",
			title: "查询通用设置",
			summary: "读取工作区、通知与默认执行模式（设置 → 通用）。",
			availability: "gui-main",
			permission: "general.read",
			keywords: ["通用", "general", "通知", "沙盒", "workspace", "工作区", "执行模式", "设置"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateGeneralQueryInput,
			run: async (input) => {
				const request = input as unknown as GeneralQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance:
							"general 对应设置 → 通用。语言 → appearance.theme（set-language）；Agent 实验开关 → agent.query / agent.manage；知识库加工 → knowledge.query get-processing / knowledge.manage set-processing；模型/MCP 用 models.* / mcp.*。",
						actions: [
							{ id: "general.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "general.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				const config = await readDesktopConfig();
				return toJsonValue({
					workspacePath: config.workspacePath,
					defaultExecutionMode: config.defaultExecutionMode,
					notificationsEnabled: config.notificationsEnabled !== false,
					debugMode: Boolean(config.debugMode),
					sandbox: getSandboxCapability(),
				});
			},
		},
		{
			id: "general.manage",
			domain: "general",
			title: "修改通用设置",
			summary: "修改通知、默认执行模式或工作区路径。",
			availability: "gui-main",
			permission: "general.write",
			keywords: ["通用", "通知", "沙盒", "full-access", "workspace", "工作区", "执行模式"],
			approval: createOperationApprovals("general.set-notifications", [
				{ id: "general.set-notifications", title: "修改通知设置确认", description: "确认通知开关。" },
				{ id: "general.set-execution-mode", title: "修改默认执行模式确认", description: "确认执行模式变更。" },
				{ id: "general.set-workspace", title: "修改工作区路径确认", description: "展示并可编辑工作区路径。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateGeneralManageInput,
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as GeneralManageInput;
				return await runActionService(async () => {
					const config = await readDesktopConfig();
					if (request.operation === "set-notifications") {
						config.notificationsEnabled = request.enabled;
						await writeDesktopConfig(config);
						return { operation: "set-notifications", enabled: request.enabled };
					}
					if (request.operation === "set-execution-mode") {
						config.defaultExecutionMode = request.mode;
						await writeDesktopConfig(config);
						return { operation: "set-execution-mode", mode: request.mode };
					}
					const path = resolve(request.path);
					if (!isAbsolute(path)) {
						throw new ActionError("ACTION_INVALID_INPUT", "workspace path must be absolute.");
					}
					config.workspacePath = path;
					await writeDesktopConfig(config);
					return { operation: "set-workspace", path };
				});
			},
		},
	];
}

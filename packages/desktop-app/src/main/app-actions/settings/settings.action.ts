import { isAbsolute, resolve } from "node:path";
import { getAppLanguage } from "../../i18n/index.js";
import { readDesktopConfig, writeDesktopConfig } from "../../ipc/fs.js";
import { applyAppLanguage } from "../../ipc/i18n.js";
import { getSandboxCapability } from "../../sandbox/capability.js";
import { createOperationApprovals, runActionService, toJsonValue } from "../shared.js";
import { type ActionDefinition, ActionError, type ActionExample, type ActionInputSchema } from "../types.js";
import {
	type SettingsManageInput,
	type SettingsQueryInput,
	validateSettingsManageInput,
	validateSettingsQueryInput,
} from "./settings.schema.js";

const queryInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "help" 或 "get"。get 返回语言、工作区、通知、默认执行模式、实验开关、知识库设置与 sandbox 能力，不返回登录 token。',
	operations: [
		{
			name: "help",
			description: "返回 settings 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "get",
			description: "读取可安全暴露的设置快照。",
			parameters: [{ name: "operation", type: '"get"', required: true, description: "固定为 get。" }],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "set-language"、"set-notifications"、"set-execution-mode"、"set-workspace"、"set-experimental" 或 "set-knowledge-base"。不提供账号/token 写入。',
	operations: [
		{
			name: "set-language",
			description: "切换界面语言 zh/en。",
			parameters: [
				{ name: "operation", type: '"set-language"', required: true, description: "固定为 set-language。" },
				{ name: "language", type: '"zh" | "en"', required: true, description: "界面语言。" },
			],
		},
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
			description: "设置默认执行模式。",
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
			description: "设置工作区绝对路径。",
			parameters: [
				{ name: "operation", type: '"set-workspace"', required: true, description: "固定为 set-workspace。" },
				{ name: "path", type: "string", required: true, description: "绝对路径。" },
			],
		},
		{
			name: "set-experimental",
			description: "patch 实验功能开关。",
			parameters: [
				{ name: "operation", type: '"set-experimental"', required: true, description: "固定为 set-experimental。" },
				{ name: "data", type: "object", required: true, description: "vettaCli/promptPrediction/agentSkills。" },
			],
		},
		{
			name: "set-knowledge-base",
			description: "patch 知识库加工设置。",
			parameters: [
				{
					name: "operation",
					type: '"set-knowledge-base"',
					required: true,
					description: "固定为 set-knowledge-base。",
				},
				{
					name: "data",
					type: "object",
					required: true,
					description: "enabled/pollIntervalMinutes/processingModelKey 等。",
				},
			],
		},
	],
};

const queryExamples: ActionExample[] = [{ description: "读取设置", input: { operation: "get" } }];

const manageExamples: ActionExample[] = [
	{ description: "切换英文", input: { operation: "set-language", language: "en" } },
	{ description: "默认沙盒执行", input: { operation: "set-execution-mode", mode: "sandbox" } },
	{ description: "开启知识库加工", input: { operation: "set-knowledge-base", data: { enabled: true } } },
];

export function createSettingsActions(): ActionDefinition[] {
	return [
		{
			id: "settings.query",
			domain: "settings",
			title: "查询应用设置",
			summary: "读取语言、工作区、通知、执行模式、实验开关与知识库设置。",
			availability: "gui-main",
			permission: "settings.read",
			keywords: ["设置", "settings", "语言", "language", "通知", "沙盒", "workspace", "执行模式"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateSettingsQueryInput,
			run: async (input) => {
				const request = input as unknown as SettingsQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "不要通过 settings 写入 server token 或账号凭证。模型配置用 models.*，MCP 用 mcp.*。",
						actions: [
							{ id: "settings.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "settings.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				const config = await readDesktopConfig();
				return toJsonValue({
					language: getAppLanguage(),
					workspacePath: config.workspacePath,
					defaultExecutionMode: config.defaultExecutionMode,
					notificationsEnabled: config.notificationsEnabled !== false,
					debugMode: Boolean(config.debugMode),
					experimental: {
						vettaCli: config.experimental?.vettaCli !== false,
						promptPrediction: config.experimental?.promptPrediction !== false,
						agentSkills: config.experimental?.agentSkills !== false,
					},
					knowledgeBase: config.knowledgeBase ?? {},
					sandbox: getSandboxCapability(),
				});
			},
		},
		{
			id: "settings.manage",
			domain: "settings",
			title: "修改应用设置",
			summary: "修改语言、通知、默认执行模式、工作区、实验开关或知识库加工配置。",
			availability: "gui-main",
			permission: "settings.write",
			keywords: ["设置", "语言", "通知", "沙盒", "full-access", "workspace", "知识库设置"],
			approval: createOperationApprovals("settings.set-language", [
				{ id: "settings.set-language", title: "修改界面语言确认", description: "确认语言切换。" },
				{ id: "settings.set-notifications", title: "修改通知设置确认", description: "确认通知开关。" },
				{ id: "settings.set-execution-mode", title: "修改默认执行模式确认", description: "确认执行模式变更。" },
				{ id: "settings.set-workspace", title: "修改工作区路径确认", description: "展示并可编辑工作区路径。" },
				{ id: "settings.set-experimental", title: "修改实验功能确认", description: "确认实验功能变更。" },
				{ id: "settings.set-knowledge-base", title: "修改知识库加工设置确认", description: "确认知识库设置变更。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateSettingsManageInput,
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as SettingsManageInput;
				return await runActionService(async () => {
					if (request.operation === "set-language") {
						await applyAppLanguage(request.language);
						return { operation: "set-language", language: request.language };
					}
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
					if (request.operation === "set-workspace") {
						const path = resolve(request.path);
						if (!isAbsolute(path)) {
							throw new ActionError("ACTION_INVALID_INPUT", "workspace path must be absolute.");
						}
						config.workspacePath = path;
						await writeDesktopConfig(config);
						return { operation: "set-workspace", path };
					}
					if (request.operation === "set-experimental") {
						config.experimental = { ...config.experimental, ...request.data };
						await writeDesktopConfig(config);
						return { operation: "set-experimental", experimental: config.experimental };
					}
					const kb = { ...config.knowledgeBase };
					const data = request.data;
					if (data.enabled !== undefined) kb.enabled = data.enabled;
					if (data.pollIntervalMinutes !== undefined) kb.pollIntervalMinutes = data.pollIntervalMinutes;
					if (data.processingModelKey === null) delete kb.processingModelKey;
					else if (data.processingModelKey !== undefined) kb.processingModelKey = data.processingModelKey;
					if (data.processingModelReasoningLevel === null) delete kb.processingModelReasoningLevel;
					else if (data.processingModelReasoningLevel !== undefined) {
						kb.processingModelReasoningLevel = data.processingModelReasoningLevel;
					}
					if (data.agentConcurrency !== undefined) kb.agentConcurrency = data.agentConcurrency;
					if (data.ocrConcurrency !== undefined) kb.ocrConcurrency = data.ocrConcurrency;
					config.knowledgeBase = kb;
					await writeDesktopConfig(config);
					return { operation: "set-knowledge-base", knowledgeBase: kb };
				});
			},
		},
	];
}

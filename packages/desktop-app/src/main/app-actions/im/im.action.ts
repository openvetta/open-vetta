import { getImHost } from "../../im-host/index.js";
import { readModelsConfig } from "../../ipc/fs.js";
import {
	createOperationApprovals,
	runActionService,
	throwAgentEntityNotFound,
	throwAgentInvalidInput,
	toJsonValue,
} from "../shared.js";
import { type ActionDefinition, ActionError, type ActionExample, type ActionInputSchema } from "../types.js";
import { type ImManageInput, type ImQueryInput, validateImManageInput, validateImQueryInput } from "./im.schema.js";

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help"、"status" 或 "logs"。不返回密钥。',
	operations: [
		{
			name: "help",
			description: "返回 im 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "status",
			description: "读取 IM/Claw 桥接状态。",
			parameters: [{ name: "operation", type: '"status"', required: true, description: "固定为 status。" }],
		},
		{
			name: "logs",
			description: "读取最近日志。",
			parameters: [
				{ name: "operation", type: '"logs"', required: true, description: "固定为 logs。" },
				{ name: "limit", type: "number", required: false, description: "条数，默认 50，最大 200。" },
			],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "set-enabled"、"restart" 或 "set-agent-model"。凭证绑定请在设置页完成。启用前需已配置 agentModel。',
	operations: [
		{
			name: "set-enabled",
			description: "启用或停用 IM 桥接。",
			parameters: [
				{ name: "operation", type: '"set-enabled"', required: true, description: "固定为 set-enabled。" },
				{ name: "enabled", type: "boolean", required: true, description: "是否启用。" },
			],
		},
		{
			name: "restart",
			description: "重启 IM sidecar。",
			parameters: [{ name: "operation", type: '"restart"', required: true, description: "固定为 restart。" }],
		},
		{
			name: "set-agent-model",
			description: "设置 IM 使用的模型；null 清除覆盖。",
			parameters: [
				{ name: "operation", type: '"set-agent-model"', required: true, description: "固定为 set-agent-model。" },
				{ name: "modelKey", type: "string | null", required: true, description: '"provider/modelId" 或 null。' },
			],
		},
	],
};

const queryExamples: ActionExample[] = [{ description: "查看 IM 状态", input: { operation: "status" } }];

const manageExamples: ActionExample[] = [
	{ description: "启用 IM", input: { operation: "set-enabled", enabled: true } },
	{ description: "重启 IM", input: { operation: "restart" } },
];

export function createImActions(): ActionDefinition[] {
	return [
		{
			id: "im.query",
			domain: "im",
			title: "查询 IM/Claw 状态",
			summary: "查看 IM 旁路桥接运行状态与日志。",
			availability: "gui-main",
			permission: "im.read",
			keywords: ["im", "claw", "飞书", "微信", "旁路", "sidecar"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateImQueryInput,
			run: async (input) => {
				const request = input as unknown as ImQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "绑定凭证请在设置 → Claw 完成；Action 可启停、重启与设置 agentModel。",
						actions: [
							{ id: "im.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "im.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				const host = getImHost();
				if (request.operation === "status") {
					const config = host.getPublicConfig();
					return toJsonValue({
						enabled: config.enabled,
						transport: config.transport,
						agentModel: config.agentModel ?? null,
						wechatBound: config.wechat.bound,
						feishuAppId: config.feishu.appId || null,
						runtime: host.getStatus(),
					});
				}
				const logs = host.getRecentLogs();
				const limit = request.limit ?? 50;
				return toJsonValue({ logs: logs.slice(-limit) });
			},
		},
		{
			id: "im.manage",
			domain: "im",
			title: "管理 IM/Claw",
			summary: "启用/停用 IM 桥接、重启或设置对话模型。",
			availability: "gui-main",
			permission: "im.write",
			keywords: ["im", "claw", "启用", "重启", "飞书"],
			approval: createOperationApprovals("im.set-enabled", [
				{ id: "im.set-enabled", title: "启用/停用 IM 旁路确认", description: "展示 IM 旁路启用状态变更。" },
				{ id: "im.restart", title: "重启 IM 旁路确认", description: "确认重启本地 IM 旁路。" },
				{ id: "im.set-agent-model", title: "设置 IM Agent 模型确认", description: "展示并可编辑 IM Agent 模型。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateImManageInput,
			assertReady: async (input) => {
				const request = input as unknown as ImManageInput;
				// set-enabled / restart 作用于全局配置，无需实体 id。
				// set-agent-model 若指定 modelKey，则模型必须存在。
				if (request.operation !== "set-agent-model" || request.modelKey === null) return;
				const modelKey = request.modelKey;
				const slash = modelKey.indexOf("/");
				if (slash <= 0) {
					throwAgentInvalidInput(
						`Refused set-agent-model before user approval: invalid modelKey=${JSON.stringify(modelKey)}. Expected "provider/modelId". Call models.query with {"operation":"list"} and join providers[].id + "/" + models[].id. Pass null to clear the dedicated model.`,
						{
							operation: "set-agent-model",
							idField: "modelKey",
							id: modelKey,
							queryAction: "models.query",
							queryExample: { operation: "list" },
						},
					);
				}
				const providerId = modelKey.slice(0, slash);
				const modelId = modelKey.slice(slash + 1);
				const config = await readModelsConfig();
				const provider = config.providers[providerId];
				if (!provider) {
					throwAgentEntityNotFound({
						operation: "set-agent-model",
						entity: "model provider",
						idField: "provider",
						id: providerId,
						queryAction: "models.query",
						queryExample: { operation: "list" },
						resultIdPath: "providers[].id",
						availableIds: Object.keys(config.providers ?? {}),
						extra: `Full modelKey was ${JSON.stringify(modelKey)}.`,
					});
				}
				const models = provider.models ?? [];
				if (models.length > 0 && !models.some((model) => model.id === modelId)) {
					throwAgentEntityNotFound({
						operation: "set-agent-model",
						entity: `model on provider ${providerId}`,
						idField: "modelKey",
						id: modelKey,
						queryAction: "models.query",
						queryExample: { operation: "list" },
						resultIdPath: 'providers[].id + "/" + providers[].models[].id',
						availableIds: models.map((model) => `${providerId}/${model.id}`),
					});
				}
			},
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as ImManageInput;
				return await runActionService(async () => {
					const host = getImHost();
					if (request.operation === "restart") {
						await host.restart();
						return { operation: "restart", status: host.getStatus() };
					}
					const enabled = host.getPublicConfig().enabled;
					if (request.operation === "set-agent-model") {
						const agentModel =
							request.modelKey === null
								? null
								: (() => {
										const slash = request.modelKey.indexOf("/");
										return {
											provider: request.modelKey.slice(0, slash),
											model: request.modelKey.slice(slash + 1),
											...(request.reasoningLevel ? { reasoningLevel: request.reasoningLevel } : {}),
										};
									})();
						const result = await host.setConfig({
							enabled,
							agentModel,
						});
						if (!result.ok) {
							throw new ActionError("ACTION_FAILED", result.error ?? "Failed to set IM agent model");
						}
						return { operation: "set-agent-model", status: host.getStatus() };
					}
					const result = await host.setConfig({ enabled: request.enabled });
					if (!result.ok) {
						throw new ActionError("ACTION_FAILED", result.error ?? "Failed to update IM config");
					}
					return { operation: "set-enabled", enabled: request.enabled, status: host.getStatus() };
				});
			},
		},
	];
}

import { getWebhookManager } from "../../webhook/index.js";
import { createOperationApprovals, runActionService, throwAgentEntityNotFound, toJsonValue } from "../shared.js";
import type { ActionDefinition, ActionExample, ActionInputSchema } from "../types.js";
import {
	validateWebhookManageInput,
	validateWebhookQueryInput,
	type WebhookManageInput,
	type WebhookQueryInput,
} from "./webhook.schema.js";

const queryInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "help"、"list" 或 "list-providers"。list 仅返回 urlMask，不返回完整 webhook URL。',
	operations: [
		{
			name: "help",
			description: "返回 webhook 域说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出推送端点。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
		{
			name: "list-providers",
			description: "列出支持的 provider。",
			parameters: [
				{ name: "operation", type: '"list-providers"', required: true, description: "固定为 list-providers。" },
			],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "create"、"update"、"set-enabled"、"delete"、"test" 或 "send"。create/update 可写 webhookUrl/signSecret。',
	operations: [
		{
			name: "create",
			description: "创建推送端点。",
			parameters: [
				{ name: "operation", type: '"create"', required: true, description: "固定为 create。" },
				{ name: "kind", type: '"feishu" | "dingtalk"', required: true, description: "通道类型。" },
				{ name: "webhookUrl", type: "string", required: true, description: "Webhook URL。" },
				{ name: "name", type: "string", required: false, description: "显示名。" },
				{ name: "signSecret", type: "string", required: false, description: "签名密钥。" },
			],
		},
		{
			name: "set-enabled",
			description: "启用或停用端点。",
			parameters: [
				{ name: "operation", type: '"set-enabled"', required: true, description: "固定为 set-enabled。" },
				{ name: "id", type: "string", required: true, description: "端点 id。" },
				{ name: "enabled", type: "boolean", required: true, description: "是否启用。" },
			],
		},
		{
			name: "test",
			description: "发送测试消息。",
			parameters: [
				{ name: "operation", type: '"test"', required: true, description: "固定为 test。" },
				{ name: "id", type: "string", required: true, description: "端点 id。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [{ description: "列出 webhook", input: { operation: "list" } }];
const manageExamples: ActionExample[] = [
	{
		description: "创建飞书 webhook",
		input: {
			operation: "create",
			kind: "feishu",
			name: "通知机器人",
			webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
		},
	},
	{ description: "发送测试", input: { operation: "test", id: "..." } },
];

export function createWebhookActions(): ActionDefinition[] {
	return [
		{
			id: "webhook.query",
			domain: "webhook",
			title: "查询消息推送",
			summary: "列出 Webhook 端点与支持的 provider。",
			availability: "gui-main",
			permission: "webhook.read",
			keywords: ["webhook", "推送", "飞书", "钉钉", "通知", "机器人"],
			inputSchema: queryInputSchema,
			examples: queryExamples,
			validateInput: validateWebhookQueryInput,
			run: async (input) => {
				const request = input as unknown as WebhookQueryInput;
				if (request.operation === "help") {
					return toJsonValue({
						guidance: "list 只返回脱敏 urlMask；完整 URL 仅在 create/update 时提交。",
						actions: [
							{ id: "webhook.query", inputSchema: queryInputSchema, examples: queryExamples },
							{ id: "webhook.manage", inputSchema: manageInputSchema, examples: manageExamples },
						],
					});
				}
				const manager = getWebhookManager();
				if (request.operation === "list-providers") {
					return toJsonValue({ providers: manager.listProviderDescriptors() });
				}
				return toJsonValue({ endpoints: manager.list() });
			},
		},
		{
			id: "webhook.manage",
			domain: "webhook",
			title: "管理消息推送",
			summary: "创建、更新、启停、删除 Webhook，或发送测试/自定义消息。",
			availability: "gui-main",
			permission: "webhook.write",
			keywords: ["webhook", "推送", "飞书", "钉钉", "机器人", "发送"],
			approval: createOperationApprovals("webhook.create", [
				{ id: "webhook.create", title: "创建 Webhook 确认", description: "展示并可编辑 Webhook 配置。" },
				{ id: "webhook.update", title: "更新 Webhook 确认", description: "加载当前配置并允许编辑后确认。" },
				{ id: "webhook.set-enabled", title: "启用/停用 Webhook 确认", description: "展示 Webhook 启用状态变更。" },
				{ id: "webhook.delete", title: "删除 Webhook 确认", description: "展示待删除 Webhook。" },
				{ id: "webhook.test", title: "测试 Webhook 确认", description: "确认发送测试消息。" },
				{ id: "webhook.send", title: "发送 Webhook 消息确认", description: "展示并可编辑消息内容。" },
			]),
			inputSchema: manageInputSchema,
			examples: manageExamples,
			validateInput: validateWebhookManageInput,
			assertReady: (input) => {
				const request = input as unknown as WebhookManageInput;
				if (request.operation === "create") return;
				const manager = getWebhookManager();
				const endpoints = manager.list();
				const endpoint = endpoints.find((item) => item.id === request.id);
				if (!endpoint) {
					throwAgentEntityNotFound({
						operation: request.operation,
						entity: "webhook endpoint",
						idField: "id",
						id: request.id,
						queryAction: "webhook.query",
						queryExample: { operation: "list" },
						resultIdPath: "endpoints[].id",
						availableIds: endpoints.map((item) => item.id),
						extra: "Do not use display name or urlMask as id.",
					});
				}
			},
			requiresApproval: (_input, context) => context.source === "local-server",
			run: async (input) => {
				const request = input as unknown as WebhookManageInput;
				return await runActionService(async () => {
					const manager = getWebhookManager();
					switch (request.operation) {
						case "create":
							return {
								operation: "create",
								endpoint: manager.create({
									kind: request.kind,
									name: request.name?.trim() || `${request.kind} bot`,
									webhookUrl: request.webhookUrl,
									signSecret: request.signSecret,
									enabled: request.enabled,
								}),
							};
						case "update":
							return { operation: "update", endpoint: manager.update(request.id, request.data) };
						case "set-enabled":
							return {
								operation: "set-enabled",
								endpoint: manager.setEnabled(request.id, request.enabled),
							};
						case "delete":
							manager.delete(request.id);
							return { operation: "delete", id: request.id };
						case "test":
							return { operation: "test", result: await manager.test(request.id) };
						case "send":
							return {
								operation: "send",
								result: await manager.send(request.id, {
									text: request.text,
									title: request.title,
									level: request.level,
								}),
							};
					}
				});
			},
		},
	];
}

import type { ModelsConfig, ProviderConfig } from "../../ipc/fs.js";
import { readModelsConfig, writeModelsConfig } from "../../ipc/fs.js";
import { probeModelProvider } from "../../models/probe.js";
import { getOrCreateSharedModelRegistry } from "../../runtime.js";
import {
	assertEntityExists,
	createOperationApprovals,
	maskSecret,
	redactRecordSecrets,
	runActionService,
	throwAgentEntityNotFound,
	throwAgentInvalidInput,
	toJsonValue,
} from "../shared.js";
import { type ActionDefinition, ActionError, type ActionExample, type ActionInputSchema } from "../types.js";
import {
	type ModelsManageInput,
	type ModelsQueryInput,
	validateModelsManageInput,
	validateModelsQueryInput,
} from "./models.schema.js";

const queryInputSchema: ActionInputSchema = {
	description: '对象参数；operation 为 "help"、"list"、"get" 或 "probe"。返回结果会脱敏 apiKey/headers 中的密钥。',
	operations: [
		{
			name: "help",
			description: "返回 models 域全部 Action 说明。",
			parameters: [{ name: "operation", type: '"help"', required: true, description: "固定为 help。" }],
		},
		{
			name: "list",
			description: "列出默认模型与全部 providers（密钥已脱敏）。",
			parameters: [{ name: "operation", type: '"list"', required: true, description: "固定为 list。" }],
		},
		{
			name: "get",
			description: "读取完整 models 配置，或指定 provider。",
			parameters: [
				{ name: "operation", type: '"get"', required: true, description: "固定为 get。" },
				{ name: "provider", type: "string", required: false, description: "provider 标识；省略则返回完整配置。" },
			],
		},
		{
			name: "probe",
			description: "探测 provider/model 的 baseUrl 是否可达。",
			parameters: [
				{ name: "operation", type: '"probe"', required: true, description: "固定为 probe。" },
				{ name: "provider", type: "string", required: true, description: "provider 标识。" },
				{ name: "model", type: "string", required: true, description: "模型 id。" },
			],
		},
	],
};

const manageInputSchema: ActionInputSchema = {
	description:
		'对象参数；operation 为 "set-default"、"upsert-provider" 或 "remove-provider"。写操作需要用户确认。modelKey 格式为 "provider/modelId"。upsert 为 patch：只提交要改的字段。',
	operations: [
		{
			name: "set-default",
			description: "设置默认对话模型。",
			parameters: [
				{ name: "operation", type: '"set-default"', required: true, description: "固定为 set-default。" },
				{ name: "modelKey", type: "string", required: true, description: '"provider/modelId"。' },
			],
		},
		{
			name: "upsert-provider",
			description: "创建或 patch 更新 provider；可写 baseUrl/apiKey/models 等。",
			parameters: [
				{ name: "operation", type: '"upsert-provider"', required: true, description: "固定为 upsert-provider。" },
				{ name: "provider", type: "string", required: true, description: "provider 标识。" },
				{ name: "data", type: "object", required: true, description: "要写入的字段子集。" },
			],
		},
		{
			name: "remove-provider",
			description: "删除本地 provider。",
			parameters: [
				{ name: "operation", type: '"remove-provider"', required: true, description: "固定为 remove-provider。" },
				{ name: "provider", type: "string", required: true, description: "provider 标识。" },
			],
		},
	],
};

const queryExamples: ActionExample[] = [
	{ description: "查看帮助", input: { operation: "help" } },
	{ description: "列出模型配置", input: { operation: "list" } },
	{ description: "探测模型可达性", input: { operation: "probe", provider: "openai", model: "gpt-4o" } },
];

const manageExamples: ActionExample[] = [
	{ description: "设置默认模型", input: { operation: "set-default", modelKey: "openai/gpt-4o" } },
	{
		description: "更新 provider API Key",
		input: { operation: "upsert-provider", provider: "openai", data: { apiKey: "sk-..." } },
	},
];

function redactProvider(provider: ProviderConfig): ProviderConfig {
	return {
		...provider,
		apiKey: maskSecret(provider.apiKey),
		headers: redactRecordSecrets(provider.headers),
	};
}

function redactModelsConfig(config: ModelsConfig): ModelsConfig {
	const providers: Record<string, ProviderConfig> = {};
	for (const [key, value] of Object.entries(config.providers ?? {})) {
		providers[key] = redactProvider(value);
	}
	return { ...config, providers };
}

function assertModelKeyExists(config: ModelsConfig, modelKey: string, operation = "set-default"): void {
	const slash = modelKey.indexOf("/");
	if (slash <= 0) {
		throwAgentInvalidInput(
			`Refused operation "${operation}" before user approval: invalid modelKey=${JSON.stringify(modelKey)}. Expected format "provider/modelId" (example: "openai/gpt-4o"). Call models.query with {"operation":"list"} and use providers[].id + models[].id joined by "/".`,
			{
				operation,
				idField: "modelKey",
				id: modelKey,
				queryAction: "models.query",
				queryExample: { operation: "list" },
				resultIdPath: 'providers[].id + "/" + providers[].models[].id',
			},
		);
	}
	const providerId = modelKey.slice(0, slash);
	const modelId = modelKey.slice(slash + 1);
	const provider = config.providers[providerId];
	if (!provider) {
		throwAgentEntityNotFound({
			operation,
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
	// 未声明 models 列表的 provider 允许任意 modelId（兼容自定义端点）。
	if (models.length > 0 && !models.some((model) => model.id === modelId)) {
		throwAgentEntityNotFound({
			operation,
			entity: `model on provider ${providerId}`,
			idField: "modelKey",
			id: modelKey,
			queryAction: "models.query",
			queryExample: { operation: "list" },
			resultIdPath: 'providers[].id + "/" + providers[].models[].id',
			availableIds: models.map((model) => `${providerId}/${model.id}`),
			extra: `Provider ${JSON.stringify(providerId)} exists, but model id ${JSON.stringify(modelId)} is not in its models list.`,
		});
	}
}

async function persistModelsConfig(config: ModelsConfig): Promise<void> {
	await writeModelsConfig(config);
	await getOrCreateSharedModelRegistry().refresh();
}

export function createModelsActions(): ActionDefinition[] {
	const queryAction: ActionDefinition = {
		id: "models.query",
		domain: "models",
		title: "查询模型配置",
		summary: "查看默认模型、provider 列表，或探测模型服务可达性。返回结果会脱敏密钥。",
		availability: "gui-main",
		permission: "models.read",
		keywords: ["模型", "model", "provider", "服务商", "defaultModel", "API Key", "probe", "默认模型"],
		inputSchema: queryInputSchema,
		examples: queryExamples,
		validateInput: validateModelsQueryInput,
		run: async (input) => {
			const request = input as unknown as ModelsQueryInput;
			if (request.operation === "help") {
				return toJsonValue({
					guidance: "写操作使用 models.manage。list/get 返回的 apiKey 为 ***，不要把脱敏值写回 upsert。",
					actions: [
						{ id: "models.query", inputSchema: queryInputSchema, examples: queryExamples },
						{ id: "models.manage", inputSchema: manageInputSchema, examples: manageExamples },
					],
				});
			}
			if (request.operation === "probe") {
				return await runActionService(() =>
					probeModelProvider({ provider: request.provider, model: request.model }),
				);
			}
			const config = await readModelsConfig();
			if (request.operation === "list") {
				return toJsonValue({
					defaultModel: config.defaultModel ?? null,
					providers: Object.entries(config.providers ?? {}).map(([id, provider]) => ({
						id,
						displayName: provider.displayName ?? id,
						baseUrl: provider.baseUrl,
						api: provider.api,
						hasApiKey: Boolean(provider.apiKey),
						modelCount: provider.models?.length ?? 0,
						models: (provider.models ?? []).map((model) => ({
							id: model.id,
							name: model.name,
							api: model.api,
							reasoning: model.reasoning,
						})),
					})),
				});
			}
			if (request.provider) {
				const provider = config.providers[request.provider];
				if (!provider) throw new ActionError("ACTION_NOT_FOUND", `Provider not found: ${request.provider}`);
				return toJsonValue({ provider: request.provider, ...redactProvider(provider) });
			}
			return toJsonValue(redactModelsConfig(config));
		},
	};

	const manageAction: ActionDefinition = {
		id: "models.manage",
		domain: "models",
		title: "管理模型配置",
		summary: "设置默认模型，创建或更新 provider，删除 provider。",
		availability: "gui-main",
		permission: "models.write",
		keywords: ["模型", "model", "provider", "默认模型", "API Key", "服务商", "set-default"],
		approval: createOperationApprovals("models.set-default", [
			{ id: "models.set-default", title: "设置默认模型确认", description: "确认默认对话模型变更。" },
			{ id: "models.upsert-provider", title: "创建或更新模型服务商确认", description: "展示并可编辑服务商配置。" },
			{ id: "models.remove-provider", title: "删除模型服务商确认", description: "展示待删除服务商。" },
		]),
		inputSchema: manageInputSchema,
		examples: manageExamples,
		validateInput: validateModelsManageInput,
		assertReady: async (input) => {
			const request = input as unknown as ModelsManageInput;
			const config = await readModelsConfig();
			if (request.operation === "set-default") {
				assertModelKeyExists(config, request.modelKey, request.operation);
				return;
			}
			if (request.operation === "remove-provider" && !config.providers[request.provider]) {
				throwAgentEntityNotFound({
					operation: request.operation,
					entity: "model provider",
					idField: "provider",
					id: request.provider,
					queryAction: "models.query",
					queryExample: { operation: "list" },
					resultIdPath: "providers[].id",
					availableIds: Object.keys(config.providers ?? {}),
				});
			}
			// upsert-provider 可创建，不要求已存在。
		},
		requiresApproval: (_input, context) => context.source === "local-server",
		run: async (input) => {
			const request = input as unknown as ModelsManageInput;
			return await runActionService(async () => {
				const config = await readModelsConfig();
				if (request.operation === "set-default") {
					assertModelKeyExists(config, request.modelKey);
					config.defaultModel = request.modelKey;
					await persistModelsConfig(config);
					return { operation: "set-default", defaultModel: config.defaultModel };
				}
				if (request.operation === "remove-provider") {
					assertEntityExists(config.providers[request.provider], `Provider not found: ${request.provider}`);
					delete config.providers[request.provider];
					if (config.defaultModel?.startsWith(`${request.provider}/`)) {
						delete config.defaultModel;
					}
					await persistModelsConfig(config);
					return { operation: "remove-provider", provider: request.provider };
				}
				const existing = config.providers[request.provider] ?? {};
				const next: ProviderConfig = { ...existing };
				const data = request.data;
				if (data.baseUrl !== undefined) next.baseUrl = data.baseUrl;
				if (data.apiKey !== undefined) next.apiKey = data.apiKey;
				if (data.api !== undefined) next.api = data.api;
				if (data.displayName !== undefined) next.displayName = data.displayName;
				if (data.authHeader !== undefined) next.authHeader = data.authHeader;
				if (data.headers !== undefined) next.headers = data.headers;
				if (data.models !== undefined) next.models = data.models;
				config.providers[request.provider] = next;
				await persistModelsConfig(config);
				return {
					operation: "upsert-provider",
					provider: request.provider,
					config: redactProvider(next),
				};
			});
		},
	};

	return [queryAction, manageAction];
}

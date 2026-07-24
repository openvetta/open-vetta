import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import type {
	ModelConfigSnapshot,
	ModelDefaultResult,
	ModelDefinitionDetail,
	ModelListResult,
	ModelProviderConfigSnapshot,
	ModelProviderDetail,
	ModelProviderUpsertData,
} from "@vetta/capability-sdk";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";

export interface ModelsConfig {
	defaultModel?: string;
	providers: Record<string, ProviderConfig>;
}

export interface ProviderConfig {
	baseUrl?: string;
	apiKey?: string;
	api?: string;
	headers?: Record<string, string>;
	authHeader?: boolean;
	displayName?: string;
	source?: "template";
	templateId?: string;
	icon?: string;
	models?: ModelDefinition[];
	modelOverrides?: Record<string, Record<string, unknown>>;
}

export interface ModelDefinition {
	id: string;
	modelId?: string;
	name?: string;
	api?: string;
	reasoning?: boolean;
	reasoningLevels?: string[];
	defaultReasoningLevel?: string;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface ModelSettingsServiceOptions {
	readonly readConfig: () => Promise<ModelsConfig>;
	readonly refreshRegistry: () => Promise<void>;
	readonly writeConfig: (config: ModelsConfig) => Promise<void>;
}

const MODELS_CONFIG_PATH = join(getVettaHomePath(), "agent", "models.json");
const DEFAULT_MODELS_CONFIG: ModelsConfig = { providers: {} };

function stripLegacyPeripheralFields(config: ModelsConfig): ModelsConfig {
	const next = { ...config } as ModelsConfig & {
		peripheralModel?: unknown;
		peripheralModelReasoningLevel?: unknown;
	};
	delete next.peripheralModel;
	delete next.peripheralModelReasoningLevel;
	return next;
}

export async function readModelsConfig(): Promise<ModelsConfig> {
	try {
		const raw = await readFile(MODELS_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<ModelsConfig>;
		return stripLegacyPeripheralFields({
			...DEFAULT_MODELS_CONFIG,
			...parsed,
			providers:
				typeof parsed.providers === "object" && parsed.providers !== null && !Array.isArray(parsed.providers)
					? parsed.providers
					: {},
		});
	} catch {
		return { providers: {} };
	}
}

export async function writeModelsConfig(config: ModelsConfig): Promise<void> {
	atomicWriteJSON(MODELS_CONFIG_PATH, stripLegacyPeripheralFields(config));
}

function maskSecret(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	if (value.length === 0) return "";
	return "***";
}

function redactRecordSecrets(
	record: Record<string, string> | undefined,
	secretKeys: readonly string[] = ["authorization", "api-key", "apikey", "x-api-key", "token", "secret", "password"],
): Record<string, string> | undefined {
	if (!record) return undefined;
	const next: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		const lower = key.toLowerCase();
		next[key] = secretKeys.some((secretKey) => lower.includes(secretKey)) ? "***" : value;
	}
	return next;
}

function copyModel(model: ModelDefinition): ModelDefinitionDetail {
	return {
		id: model.id,
		...(model.modelId === undefined ? {} : { modelId: model.modelId }),
		...(model.name === undefined ? {} : { name: model.name }),
		...(model.api === undefined ? {} : { api: model.api }),
		...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
		...(model.reasoningLevels === undefined ? {} : { reasoningLevels: [...model.reasoningLevels] }),
		...(model.defaultReasoningLevel === undefined ? {} : { defaultReasoningLevel: model.defaultReasoningLevel }),
		...(model.input === undefined ? {} : { input: [...model.input] }),
		...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
		...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
		...(model.cost === undefined ? {} : { cost: { ...model.cost } }),
	};
}

function redactProvider(provider: ProviderConfig): ModelProviderConfigSnapshot {
	const apiKey = maskSecret(provider.apiKey);
	const headers = redactRecordSecrets(provider.headers);
	return {
		...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
		...(apiKey === undefined ? {} : { apiKey }),
		...(provider.api === undefined ? {} : { api: provider.api }),
		...(provider.displayName === undefined ? {} : { displayName: provider.displayName }),
		...(provider.authHeader === undefined ? {} : { authHeader: provider.authHeader }),
		...(headers === undefined ? {} : { headers }),
		...(provider.models === undefined ? {} : { models: provider.models.map(copyModel) }),
	};
}

function assertModelKeyExists(config: ModelsConfig, modelKey: string, operation: string): void {
	const slash = modelKey.indexOf("/");
	if (slash <= 0) {
		throw new Error(
			`Refused operation "${operation}": invalid modelKey=${JSON.stringify(modelKey)}. Expected "provider/modelId".`,
		);
	}
	const providerId = modelKey.slice(0, slash);
	const modelId = modelKey.slice(slash + 1);
	const provider = config.providers[providerId];
	if (!provider) {
		throw new Error(
			`Refused operation "${operation}": model provider ${JSON.stringify(providerId)} not found. Call models.query list.`,
		);
	}
	const models = provider.models ?? [];
	if (models.length > 0 && !models.some((model) => model.id === modelId)) {
		throw new Error(
			`Refused operation "${operation}": model ${JSON.stringify(modelKey)} not found on provider ${JSON.stringify(providerId)}.`,
		);
	}
}

export class ModelSettingsService {
	private mutationQueue: Promise<void> = Promise.resolve();

	constructor(private readonly options: ModelSettingsServiceOptions) {}

	async getConfig(): Promise<ModelsConfig> {
		await this.mutationQueue;
		return this.options.readConfig();
	}

	async replaceConfig(config: ModelsConfig): Promise<void> {
		await this.runMutation(async () => {
			await this.persist(config);
		});
	}

	async list(): Promise<ModelListResult> {
		const config = await this.getConfig();
		return {
			defaultModel: config.defaultModel ?? null,
			providers: Object.entries(config.providers).map(([id, provider]) => ({
				id,
				displayName: provider.displayName ?? id,
				...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
				...(provider.api === undefined ? {} : { api: provider.api }),
				hasApiKey: Boolean(provider.apiKey),
				modelCount: provider.models?.length ?? 0,
				models: (provider.models ?? []).map((model) => ({
					id: model.id,
					...(model.name === undefined ? {} : { name: model.name }),
					...(model.api === undefined ? {} : { api: model.api }),
					...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
				})),
			})),
		};
	}

	async getSanitizedConfig(): Promise<ModelConfigSnapshot> {
		const config = await this.getConfig();
		const providers: Record<string, ModelProviderConfigSnapshot> = {};
		for (const [id, provider] of Object.entries(config.providers)) providers[id] = redactProvider(provider);
		return {
			...(config.defaultModel === undefined ? {} : { defaultModel: config.defaultModel }),
			providers,
		};
	}

	async getSanitizedProvider(providerId: string): Promise<ModelProviderDetail> {
		const config = await this.getConfig();
		const provider = config.providers[providerId];
		if (!provider) throw new Error(`Provider not found: ${providerId}`);
		return { provider: providerId, ...redactProvider(provider) };
	}

	async validateModelKey(modelKey: string, operation = "set-default"): Promise<void> {
		assertModelKeyExists(await this.getConfig(), modelKey, operation);
	}

	async setDefault(modelKey: string): Promise<ModelDefaultResult> {
		return this.runMutation(async () => {
			const config = await this.options.readConfig();
			assertModelKeyExists(config, modelKey, "set-default");
			await this.persist({ ...config, defaultModel: modelKey });
			return { defaultModel: modelKey };
		});
	}

	async upsertProvider(providerId: string, data: ModelProviderUpsertData): Promise<ModelProviderConfigSnapshot> {
		return this.runMutation(async () => {
			const config = await this.options.readConfig();
			const existing = config.providers[providerId] ?? {};
			const next: ProviderConfig = { ...existing };
			if (data.baseUrl !== undefined) next.baseUrl = data.baseUrl;
			if (data.apiKey !== undefined) next.apiKey = data.apiKey;
			if (data.api !== undefined) next.api = data.api;
			if (data.displayName !== undefined) next.displayName = data.displayName;
			if (data.authHeader !== undefined) next.authHeader = data.authHeader;
			if (data.headers !== undefined) next.headers = { ...data.headers };
			if (data.models !== undefined) next.models = data.models.map((model) => ({ ...model }));
			await this.persist({ ...config, providers: { ...config.providers, [providerId]: next } });
			return redactProvider(next);
		});
	}

	async removeProvider(providerId: string): Promise<void> {
		await this.runMutation(async () => {
			const config = await this.options.readConfig();
			if (!config.providers[providerId]) throw new Error(`Provider not found: ${providerId}`);
			const providers = { ...config.providers };
			delete providers[providerId];
			const next = { ...config, providers };
			if (next.defaultModel?.startsWith(`${providerId}/`)) delete next.defaultModel;
			await this.persist(next);
		});
	}

	private async persist(config: ModelsConfig): Promise<void> {
		await this.options.writeConfig(config);
		await this.options.refreshRegistry();
	}

	private runMutation<Result>(mutation: () => Promise<Result>): Promise<Result> {
		const result = this.mutationQueue.then(mutation, mutation);
		this.mutationQueue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}
}

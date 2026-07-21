import type {
	PluginOfficialApi,
	PluginOfficialProviderDetail,
	PluginOfficialProviderUpsertData,
} from "@vetta-org/plugin-sdk";

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

function redactProvider(provider: {
	baseUrl?: string;
	apiKey?: string;
	api?: string;
	displayName?: string;
	authHeader?: boolean;
	headers?: Record<string, string>;
	models?: Array<{
		id: string;
		name?: string;
		api?: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}>;
}): PluginOfficialProviderDetail {
	return {
		baseUrl: provider.baseUrl,
		apiKey: maskSecret(provider.apiKey),
		api: provider.api,
		displayName: provider.displayName,
		authHeader: provider.authHeader,
		headers: redactRecordSecrets(provider.headers),
		models: provider.models,
	};
}

export async function assertOfficialModelKeyExists(modelKey: string, operation = "set-default"): Promise<void> {
	const slash = modelKey.indexOf("/");
	if (slash <= 0) {
		throw new Error(
			`Refused operation "${operation}": invalid modelKey=${JSON.stringify(modelKey)}. Expected "provider/modelId".`,
		);
	}
	const providerId = modelKey.slice(0, slash);
	const modelId = modelKey.slice(slash + 1);
	const config = await window.vetta.models.get();
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

export function createOfficialModelsApi(assertOfficial: () => void): PluginOfficialApi["models"] {
	return {
		list: async () => {
			assertOfficial();
			const config = await window.vetta.models.get();
			return {
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
			};
		},
		get: async (provider) => {
			assertOfficial();
			const config = await window.vetta.models.get();
			if (provider) {
				const item = config.providers[provider];
				if (!item) throw new Error(`Provider not found: ${provider}`);
				return { provider, ...redactProvider(item) };
			}
			const providers: Record<string, PluginOfficialProviderDetail> = {};
			for (const [key, value] of Object.entries(config.providers ?? {})) providers[key] = redactProvider(value);
			return { ...config, providers };
		},
		probe: async (provider, model) => {
			assertOfficial();
			return window.vetta.models.probe({ provider, model });
		},
		listProviderIds: async () => {
			assertOfficial();
			const config = await window.vetta.models.get();
			return Object.keys(config.providers ?? {});
		},
		assertModelKeyExists: async (modelKey, operation) => {
			assertOfficial();
			await assertOfficialModelKeyExists(modelKey, operation);
		},
		setDefault: async (modelKey) => {
			assertOfficial();
			await assertOfficialModelKeyExists(modelKey, "set-default");
			const config = await window.vetta.models.get();
			config.defaultModel = modelKey;
			await window.vetta.models.set(config);
			return { defaultModel: modelKey };
		},
		upsertProvider: async (provider, data: PluginOfficialProviderUpsertData) => {
			assertOfficial();
			const config = await window.vetta.models.get();
			const existing = config.providers[provider] ?? {};
			const next = { ...existing };
			if (data.baseUrl !== undefined) next.baseUrl = data.baseUrl;
			if (data.apiKey !== undefined) next.apiKey = data.apiKey;
			if (data.api !== undefined) next.api = data.api;
			if (data.displayName !== undefined) next.displayName = data.displayName;
			if (data.authHeader !== undefined) next.authHeader = data.authHeader;
			if (data.headers !== undefined) next.headers = data.headers;
			if (data.models !== undefined) next.models = data.models;
			config.providers[provider] = next;
			await window.vetta.models.set(config);
			return redactProvider(next);
		},
		removeProvider: async (provider) => {
			assertOfficial();
			const config = await window.vetta.models.get();
			if (!config.providers[provider]) throw new Error(`Provider not found: ${provider}`);
			delete config.providers[provider];
			if (config.defaultModel?.startsWith(`${provider}/`)) delete config.defaultModel;
			await window.vetta.models.set(config);
		},
	};
}

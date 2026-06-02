/**
 * Model registry - manages built-in and custom models, provides API key resolution.
 */

import {
	type Api,
	type AssistantMessageEventStream,
	type Context,
	getModels,
	getProviders,
	type KnownProvider,
	type Model,
	type OAuthProviderInterface,
	type OpenAICompletionsCompat,
	type OpenAIResponsesCompat,
	registerApiProvider,
	registerOAuthProvider,
	type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import { type Static, Type } from "@sinclair/typebox";
import AjvModule from "ajv";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAgentDir } from "../config.js";
import type { AuthStorage } from "./auth-storage.js";
import { clearConfigValueCache, resolveConfigValue, resolveHeaders } from "./resolve-config-value.js";

const Ajv = (AjvModule as any).default || AjvModule;

/**
 * Normalize common API type aliases to their registered names.
 * Users may write "anthropic" or "openai" in configs, but the registry
 * uses "anthropic-messages" and "openai-completions" respectively.
 */
const API_TYPE_ALIASES: Record<string, string> = {
	anthropic: "anthropic-messages",
	openai: "openai-completions",
};

function normalizeApiType(api: string): string {
	return API_TYPE_ALIASES[api] ?? api;
}

// Schema for OpenRouter routing preferences
const OpenRouterRoutingSchema = Type.Object({
	only: Type.Optional(Type.Array(Type.String())),
	order: Type.Optional(Type.Array(Type.String())),
});

// Schema for Vercel AI Gateway routing preferences
const VercelGatewayRoutingSchema = Type.Object({
	only: Type.Optional(Type.Array(Type.String())),
	order: Type.Optional(Type.Array(Type.String())),
});

// Schema for OpenAI compatibility settings
const OpenAICompletionsCompatSchema = Type.Object({
	supportsStore: Type.Optional(Type.Boolean()),
	supportsDeveloperRole: Type.Optional(Type.Boolean()),
	supportsReasoningEffort: Type.Optional(Type.Boolean()),
	supportsUsageInStreaming: Type.Optional(Type.Boolean()),
	maxTokensField: Type.Optional(Type.Union([Type.Literal("max_completion_tokens"), Type.Literal("max_tokens")])),
	requiresToolResultName: Type.Optional(Type.Boolean()),
	requiresAssistantAfterToolResult: Type.Optional(Type.Boolean()),
	requiresThinkingAsText: Type.Optional(Type.Boolean()),
	requiresMistralToolIds: Type.Optional(Type.Boolean()),
	thinkingFormat: Type.Optional(
		Type.Union([Type.Literal("openai"), Type.Literal("zai"), Type.Literal("qwen"), Type.Literal("nvidia")]),
	),
	openRouterRouting: Type.Optional(OpenRouterRoutingSchema),
	vercelGatewayRouting: Type.Optional(VercelGatewayRoutingSchema),
});

const OpenAIResponsesCompatSchema = Type.Object({
	// Reserved for future use
});

const OpenAICompatSchema = Type.Union([OpenAICompletionsCompatSchema, OpenAIResponsesCompatSchema]);

// Schema for custom model definition
// Most fields are optional with sensible defaults for local models (Ollama, LM Studio, etc.)
const ModelDefinitionSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	name: Type.Optional(Type.String({ minLength: 1 })),
	api: Type.Optional(Type.String({ minLength: 1 })),
	reasoning: Type.Optional(Type.Boolean()),
	input: Type.Optional(Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")]))),
	cost: Type.Optional(
		Type.Object({
			input: Type.Number(),
			output: Type.Number(),
			cacheRead: Type.Number(),
			cacheWrite: Type.Number(),
		}),
	),
	contextWindow: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	compat: Type.Optional(OpenAICompatSchema),
});

// Schema for per-model overrides (all fields optional, merged with built-in model)
const ModelOverrideSchema = Type.Object({
	name: Type.Optional(Type.String({ minLength: 1 })),
	reasoning: Type.Optional(Type.Boolean()),
	input: Type.Optional(Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")]))),
	cost: Type.Optional(
		Type.Object({
			input: Type.Optional(Type.Number()),
			output: Type.Optional(Type.Number()),
			cacheRead: Type.Optional(Type.Number()),
			cacheWrite: Type.Optional(Type.Number()),
		}),
	),
	contextWindow: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	compat: Type.Optional(OpenAICompatSchema),
});

type ModelOverride = Static<typeof ModelOverrideSchema>;

const ProviderConfigSchema = Type.Object({
	baseUrl: Type.Optional(Type.String({ minLength: 1 })),
	apiKey: Type.Optional(Type.String({ minLength: 1 })),
	api: Type.Optional(Type.String({ minLength: 1 })),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	authHeader: Type.Optional(Type.Boolean()),
	compat: Type.Optional(OpenAICompatSchema),
	// 预设模板采纳标记(desktop 写入,coding-agent 仅需容忍不报错,复用同一份 models.json)。
	source: Type.Optional(Type.String()),
	templateId: Type.Optional(Type.String()),
	icon: Type.Optional(Type.String()),
	displayName: Type.Optional(Type.String()),
	models: Type.Optional(Type.Array(ModelDefinitionSchema)),
	modelOverrides: Type.Optional(Type.Record(Type.String(), ModelOverrideSchema)),
});

const ModelsConfigSchema = Type.Object({
	providers: Type.Record(Type.String(), ProviderConfigSchema),
});

type ModelsConfig = Static<typeof ModelsConfigSchema>;

/** Provider override config (baseUrl, headers, apiKey) without custom models */
interface ProviderOverride {
	baseUrl?: string;
	headers?: Record<string, string>;
	apiKey?: string;
}

/** Result of loading custom models from models.json */
interface CustomModelsResult {
	models: Model<Api>[];
	/** Providers with baseUrl/headers/apiKey overrides for built-in models */
	overrides: Map<string, ProviderOverride>;
	/** Per-model overrides: provider -> modelId -> override */
	modelOverrides: Map<string, Map<string, ModelOverride>>;
	error: string | undefined;
}

function emptyCustomModelsResult(error?: string): CustomModelsResult {
	return { models: [], overrides: new Map(), modelOverrides: new Map(), error };
}

function mergeCompat(
	baseCompat: Model<Api>["compat"],
	overrideCompat: ModelOverride["compat"],
): Model<Api>["compat"] | undefined {
	if (!overrideCompat) return baseCompat;

	const base = baseCompat as OpenAICompletionsCompat | OpenAIResponsesCompat | undefined;
	const override = overrideCompat as OpenAICompletionsCompat | OpenAIResponsesCompat;
	const merged = { ...base, ...override } as OpenAICompletionsCompat | OpenAIResponsesCompat;

	const baseCompletions = base as OpenAICompletionsCompat | undefined;
	const overrideCompletions = override as OpenAICompletionsCompat;
	const mergedCompletions = merged as OpenAICompletionsCompat;

	if (baseCompletions?.openRouterRouting || overrideCompletions.openRouterRouting) {
		mergedCompletions.openRouterRouting = {
			...baseCompletions?.openRouterRouting,
			...overrideCompletions.openRouterRouting,
		};
	}

	if (baseCompletions?.vercelGatewayRouting || overrideCompletions.vercelGatewayRouting) {
		mergedCompletions.vercelGatewayRouting = {
			...baseCompletions?.vercelGatewayRouting,
			...overrideCompletions.vercelGatewayRouting,
		};
	}

	return merged as Model<Api>["compat"];
}

/**
 * Deep merge a model override into a model.
 * Handles nested objects (cost, compat) by merging rather than replacing.
 */
function applyModelOverride(model: Model<Api>, override: ModelOverride): Model<Api> {
	const result = { ...model };

	// Simple field overrides
	if (override.name !== undefined) result.name = override.name;
	if (override.reasoning !== undefined) result.reasoning = override.reasoning;
	if (override.input !== undefined) result.input = override.input as ("text" | "image")[];
	if (override.contextWindow !== undefined) result.contextWindow = override.contextWindow;
	if (override.maxTokens !== undefined) result.maxTokens = override.maxTokens;

	// Merge cost (partial override)
	if (override.cost) {
		result.cost = {
			input: override.cost.input ?? model.cost.input,
			output: override.cost.output ?? model.cost.output,
			cacheRead: override.cost.cacheRead ?? model.cost.cacheRead,
			cacheWrite: override.cost.cacheWrite ?? model.cost.cacheWrite,
		};
	}

	// Merge headers
	if (override.headers) {
		const resolvedHeaders = resolveHeaders(override.headers);
		result.headers = resolvedHeaders ? { ...model.headers, ...resolvedHeaders } : model.headers;
	}

	// Deep merge compat
	result.compat = mergeCompat(model.compat, override.compat);

	return result;
}

/** Clear the config value command cache. Exported for testing. */
export const clearApiKeyCache = clearConfigValueCache;

/**
 * Remote models.json config (fetched from server).
 * Format matches the local models.json providers section but without apiKey/headers.
 */
interface RemoteModelsConfig {
	providers: Record<
		string,
		{
			api: string;
			baseUrl?: string;
			// 服务端下发的 provider 级自定义请求头（如 Vetta Go/Zen 的 X-Vetta-Service 分流标识）
			headers?: Record<string, string>;
			models: Array<{
				id: string;
				name: string;
				api?: string;
				reasoning: boolean;
				input: string[];
				cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
				contextWindow: number;
				maxTokens: number;
			}>;
		}
	>;
}

/**
 * Model registry - loads and manages models, resolves API keys via AuthStorage.
 */
export class ModelRegistry {
	private models: Model<Api>[] = [];
	private customProviderApiKeys: Map<string, string> = new Map();
	/**
	 * Provider names contributed by models.json or registerProvider() — i.e.
	 * user-defined providers (typically pointing at local inference servers
	 * like ollama / lm-studio). Tracked so getAvailable() can include their
	 * models even when no API key is configured (local servers usually don't
	 * require one).
	 */
	private customProviderNames: Set<string> = new Set();
	private registeredProviders: Map<string, ProviderConfigInput> = new Map();
	private loadError: string | undefined = undefined;
	private remoteModels: Model<Api>[] = [];
	/** Set of "provider/modelId" keys for models loaded from server */
	private remoteModelKeys: Set<string> = new Set();
	private serverUrl: string | undefined;
	private _serverToken: string | undefined;
	private _serverTokenGetter?: () => string | undefined;
	/** Whether loadRemoteModels has been attempted with the current token. Reset by setServerToken. */
	private remoteLoadAttempted = false;
	/** Inflight loadRemoteModels promise for deduping concurrent calls. */
	private remoteLoadInflight: Promise<"unauthorized" | undefined> | null = null;

	constructor(
		readonly authStorage: AuthStorage,
		private modelsJsonPath: string | undefined = join(getAgentDir(), "models.json"),
	) {
		// Set up fallback resolver for custom provider API keys
		this.authStorage.setFallbackResolver((provider) => {
			const keyConfig = this.customProviderApiKeys.get(provider);
			if (keyConfig) {
				return resolveConfigValue(keyConfig);
			}
			return undefined;
		});

		// Load models
		this.loadModels();
	}

	/**
	 * Set the server URL for remote model config.
	 */
	setServerUrl(url: string | undefined): void {
		this.serverUrl = url;
	}

	/**
	 * Set the server token for authenticating remote model requests.
	 */
	setServerToken(token: string | undefined): void {
		if (this._serverToken !== token) {
			this.remoteLoadAttempted = false;
		}
		this._serverToken = token;
	}

	/**
	 * Set a dynamic getter for the server token.
	 * When set, this getter is called on every API key resolution so that
	 * token changes (e.g. re-login) are picked up by long-lived sessions.
	 */
	setServerTokenGetter(getter: () => string | undefined): void {
		this._serverTokenGetter = getter;
	}

	private resolveServerToken(): string | undefined {
		return this._serverTokenGetter ? this._serverTokenGetter() : this._serverToken;
	}

	/**
	 * Fetch remote model config from server and merge.
	 * Should be called after construction when serverUrl is available.
	 * Returns "unauthorized" if server responds with 401, undefined otherwise.
	 * Silently fails if server is unreachable.
	 */
	async loadRemoteModels(): Promise<"unauthorized" | undefined> {
		if (!this.serverUrl) {
			return undefined;
		}
		// 未登录（没有 server token）就不去打远程接口——既能省掉 5 秒的 fetch
		// 阻塞，也避免给未登录用户发未授权请求。任何依赖远程 model 的代码路径
		// 会在登录回调里再次触发本方法（ModelRegistry.setServerToken 会清掉
		// remoteLoadAttempted，让 ensureRemoteLoaded 重新放行）。
		if (!this.resolveServerToken()) {
			return undefined;
		}
		if (this.remoteLoadInflight) {
			return this.remoteLoadInflight;
		}
		this.remoteLoadInflight = this.doLoadRemoteModels().finally(() => {
			this.remoteLoadInflight = null;
		});
		return this.remoteLoadInflight;
	}

	private async doLoadRemoteModels(): Promise<"unauthorized" | undefined> {
		try {
			const url = `${this.serverUrl!.replace(/\/$/, "")}/providers/models.json`;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5000);

			const token = this.resolveServerToken();
			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
			});
			clearTimeout(timeout);

			if (response.status === 401) {
				return "unauthorized";
			}

			if (!response.ok) {
				return undefined;
			}

			const body = (await response.json()) as { code: number; data: RemoteModelsConfig };
			if (body.code !== 0 || !body.data?.providers) {
				return undefined;
			}

			this.remoteModels = this.parseRemoteModels(body.data);
			this.rebuildModels();
		} catch {
			// Silently fail - remote config is optional
		} finally {
			this.remoteLoadAttempted = true;
		}
		return undefined;
	}

	private parseRemoteModels(config: RemoteModelsConfig): Model<Api>[] {
		const models: Model<Api>[] = [];
		const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
		this.remoteModelKeys.clear();

		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			for (const modelDef of providerConfig.models ?? []) {
				const api = modelDef.api || providerConfig.api;
				if (!api) continue;

				this.remoteModelKeys.add(`${providerName}/${modelDef.id}`);

				// upstreamBaseUrl: 原始 provider 的 baseUrl，用于 compat 检测
				// providerConfig.baseUrl: 网关地址，用于实际请求
				const upstreamBaseUrl = (modelDef as Record<string, unknown>).upstreamBaseUrl as string | undefined;
				const gatewayUrl = providerConfig.baseUrl || "";

				models.push({
					id: modelDef.id,
					name: modelDef.name || modelDef.id,
					api: api as Api,
					provider: providerName,
					baseUrl: upstreamBaseUrl || gatewayUrl,
					gatewayUrl: upstreamBaseUrl ? gatewayUrl : undefined,
					reasoning: modelDef.reasoning ?? false,
					input: (modelDef.input ?? ["text"]) as ("text" | "image")[],
					cost: modelDef.cost ?? defaultCost,
					contextWindow: modelDef.contextWindow ?? 128000,
					maxTokens: modelDef.maxTokens ?? 16384,
					// 透传 provider 级请求头（Vetta Go/Zen 服务标识分流），随每次上游请求发往网关
					...(providerConfig.headers ? { headers: providerConfig.headers } : {}),
				} as Model<Api>);
			}
		}

		return models;
	}

	/** Rebuild the full model list: built-in + remote + local custom */
	private rebuildModels(): void {
		this.customProviderApiKeys.clear();
		this.customProviderNames.clear();
		this.loadError = undefined;

		const {
			models: customModels,
			overrides,
			modelOverrides,
			error,
		} = this.modelsJsonPath ? this.loadCustomModels(this.modelsJsonPath) : emptyCustomModelsResult();

		if (error) {
			this.loadError = error;
		}

		const builtInModels = this.loadBuiltInModels(overrides, modelOverrides);

		// Merge order: built-in -> remote -> local custom
		// Remote models fill in between built-in and local
		let combined = this.mergeCustomModels(builtInModels, this.remoteModels);
		combined = this.mergeCustomModels(combined, customModels);

		// Let OAuth providers modify their models
		for (const oauthProvider of this.authStorage.getOAuthProviders()) {
			const cred = this.authStorage.get(oauthProvider.id);
			if (cred?.type === "oauth" && oauthProvider.modifyModels) {
				combined = oauthProvider.modifyModels(combined, cred);
			}
		}

		this.models = combined;

		for (const [providerName, config] of this.registeredProviders.entries()) {
			this.applyProviderConfig(providerName, config);
		}
	}

	/**
	 * Reload models from disk (built-in + custom from models.json).
	 */
	refresh(): void {
		this.rebuildModels();
	}

	/**
	 * Get any error from loading models.json (undefined if no error).
	 */
	getError(): string | undefined {
		return this.loadError;
	}

	private loadModels(): void {
		this.rebuildModels();
	}

	/** Load built-in models and apply provider/model overrides */
	private loadBuiltInModels(
		overrides: Map<string, ProviderOverride>,
		modelOverrides: Map<string, Map<string, ModelOverride>>,
	): Model<Api>[] {
		return getProviders().flatMap((provider) => {
			const models = getModels(provider as KnownProvider) as Model<Api>[];
			const providerOverride = overrides.get(provider);
			const perModelOverrides = modelOverrides.get(provider);

			return models.map((m) => {
				let model = m;

				// Apply provider-level baseUrl/headers override
				if (providerOverride) {
					const resolvedHeaders = resolveHeaders(providerOverride.headers);
					model = {
						...model,
						baseUrl: providerOverride.baseUrl ?? model.baseUrl,
						headers: resolvedHeaders ? { ...model.headers, ...resolvedHeaders } : model.headers,
					};
				}

				// Apply per-model override
				const modelOverride = perModelOverrides?.get(m.id);
				if (modelOverride) {
					model = applyModelOverride(model, modelOverride);
				}

				return model;
			});
		});
	}

	/** Merge custom models into built-in list by provider+id (custom wins on conflicts). */
	private mergeCustomModels(builtInModels: Model<Api>[], customModels: Model<Api>[]): Model<Api>[] {
		const merged = [...builtInModels];
		for (const customModel of customModels) {
			const existingIndex = merged.findIndex((m) => m.provider === customModel.provider && m.id === customModel.id);
			if (existingIndex >= 0) {
				merged[existingIndex] = customModel;
			} else {
				merged.push(customModel);
			}
		}
		return merged;
	}

	private loadCustomModels(modelsJsonPath: string): CustomModelsResult {
		if (!existsSync(modelsJsonPath)) {
			return emptyCustomModelsResult();
		}

		try {
			const content = readFileSync(modelsJsonPath, "utf-8");
			const config: ModelsConfig = JSON.parse(content);

			// Validate schema
			const ajv = new Ajv();
			const validate = ajv.compile(ModelsConfigSchema);
			if (!validate(config)) {
				const errors =
					validate.errors?.map((e: any) => `  - ${e.instancePath || "root"}: ${e.message}`).join("\n") ||
					"Unknown schema error";
				return emptyCustomModelsResult(`Invalid models.json schema:\n${errors}\n\nFile: ${modelsJsonPath}`);
			}

			// Per-provider validation: collect errors instead of throwing on the
			// first bad provider. Otherwise a single misconfigured entry (e.g. a
			// local ollama provider without `apiKey`) used to wipe out every other
			// custom provider in models.json — the user would see "No model
			// selected" with no hint that their other providers were silently
			// dropped.
			const { skip, errors } = this.validateConfig(config);

			const validConfig: ModelsConfig =
				skip.size === 0
					? config
					: {
							...config,
							providers: Object.fromEntries(
								Object.entries(config.providers).filter(([name]) => !skip.has(name)),
							),
						};

			const overrides = new Map<string, ProviderOverride>();
			const modelOverrides = new Map<string, Map<string, ModelOverride>>();

			for (const [providerName, providerConfig] of Object.entries(validConfig.providers)) {
				// Apply provider-level baseUrl/headers/apiKey override to built-in models when configured.
				if (providerConfig.baseUrl || providerConfig.headers || providerConfig.apiKey) {
					overrides.set(providerName, {
						baseUrl: providerConfig.baseUrl,
						headers: providerConfig.headers,
						apiKey: providerConfig.apiKey,
					});
				}

				// Store API key for fallback resolver.
				if (providerConfig.apiKey) {
					this.customProviderApiKeys.set(providerName, providerConfig.apiKey);
				}

				if (providerConfig.modelOverrides) {
					modelOverrides.set(providerName, new Map(Object.entries(providerConfig.modelOverrides)));
				}
			}

			const error =
				errors.length > 0
					? `Some providers in models.json were skipped:\n${errors.map((e) => `  - ${e}`).join("\n")}\n\nFile: ${modelsJsonPath}`
					: undefined;

			return { models: this.parseModels(validConfig), overrides, modelOverrides, error };
		} catch (error) {
			if (error instanceof SyntaxError) {
				return emptyCustomModelsResult(`Failed to parse models.json: ${error.message}\n\nFile: ${modelsJsonPath}`);
			}
			return emptyCustomModelsResult(
				`Failed to load models.json: ${error instanceof Error ? error.message : error}\n\nFile: ${modelsJsonPath}`,
			);
		}
	}

	private validateConfig(config: ModelsConfig): { skip: Set<string>; errors: string[] } {
		const skip = new Set<string>();
		const errors: string[] = [];
		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			try {
				this.validateProvider(providerName, providerConfig);
			} catch (e) {
				errors.push(e instanceof Error ? e.message : String(e));
				skip.add(providerName);
			}
		}
		return { skip, errors };
	}

	private validateProvider(providerName: string, providerConfig: ModelsConfig["providers"][string]): void {
		const hasProviderApi = !!providerConfig.api;
		const models = providerConfig.models ?? [];
		const hasModelOverrides = providerConfig.modelOverrides && Object.keys(providerConfig.modelOverrides).length > 0;

		if (models.length === 0) {
			// Override-only config: needs baseUrl OR modelOverrides (or both)
			if (!providerConfig.baseUrl && !hasModelOverrides) {
				throw new Error(`Provider ${providerName}: must specify "baseUrl", "modelOverrides", or "models".`);
			}
		} else {
			// Custom models need an endpoint. apiKey is intentionally NOT required
			// here — local inference servers (ollama / lm-studio / vLLM) don't use
			// an API key. If the upstream actually rejects unauth'd requests, the
			// caller will see a precise "No API key found for ..." error at request
			// time (agent-session.ts), instead of having every other custom
			// provider silently dropped from this models.json.
			if (!providerConfig.baseUrl) {
				throw new Error(`Provider ${providerName}: "baseUrl" is required when defining custom models.`);
			}
		}

		for (const modelDef of models) {
			const hasModelApi = !!modelDef.api;

			if (!hasProviderApi && !hasModelApi) {
				throw new Error(
					`Provider ${providerName}, model ${modelDef.id}: no "api" specified. Set at provider or model level.`,
				);
			}

			if (!modelDef.id) throw new Error(`Provider ${providerName}: model missing "id"`);
			// Validate contextWindow/maxTokens only if provided (they have defaults)
			if (modelDef.contextWindow !== undefined && modelDef.contextWindow <= 0)
				throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid contextWindow`);
			if (modelDef.maxTokens !== undefined && modelDef.maxTokens <= 0)
				throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid maxTokens`);
		}
	}

	private parseModels(config: ModelsConfig): Model<Api>[] {
		const models: Model<Api>[] = [];

		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const modelDefs = providerConfig.models ?? [];
			if (modelDefs.length === 0) continue; // Override-only, no custom models

			this.customProviderNames.add(providerName);

			// Store API key config for fallback resolver
			if (providerConfig.apiKey) {
				this.customProviderApiKeys.set(providerName, providerConfig.apiKey);
			}

			for (const modelDef of modelDefs) {
				const rawApi = modelDef.api || providerConfig.api;
				if (!rawApi) continue;
				const api = normalizeApiType(rawApi);

				// Merge headers: provider headers are base, model headers override
				// Resolve env vars and shell commands in header values
				const providerHeaders = resolveHeaders(providerConfig.headers);
				const modelHeaders = resolveHeaders(modelDef.headers);
				let headers = providerHeaders || modelHeaders ? { ...providerHeaders, ...modelHeaders } : undefined;

				// If authHeader is true, add Authorization header with resolved API key
				if (providerConfig.authHeader && providerConfig.apiKey) {
					const resolvedKey = resolveConfigValue(providerConfig.apiKey);
					if (resolvedKey) {
						headers = { ...headers, Authorization: `Bearer ${resolvedKey}` };
					}
				}

				// baseUrl is validated to exist for providers with models
				// Apply defaults for optional fields
				const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
				models.push({
					id: modelDef.id,
					name: modelDef.name ?? modelDef.id,
					api: api as Api,
					provider: providerName,
					baseUrl: providerConfig.baseUrl!,
					reasoning: modelDef.reasoning ?? false,
					input: (modelDef.input ?? ["text"]) as ("text" | "image")[],
					cost: modelDef.cost ?? defaultCost,
					contextWindow: modelDef.contextWindow ?? 128000,
					maxTokens: modelDef.maxTokens ?? 16384,
					headers,
					compat: mergeCompat(providerConfig.compat, modelDef.compat) ?? undefined,
				} as Model<Api>);
			}
		}

		return models;
	}

	/**
	 * Get all models (built-in + custom).
	 * If models.json had errors, returns only built-in models.
	 */
	getAll(): Model<Api>[] {
		return this.models;
	}

	/**
	 * Get only models that are usable right now.
	 *
	 * - Remote models: always included (gateway handles auth via server JWT).
	 * - Custom providers from models.json / registerProvider(): always included
	 *   even without an API key. Local inference servers (ollama / lm-studio /
	 *   vLLM) typically don't need one; for the few that do, the request will
	 *   fail with a precise "No API key found for ..." at call time instead of
	 *   silently being filtered out here (which produced the misleading
	 *   "No model selected" error before the user had even chosen anything).
	 * - Built-in providers: only when authStorage has an API key / OAuth
	 *   credential / env var configured for them.
	 */
	getAvailable(): Model<Api>[] {
		return this.models.filter(
			(m) => this.isRemote(m) || this.customProviderNames.has(m.provider) || this.authStorage.hasAuth(m.provider),
		);
	}

	/**
	 * Find a model by provider and ID.
	 */
	find(provider: string, modelId: string): Model<Api> | undefined {
		return this.models.find((m) => m.provider === provider && m.id === modelId);
	}

	/**
	 * Check if a model was loaded from the remote server.
	 * Remote models are read-only and cannot be modified locally.
	 */
	isRemote(model: Model<Api>): boolean {
		return this.remoteModelKeys.has(`${model.provider}/${model.id}`);
	}

	/**
	 * Get set of remote provider names.
	 */
	getRemoteProviders(): Set<string> {
		const providers = new Set<string>();
		for (const key of this.remoteModelKeys) {
			providers.add(key.split("/")[0]!);
		}
		return providers;
	}

	/**
	 * Placeholder returned for custom providers that have no configured key.
	 * Local inference servers (ollama / lm-studio / vLLM) ignore Authorization
	 * entirely; for those that don't, the upstream will reject the request
	 * with its own precise error — much better than short-circuiting here as
	 * "No API key found" when the user explicitly chose a local-only setup.
	 */
	private static readonly NO_AUTH_PLACEHOLDER = "no-auth-needed-for-local-provider";

	/**
	 * Get API key for a model.
	 * Remote models use server JWT token instead of provider API key.
	 */
	async getApiKey(model: Model<Api>): Promise<string | undefined> {
		const token = this.resolveServerToken();
		await this.ensureRemoteLoaded(token);
		if (this.isRemote(model) && token) {
			return token;
		}
		const key = await this.authStorage.getApiKey(model.provider);
		if (key) return key;
		// Custom providers without a key fall through to a placeholder so
		// downstream `if (!apiKey)` gates don't reject local-only setups. OAuth
		// configs are excluded so a real refresh failure still surfaces as an
		// auth error rather than being masked.
		if (this.customProviderNames.has(model.provider) && !this.isUsingOAuth(model)) {
			return ModelRegistry.NO_AUTH_PLACEHOLDER;
		}
		return undefined;
	}

	/**
	 * Get API key for a provider.
	 * Remote providers use server JWT token (gateway handles real API keys).
	 */
	async getApiKeyForProvider(provider: string): Promise<string | undefined> {
		const token = this.resolveServerToken();
		await this.ensureRemoteLoaded(token);
		if (this.getRemoteProviders().has(provider) && token) {
			return token;
		}
		const key = await this.authStorage.getApiKey(provider);
		if (key) return key;
		if (this.customProviderNames.has(provider)) {
			const cred = this.authStorage.get(provider);
			if (cred?.type !== "oauth") {
				return ModelRegistry.NO_AUTH_PLACEHOLDER;
			}
		}
		return undefined;
	}

	/**
	 * If we have a server token but haven't yet successfully fetched remote
	 * models with it (e.g. user logged in mid-session), trigger a load now so
	 * isRemote() / getRemoteProviders() reflect server state.
	 */
	private async ensureRemoteLoaded(token: string | undefined): Promise<void> {
		if (!token) return;
		if (this.remoteModelKeys.size > 0) return;
		if (this.remoteLoadAttempted) return;
		await this.loadRemoteModels();
	}

	/**
	 * Check if a model is using OAuth credentials (subscription).
	 */
	isUsingOAuth(model: Model<Api>): boolean {
		const cred = this.authStorage.get(model.provider);
		return cred?.type === "oauth";
	}

	/**
	 * Register a provider dynamically (from extensions).
	 *
	 * If provider has models: replaces all existing models for this provider.
	 * If provider has only baseUrl/headers: overrides existing models' URLs.
	 * If provider has oauth: registers OAuth provider for /login support.
	 */
	registerProvider(providerName: string, config: ProviderConfigInput): void {
		this.registeredProviders.set(providerName, config);
		this.applyProviderConfig(providerName, config);
	}

	private applyProviderConfig(providerName: string, config: ProviderConfigInput): void {
		// Register OAuth provider if provided
		if (config.oauth) {
			// Ensure the OAuth provider ID matches the provider name
			const oauthProvider: OAuthProviderInterface = {
				...config.oauth,
				id: providerName,
			};
			registerOAuthProvider(oauthProvider);
		}

		if (config.streamSimple) {
			if (!config.api) {
				throw new Error(`Provider ${providerName}: "api" is required when registering streamSimple.`);
			}
			const streamSimple = config.streamSimple;
			registerApiProvider({
				api: config.api,
				stream: (model, context, options) => streamSimple(model, context, options as SimpleStreamOptions),
				streamSimple,
			});
		}

		// Store API key for auth resolution
		if (config.apiKey) {
			this.customProviderApiKeys.set(providerName, config.apiKey);
		}

		if (config.models && config.models.length > 0) {
			// Full replacement: remove existing models for this provider
			this.models = this.models.filter((m) => m.provider !== providerName);

			this.customProviderNames.add(providerName);

			// Validate required fields
			if (!config.baseUrl) {
				throw new Error(`Provider ${providerName}: "baseUrl" is required when defining models.`);
			}
			if (!config.apiKey && !config.oauth) {
				throw new Error(`Provider ${providerName}: "apiKey" or "oauth" is required when defining models.`);
			}

			// Parse and add new models
			for (const modelDef of config.models) {
				const api = modelDef.api || config.api;
				if (!api) {
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: no "api" specified.`);
				}

				// Merge headers
				const providerHeaders = resolveHeaders(config.headers);
				const modelHeaders = resolveHeaders(modelDef.headers);
				let headers = providerHeaders || modelHeaders ? { ...providerHeaders, ...modelHeaders } : undefined;

				// If authHeader is true, add Authorization header
				if (config.authHeader && config.apiKey) {
					const resolvedKey = resolveConfigValue(config.apiKey);
					if (resolvedKey) {
						headers = { ...headers, Authorization: `Bearer ${resolvedKey}` };
					}
				}

				this.models.push({
					id: modelDef.id,
					name: modelDef.name,
					api: api as Api,
					provider: providerName,
					baseUrl: config.baseUrl,
					reasoning: modelDef.reasoning,
					input: modelDef.input as ("text" | "image")[],
					cost: modelDef.cost,
					contextWindow: modelDef.contextWindow,
					maxTokens: modelDef.maxTokens,
					headers,
					compat: mergeCompat(config.compat, modelDef.compat) ?? undefined,
				} as Model<Api>);
			}

			// Apply OAuth modifyModels if credentials exist (e.g., to update baseUrl)
			if (config.oauth?.modifyModels) {
				const cred = this.authStorage.get(providerName);
				if (cred?.type === "oauth") {
					this.models = config.oauth.modifyModels(this.models, cred);
				}
			}
		} else if (config.baseUrl) {
			// Override-only: update baseUrl/headers for existing models
			const resolvedHeaders = resolveHeaders(config.headers);
			this.models = this.models.map((m) => {
				if (m.provider !== providerName) return m;
				return {
					...m,
					baseUrl: config.baseUrl ?? m.baseUrl,
					headers: resolvedHeaders ? { ...m.headers, ...resolvedHeaders } : m.headers,
				};
			});
		}
	}
}

/**
 * Input type for registerProvider API.
 */
export interface ProviderConfigInput {
	baseUrl?: string;
	apiKey?: string;
	api?: Api;
	streamSimple?: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;
	headers?: Record<string, string>;
	authHeader?: boolean;
	/** Provider-level compat settings, inherited by all models under this provider. Model-level compat overrides. */
	compat?: Model<Api>["compat"];
	/** OAuth provider for /login support */
	oauth?: Omit<OAuthProviderInterface, "id">;
	models?: Array<{
		id: string;
		name: string;
		api?: Api;
		reasoning: boolean;
		input: ("text" | "image")[];
		cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
		contextWindow: number;
		maxTokens: number;
		headers?: Record<string, string>;
		compat?: Model<Api>["compat"];
	}>;
}

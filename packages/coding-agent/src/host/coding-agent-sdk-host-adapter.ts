import { join } from "node:path";
import { TypeGuard } from "@sinclair/typebox/type";
import { Value } from "@sinclair/typebox/value";
import type { ThinkingLevel } from "@vetta/agent-core";
import type { Api, Model } from "@vetta/ai";
import { buildDefaultHookConfigLayers } from "@vetta/ecosystem-adapter";
import {
	CodingAgentGreenfieldExtensionEventHost,
	CodingAgentGreenfieldSessionCapabilityHost,
	createCodingAgentCompactionExtensionRuntime,
	createCodingAgentMcpRuntimeToolSource,
	createCodingAgentPluginMcpRuntime,
} from "../adapters/runtime-core/greenfield.js";
import {
	createGreenfieldSdkSession,
	type GreenfieldSdkOwnedResource,
} from "../composition/greenfield-sdk-session-factory.js";
import { DEFAULT_SERVER_URL, ENV_SERVER_URL, getAgentDir, getDocsPath, getVettaHomePath } from "../config.js";
import { AuthStorage } from "../core/auth-storage.js";
import { DEFAULT_THINKING_LEVEL } from "../core/defaults.js";
import type { LoadExtensionsResult } from "../core/extensions/index.js";
import { ModelRegistry } from "../core/model-registry.js";
import { findInitialModel } from "../core/model-resolver.js";
import { DefaultResourceLoader } from "../core/resource-loader.js";
import type { CreateAgentSessionOptions } from "../core/sdk.js";
import { SettingsManager } from "../core/settings-manager.js";
import { time } from "../core/timings.js";
import type { GreenfieldSdkSession } from "../public-api/sdk/index.js";
import {
	assessSdkCreateOptionsCompatibility,
	type SdkCreateOptionCompatibilityIssue,
} from "../public-api/sdk-compatibility-inventory.js";
import {
	type CodingAgentSdkSessionHistory,
	prepareCodingAgentSdkSessionStorage,
} from "./coding-agent-sdk-session-storage.js";

export const CODING_AGENT_SDK_HOST_ERROR_CODES = {
	INCOMPATIBLE_OPTIONS: "greenfield_sdk_incompatible_options",
	NO_MODEL: "greenfield_sdk_no_model",
} as const;

export type CodingAgentSdkHostErrorCode =
	(typeof CODING_AGENT_SDK_HOST_ERROR_CODES)[keyof typeof CODING_AGENT_SDK_HOST_ERROR_CODES];

export class CodingAgentSdkHostError extends Error {
	constructor(
		readonly code: CodingAgentSdkHostErrorCode,
		message: string,
		readonly issues: readonly SdkCreateOptionCompatibilityIssue[] = [],
	) {
		super(message);
		this.name = "CodingAgentSdkHostError";
	}
}

export const CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES = {
	INVALID_SCHEMA: "greenfield_sdk_custom_tool_invalid_schema",
	INVALID_INPUT: "greenfield_sdk_custom_tool_invalid_input",
} as const;

export type CodingAgentSdkCustomToolErrorCode =
	(typeof CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES)[keyof typeof CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES];

export class CodingAgentSdkCustomToolError extends Error {
	constructor(
		readonly code: CodingAgentSdkCustomToolErrorCode,
		readonly toolName: string,
		message: string,
	) {
		super(message);
		this.name = "CodingAgentSdkCustomToolError";
	}
}

type CodingAgentSdkCustomToolDefinition = NonNullable<CreateAgentSessionOptions["customTools"]>[number];

interface CodingAgentSdkRegisteredTool {
	readonly definition: CodingAgentSdkCustomToolDefinition;
	readonly extensionPath: string;
}

/** 在 SDK 产品边界校验 TypeBox schema，并为执行入口增加调用参数校验。 */
export function adaptCodingAgentSdkCustomTools(
	customTools: readonly CodingAgentSdkCustomToolDefinition[] | undefined,
): readonly CodingAgentSdkRegisteredTool[] | undefined {
	if (customTools === undefined) return undefined;
	return customTools.map((definition) => {
		if (!TypeGuard.IsSchema(definition.parameters)) {
			throw new CodingAgentSdkCustomToolError(
				CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES.INVALID_SCHEMA,
				definition.name,
				`SDK custom tool "${definition.name}" must declare a valid TypeBox schema`,
			);
		}
		const parameters = definition.parameters;
		const adaptedDefinition: CodingAgentSdkCustomToolDefinition = {
			...definition,
			async execute(toolCallId, input, signal, onUpdate, context) {
				if (!Value.Check(parameters, input)) {
					const issue = Value.Errors(parameters, input).First();
					const location = issue?.path ? ` at ${issue.path}` : "";
					const detail = issue?.message ? `: ${issue.message}` : "";
					throw new CodingAgentSdkCustomToolError(
						CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES.INVALID_INPUT,
						definition.name,
						`Invalid input for SDK custom tool "${definition.name}"${location}${detail}`,
					);
				}
				return definition.execute(toolCallId, input, signal, onUpdate, context);
			},
		};
		return { extensionPath: "<sdk>", definition: adaptedDefinition };
	});
}

export interface CreateGreenfieldAgentSessionResult {
	readonly session: GreenfieldSdkSession;
	readonly extensionsResult: LoadExtensionsResult;
	readonly modelFallbackMessage?: string;
}

interface CodingAgentSdkInitialModel {
	readonly model: Model<Api>;
	readonly thinkingLevel: ThinkingLevel;
	readonly modelFallbackMessage?: string;
}

/**
 * 现有 SDK options 到 Greenfield Composition 的产品宿主适配器。
 *
 * 该函数是公开 createAgentSession 切换前的候选路径；它保持原签名输入语义，但返回窄的
 * Greenfield SDK Core，而不是伪造尚未闭合的完整 AgentSession 门面。
 */
export async function createGreenfieldAgentSession(
	options: CreateAgentSessionOptions = {},
): Promise<CreateGreenfieldAgentSessionResult> {
	assertCompatibleOptions(options);
	const sessionTools = adaptCodingAgentSdkCustomTools(options.customTools);
	const activation =
		options.tools === undefined
			? undefined
			: {
					mode: "explicit" as const,
					toolNames: options.tools.map(({ name }) => name),
				};
	const cwd = options.cwd ?? process.cwd();
	const agentDir = options.agentDir ?? getAgentDir();
	const authPath = options.agentDir ? join(agentDir, "auth.json") : undefined;
	const modelsPath = options.agentDir ? join(agentDir, "models.json") : undefined;
	const authStorage = options.authStorage ?? AuthStorage.create(authPath);
	const modelRegistry = options.modelRegistry ?? new ModelRegistry(authStorage, modelsPath);
	const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);

	if (!options.modelRegistry) {
		let serverUrl = options.serverUrl ?? process.env[ENV_SERVER_URL] ?? settingsManager.getServerUrl();
		if (!serverUrl) {
			serverUrl = DEFAULT_SERVER_URL;
			if (options.serverUrl === undefined) settingsManager.setServerUrl(serverUrl);
		}
		modelRegistry.setServerUrl(serverUrl);
		modelRegistry.setServerToken(settingsManager.getServerToken());
		modelRegistry.setServerTokenGetter(() => settingsManager.getServerTokenFresh());
		await modelRegistry.loadRemoteModels();
	}

	const resourceLoader =
		options.resourceLoader ??
		new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			appendSystemPrompt: options.appendSystemPrompt,
			includeAgentSkills: options.includeAgentSkills,
			additionalSkillPaths:
				options.agentPlugins?.skillPathContributions?.flatMap((contribution) => contribution.paths) ?? [],
		});
	if (!options.resourceLoader) {
		await resourceLoader.reload();
		time("resourceLoader.reload");
	}
	const extensionsResult = resourceLoader.getExtensions();
	const storage = await prepareCodingAgentSdkSessionStorage({ cwd, sessionManager: options.sessionManager });
	const initial = await resolveSdkInitialModel(options, modelRegistry, settingsManager, storage.history);
	const mcpEnabled = options.enableMcp !== false;
	const managedMcpSource = mcpEnabled
		? await createCodingAgentMcpRuntimeToolSource({
				projectRoot: cwd,
				agentDir,
				debug: settingsManager.getMcpDebug(),
				enabled: true,
			})
		: undefined;
	const ownedResources: GreenfieldSdkOwnedResource[] = managedMcpSource
		? [{ id: "sdk-mcp-source", dispose: () => managedMcpSource.dispose() }]
		: [];
	let extensionEventHost: CodingAgentGreenfieldExtensionEventHost | undefined;

	const created = await createGreenfieldSdkSession({
		storage: storage.storage,
		ownedResources,
		composition: {
			modelRegistry,
			initialModel: initial.model,
			initialThinkingLevel: initial.thinkingLevel,
			cwd,
			agentDir,
			scenario: options.scenario,
			activation,
			hookConfigLayers: buildDefaultHookConfigLayers({ cwd, vettaHome: getVettaHomePath() }),
			additionalHookAdapterFactories: options.additionalHookAdapterFactories,
			enableSubagents: options.enableSubagents,
			subagentMaxConcurrent: options.subagentMaxConcurrent,
			mcpSource: managedMcpSource?.source,
			promptResourceSource: resourceLoader,
			promptSettingsSource: settingsManager,
			resolveCompactionSettings: () => settingsManager.getCompactionSettings(),
			createCompactionExtensionRuntime: () =>
				createCodingAgentCompactionExtensionRuntime(() => extensionEventHost?.runner),
			extensionTools: extensionsResult.extensions,
			createPluginMcpRuntime: mcpEnabled
				? ({ agentDir: runtimeAgentDir }) =>
						createCodingAgentPluginMcpRuntime({
							agentDir: runtimeAgentDir,
							debug: settingsManager.getMcpDebug(),
						})
				: undefined,
		},
		session: {
			cwd,
			model: initial.model,
			thinkingLevel: initial.thinkingLevel,
			agentMode: options.agentMode,
			env: options.env,
			memoryMode: options.memoryMode,
			memoryFile: options.memoryFile,
			memoryCharLimit: options.memoryCharLimit,
			askUserQuestion: options.askUserQuestion,
			enableBackgroundTasks: options.enableBackgroundTasks,
			includeAgentSkills: options.includeAgentSkills,
			agentPlugins: options.agentPlugins,
			invokePluginTool: options.invokePluginTool,
			invokePluginContinuation: options.invokePluginContinuation,
			invokePluginSystemPrompt: options.invokePluginSystemPrompt,
			sessionTools,
		},
		initializeSession: async ({ session, composition }) => {
			extensionEventHost = new CodingAgentGreenfieldExtensionEventHost({
				extensions: extensionsResult.extensions,
				runtime: extensionsResult.runtime,
				cwd,
				session,
				modelRegistry,
				resourceLoader,
				bindEvents: (runner, bindOptions) =>
					composition.bindExtensionRunner(session.sessionId, runner, bindOptions),
			});
			try {
				await extensionEventHost.initialize();
				await extensionEventHost.discoverResources("startup");
				const acquiredHost = extensionEventHost;
				return { id: "sdk-extension-event-host", dispose: () => acquiredHost.dispose() };
			} catch (error) {
				await extensionEventHost.dispose();
				throw error;
			}
		},
		createCapabilityHost: ({ session, composition }) =>
			new CodingAgentGreenfieldSessionCapabilityHost({
				readSession: () => session,
				readAvailableModels: async () => modelRegistry.getAvailable(),
				scopedModels: options.scopedModels,
				initialAgentMode: options.agentMode,
				settings: settingsManager,
				reconfigureCustomTools: (customTools) =>
					composition.replaceSessionTools(session.sessionId, adaptCodingAgentSdkCustomTools(customTools) ?? []),
			}),
	});

	return {
		session: created.session,
		extensionsResult,
		...(initial.modelFallbackMessage ? { modelFallbackMessage: initial.modelFallbackMessage } : {}),
	};
}

function assertCompatibleOptions(options: CreateAgentSessionOptions): void {
	const assessment = assessSdkCreateOptionsCompatibility(options);
	if (assessment.compatible) return;
	throw new CodingAgentSdkHostError(
		CODING_AGENT_SDK_HOST_ERROR_CODES.INCOMPATIBLE_OPTIONS,
		`Greenfield SDK Host Adapter does not support: ${assessment.issues.map(({ option }) => option).join(", ")}`,
		assessment.issues,
	);
}

async function resolveSdkInitialModel(
	options: CreateAgentSessionOptions,
	modelRegistry: ModelRegistry,
	settingsManager: SettingsManager,
	history: CodingAgentSdkSessionHistory | undefined,
): Promise<CodingAgentSdkInitialModel> {
	const hasExistingSession = (history?.context.messages.length ?? 0) > 0;
	let model: Model<Api> | undefined = options.model;
	let modelFallbackMessage: string | undefined;
	if (!model && hasExistingSession && history?.context.model) {
		const { provider, modelId } = history.context.model;
		const restoredModel =
			modelRegistry.find(provider, modelId) ??
			modelRegistry.getAll().find((candidate) => candidate.provider === provider && candidate.modelId === modelId);
		if (restoredModel && (await modelRegistry.getApiKey(restoredModel))) model = restoredModel;
		else modelFallbackMessage = `Could not restore model ${provider}/${modelId}`;
	}

	if (!model) {
		const result = await findInitialModel({
			scopedModels: options.scopedModels ?? [],
			isContinuing: hasExistingSession,
			defaultProvider: settingsManager.getDefaultProvider(),
			defaultModelId: settingsManager.getDefaultModel(),
			defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
			modelRegistry,
		});
		model = result.model;
		if (!model) {
			throw new CodingAgentSdkHostError(
				CODING_AGENT_SDK_HOST_ERROR_CODES.NO_MODEL,
				`No models available. Use /login or set an API key environment variable. See ${join(getDocsPath(), "providers.md")}. Then use /model to select a model.`,
			);
		}
		if (modelFallbackMessage) modelFallbackMessage += `. Using ${model.provider}/${model.id}`;
	}

	let thinkingLevel = options.thinkingLevel;
	if (thinkingLevel === undefined && hasExistingSession) {
		thinkingLevel = history?.hasThinkingLevelEntry
			? (history.context.thinkingLevel as ThinkingLevel)
			: (settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL);
	}
	thinkingLevel ??= settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
	if (!model.reasoning) thinkingLevel = "off";
	return {
		model,
		thinkingLevel,
		...(modelFallbackMessage ? { modelFallbackMessage } : {}),
	};
}

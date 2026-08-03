import { join } from "node:path";
import { TypeGuard } from "@sinclair/typebox/type";
import { Value } from "@sinclair/typebox/value";
import type { ThinkingLevel } from "@vetta/agent-core";
import type { Api, Model } from "@vetta/ai";
import { buildDefaultHookConfigLayers } from "@vetta/ecosystem-adapter";
import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import { createLangfuseRuntimeTracerFromEnv } from "@vetta/runtime-telemetry/langfuse";
import {
	CodingAgentGreenfieldBranchNavigationHost,
	CodingAgentGreenfieldExtensionEventHost,
	CodingAgentGreenfieldResourceReloadHost,
	CodingAgentGreenfieldSessionCapabilityHost,
	createCodingAgentCompactionExtensionRuntime,
	createCodingAgentMcpRuntimeToolSource,
	createCodingAgentPluginMcpRuntime,
} from "../adapters/runtime-core/greenfield.js";
import { CodingAgentGreenfieldSdkActiveSessionCapabilityHost } from "../adapters/runtime-core/greenfield-sdk-active-session-capability-host.js";
import { CodingAgentLegacySessionSetupSeedImporter } from "../adapters/runtime-core/legacy-session-setup-seed-importer.js";
import type { GreenfieldSdkActiveSession } from "../composition/greenfield-sdk-runtime-contract.js";
import {
	createGreenfieldSdkSession,
	type GreenfieldSdkOwnedResource,
} from "../composition/greenfield-sdk-session-factory.js";
import type { GreenfieldSdkSessionStorageTarget } from "../composition/greenfield-sdk-session-storage.js";
import { DEFAULT_SERVER_URL, ENV_SERVER_URL, getAgentDir, getDocsPath, getVettaHomePath } from "../config.js";
import { AuthStorage } from "../core/auth-storage.js";
import { DEFAULT_THINKING_LEVEL } from "../core/defaults.js";
import { exportConversationDocumentToHtml, type ToolHtmlRenderer } from "../core/export-html/index.js";
import { createToolHtmlRenderer } from "../core/export-html/tool-renderer.js";
import type { LoadExtensionsResult } from "../core/extensions/index.js";
import { DEFAULT_MEMORY_CHAR_LIMIT } from "../core/memory/memory-store.js";
import { ModelRegistry } from "../core/model-registry.js";
import { findInitialModel } from "../core/model-resolver.js";
import { DefaultResourceLoader } from "../core/resource-loader.js";
import type { CreateAgentSessionOptions } from "../core/sdk.js";
import { SettingsManager } from "../core/settings-manager.js";
import { time } from "../core/timings.js";
import { createAllTools, type Tool, type ToolName } from "../core/tools/index.js";
import { theme } from "../modes/interactive/theme/theme.js";
import {
	CODING_AGENT_SESSION_CREATE_ERROR_CODES,
	type CodingAgentResourceContributions,
	CodingAgentSessionCreateError,
	type CreateCodingAgentSessionOptions,
	type CreateCodingAgentSessionResult,
} from "../public-api/sdk/index.js";
import {
	assessSdkCreateOptionsCompatibility,
	type SdkCreateOptionCompatibilityIssue,
} from "../public-api/sdk-compatibility-inventory.js";
import { CodingAgentSdkBashAdapter } from "./coding-agent-sdk-bash-adapter.js";
import { CodingAgentSdkExtensionTransitionAdapter } from "./coding-agent-sdk-extension-transition-adapter.js";
import {
	type CodingAgentSdkSessionHistory,
	prepareCodingAgentSdkSessionStorage,
} from "./coding-agent-sdk-session-storage.js";
import { adaptCodingAgentSdkSubagents } from "./coding-agent-sdk-subagent-adapter.js";

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
	readonly session: GreenfieldSdkActiveSession;
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
	return createGreenfieldAgentSessionInternal(options);
}

/** `@vetta/coding-agent/sdk` 的产品 Composition 入口；具体管理器不进入公共参数或返回值。 */
export async function createCodingAgentSessionFromPublicOptions(
	options: CreateCodingAgentSessionOptions = {},
): Promise<CreateCodingAgentSessionResult> {
	try {
		const created = await createGreenfieldAgentSessionInternal(
			adaptPublicSdkCreateOptions(options),
			options.storage,
			options.resources,
		);
		return {
			session: created.session,
			diagnostics: created.extensionsResult.errors.map(({ path, error }) => ({
				code: "extension_load_failed",
				severity: "error",
				source: path,
				message: error,
			})),
			...(created.modelFallbackMessage ? { modelFallbackMessage: created.modelFallbackMessage } : {}),
		};
	} catch (error) {
		if (error instanceof CodingAgentSdkHostError && error.code === CODING_AGENT_SDK_HOST_ERROR_CODES.NO_MODEL) {
			throw new CodingAgentSessionCreateError(CODING_AGENT_SESSION_CREATE_ERROR_CODES.NO_MODEL, error.message, {
				cause: error,
			});
		}
		throw error;
	}
}

async function createGreenfieldAgentSessionInternal(
	options: CreateAgentSessionOptions,
	storageTarget?: GreenfieldSdkSessionStorageTarget,
	resourceContributions?: CodingAgentResourceContributions,
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
	const subagents = adaptCodingAgentSdkSubagents({
		typeRegistry: options.subagentTypeRegistry,
		sessionFactory: options.subagentSessionFactory,
		modelRegistry,
		agentDir,
	});

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

	const promptTemplateContributions = resourceContributions?.promptTemplates;
	const contextFileContributions = resourceContributions?.contextFiles;
	const resourceLoader =
		options.resourceLoader ??
		new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			additionalExtensionPaths: resourceContributions?.extensionPaths
				? [...resourceContributions.extensionPaths]
				: [],
			appendSystemPrompt: options.appendSystemPrompt,
			includeAgentSkills: options.includeAgentSkills,
			additionalSkillPaths: [
				...(options.agentPlugins?.skillPathContributions?.flatMap((contribution) => contribution.paths) ?? []),
				...(resourceContributions?.skillPaths ?? []),
			],
			additionalPromptTemplatePaths: resourceContributions?.promptTemplatePaths
				? [...resourceContributions.promptTemplatePaths]
				: [],
			systemPrompt: resourceContributions?.systemPrompt,
			promptsOverride: promptTemplateContributions
				? (base) => ({
						diagnostics: base.diagnostics,
						prompts: [
							...base.prompts,
							...promptTemplateContributions.map((template) => ({
								name: template.name,
								description: template.description,
								content: template.content,
								source: "sdk",
								filePath: template.filePath ?? join(cwd, ".vetta", "sdk-prompts", `${template.name}.md`),
							})),
						],
					})
				: undefined,
			agentsFilesOverride: contextFileContributions
				? (base) => ({
						agentsFiles: [...base.agentsFiles, ...contextFileContributions.map((file) => ({ ...file }))],
					})
				: undefined,
		});
	if (!options.resourceLoader) {
		await resourceLoader.reload();
		time("resourceLoader.reload");
	}
	const extensionsResult = resourceLoader.getExtensions();
	const storage = storageTarget
		? { storage: storageTarget }
		: await prepareCodingAgentSdkSessionStorage({ cwd, sessionManager: options.sessionManager });
	const initial = await resolveSdkInitialModel(options, modelRegistry, settingsManager, storage.history);
	const tracer = options.tracer ?? createLangfuseRuntimeTracerFromEnv();
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
	const extensionTransitions = new CodingAgentSdkExtensionTransitionAdapter((session, composition, bindingOptions) => {
		const currentExtensions = resourceLoader.getExtensions();
		return new CodingAgentGreenfieldExtensionEventHost({
			extensions: currentExtensions.extensions,
			runtime: currentExtensions.runtime,
			cwd,
			session,
			modelRegistry,
			resourceLoader,
			bindEvents: (runner, bindOptions) =>
				composition.bindExtensionRunner(session.sessionId, runner, {
					replaceExisting: bindingOptions?.replaceExisting ?? bindOptions?.replaceExisting,
				}),
		});
	});

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
			subagentTypeRegistry: subagents?.typeRegistry,
			createSubagentChildFactory: subagents?.createChildFactory,
			mcpSource: managedMcpSource?.source,
			tracer,
			tracing: {
				captureContent: true,
				detail: "standard",
				traceName: options.tracingTraceName ?? process.env.VETTA_TRACING_TRACE_NAME ?? "coding-agent run",
				metadata: {
					...options.tracingMetadata,
					app: "coding-agent",
					cwd,
				},
			},
			promptResourceSource: resourceLoader,
			promptSettingsSource: settingsManager,
			resolveCompactionSettings: () => settingsManager.getCompactionSettings(),
			createCompactionExtensionRuntime: () =>
				createCodingAgentCompactionExtensionRuntime(() => extensionTransitions.readRunnerOrUndefined()),
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
		initializeSession: extensionTransitions.initializeSession,
		transitionLifecycle: extensionTransitions.lifecycle,
		createCapabilityHost: ({ readSession, composition }) => {
			const reloadHost = new CodingAgentGreenfieldResourceReloadHost({
				settingsManager,
				resourceLoader,
				runWithExtensionLifecycle: (operation) =>
					extensionTransitions.reload(readSession(), composition, operation),
				afterReload: () => {
					const currentExtensions = resourceLoader.getExtensions();
					for (const { name, config } of currentExtensions.runtime.pendingProviderRegistrations) {
						modelRegistry.registerProvider(name, config);
					}
					currentExtensions.runtime.pendingProviderRegistrations = [];
					composition.refreshExtensionTools(currentExtensions.extensions);
				},
			});
			return new CodingAgentGreenfieldSessionCapabilityHost({
				readSession,
				readAvailableModels: async () => modelRegistry.getAvailable(),
				scopedModels: options.scopedModels,
				initialAgentMode: options.agentMode,
				settings: settingsManager,
				reconfigureCustomTools: (customTools) =>
					composition.replaceSessionTools(
						readSession().sessionId,
						adaptCodingAgentSdkCustomTools(customTools) ?? [],
					),
				readSystemPrompt: () => extensionTransitions.readSystemPrompt(),
				readPromptTemplates: () => resourceLoader.getPrompts().prompts,
				reconfigureAgentPlugins: (agentPlugins) => {
					resourceLoader.setAdditionalSkillPaths([
						...(agentPlugins?.skillPathContributions?.flatMap((contribution) => contribution.paths) ?? []),
						...(resourceContributions?.skillPaths ?? []),
					]);
				},
				memoryConfiguration: {
					enabled: options.memoryMode ?? false,
					file: options.memoryFile ?? (options.memoryMode ? join(cwd, "MEMORY.md") : undefined),
					charLimit: options.memoryCharLimit ?? DEFAULT_MEMORY_CHAR_LIMIT,
				},
				flushMemory: (signal) => composition.flushMemory(readSession().sessionId, signal),
				reloadMcp: () => composition.reloadMcp(readSession().sessionId),
				reload: () => reloadHost.reload(),
				exportToHtml: (outputPath) =>
					exportGreenfieldSdkSessionToHtml(
						readSession(),
						settingsManager.getTheme(),
						extensionTransitions.readRunnerOrUndefined(),
						extensionTransitions.readSystemPrompt(),
						outputPath,
					),
				hasExtensionHandlers: (eventType) => extensionTransitions.hasHandlers(eventType),
			});
		},
		createActiveCapabilityHost: ({ sessionHost, composition }) => {
			const bash = new CodingAgentSdkBashAdapter({
				readShellCommandPrefix: () => settingsManager.getShellCommandPrefix(),
			});
			bash.bindEvents(sessionHost);
			const treeNavigation = new CodingAgentGreenfieldBranchNavigationHost({
				withActiveSession: (operation) => sessionHost.runActiveSessionMutation(operation),
				readRunner: () => extensionTransitions.readRunner(),
				settingsManager,
				clearExecutionContext: (sessionId) => composition.clearSessionExecutionContext(sessionId),
			});
			const setupImporter = new CodingAgentLegacySessionSetupSeedImporter();
			return new CodingAgentGreenfieldSdkActiveSessionCapabilityHost({
				sessionHost,
				bash,
				treeNavigation,
				createSessionSetupInitializer: (setup) =>
					setupImporter.createInitializer((sessionManager) => setup(sessionManager)),
			});
		},
	});

	return {
		session: created.session,
		extensionsResult,
		...(initial.modelFallbackMessage ? { modelFallbackMessage: initial.modelFallbackMessage } : {}),
	};
}

function adaptPublicSdkCreateOptions(options: CreateCodingAgentSessionOptions): CreateAgentSessionOptions {
	const cwd = options.cwd ?? process.cwd();
	return {
		cwd: options.cwd,
		agentDir: options.agentDir,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		scopedModels: options.scopedModels ? [...options.scopedModels] : undefined,
		tools: resolvePublicSdkActiveTools(cwd, options.activeTools),
		scenario: options.scenario,
		agentMode: options.agentMode,
		customTools: options.customTools ? [...options.customTools] : undefined,
		additionalHookAdapterFactories: options.additionalHookAdapterFactories,
		appendSystemPrompt: options.appendSystemPrompt,
		includeAgentSkills: options.includeAgentSkills,
		env: options.env ? { ...options.env } : undefined,
		memoryMode: options.memoryMode,
		memoryFile: options.memoryFile,
		memoryCharLimit: options.memoryCharLimit,
		askUserQuestion: options.askUserQuestion
			? {
					isEnabled: () => options.askUserQuestion?.isEnabled() ?? false,
					ask: async (request, signal) => {
						const result = await options.askUserQuestion!.ask(request, signal);
						return {
							cancelled: result.cancelled,
							answers: result.answers.map((answer) => ({
								question: answer.question,
								answers: [...answer.answers],
							})),
						};
					},
				}
			: undefined,
		enableBackgroundTasks: options.enableBackgroundTasks,
		enableSubagents: options.enableSubagents,
		subagentMaxConcurrent: options.subagentMaxConcurrent,
		enableMcp: options.enableMcp,
		serverUrl: options.serverUrl,
		tracer: options.tracer,
		tracingTraceName: options.tracingTraceName,
		tracingMetadata: options.tracingMetadata ? { ...options.tracingMetadata } : undefined,
		agentPlugins: options.agentPlugins,
		invokePluginTool: options.invokePluginTool,
		invokePluginContinuation: options.invokePluginContinuation,
		invokePluginSystemPrompt: options.invokePluginSystemPrompt,
	};
}

function resolvePublicSdkActiveTools(cwd: string, activeTools: readonly string[] | undefined): Tool[] | undefined {
	if (activeTools === undefined) return undefined;
	const available = createAllTools(cwd);
	return activeTools.map((name) => {
		if (!isPublicSdkToolName(name, available)) {
			throw new CodingAgentSessionCreateError(
				CODING_AGENT_SESSION_CREATE_ERROR_CODES.INVALID_ACTIVE_TOOL,
				`Unknown Coding Agent built-in tool: ${name}`,
			);
		}
		return available[name];
	});
}

function isPublicSdkToolName(name: string, tools: Record<ToolName, Tool>): name is ToolName {
	return Object.hasOwn(tools, name);
}

async function exportGreenfieldSdkSessionToHtml(
	session: GreenfieldRuntimeSession,
	themeName: string | undefined,
	runner: ReturnType<CodingAgentSdkExtensionTransitionAdapter["readRunnerOrUndefined"]>,
	systemPrompt: string,
	outputPath?: string,
): Promise<string> {
	const core = session.createCoreAssembly();
	const sessionFile = core.lifecycle.sessionPath;
	if (!sessionFile) throw new Error("Cannot export in-memory session to HTML");
	let toolRenderer: ToolHtmlRenderer | undefined;
	if (runner) {
		toolRenderer = createToolHtmlRenderer({
			getToolDefinition: (name) => runner.getToolDefinition(name),
			theme,
		});
	}
	const availableTools = core.toolController?.readAvailableTools();
	return exportConversationDocumentToHtml(core.conversationView.readDocument(), sessionFile, {
		outputPath,
		themeName,
		toolRenderer,
		systemPrompt,
		tools: availableTools
			? [...availableTools.values()].map((tool) => ({
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema,
				}))
			: undefined,
	});
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

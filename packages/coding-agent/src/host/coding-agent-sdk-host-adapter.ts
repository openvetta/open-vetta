import { join } from "node:path";
import type { TSchema } from "@sinclair/typebox";
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
import { isCodingAgentBuiltInToolName } from "../composition/coding-agent-built-in-tool-names.js";
import type { GreenfieldSdkActiveSession } from "../composition/greenfield-sdk-runtime-contract.js";
import {
	createGreenfieldSdkSession,
	type GreenfieldSdkOwnedResource,
} from "../composition/greenfield-sdk-session-factory.js";
import type { GreenfieldSdkSessionStorageTarget } from "../composition/greenfield-sdk-session-storage.js";
import { DEFAULT_SERVER_URL, ENV_SERVER_URL, getAgentDir, getDocsPath, getVettaHomePath } from "../config.js";
import { AuthStorage } from "../core/auth-storage.js";
import { exportConversationDocumentToHtml, type ToolHtmlRenderer } from "../core/export-html/index.js";
import { createToolHtmlRenderer } from "../core/export-html/tool-renderer.js";
import { DEFAULT_MEMORY_CHAR_LIMIT } from "../core/memory/memory-store.js";
import { time } from "../core/timings.js";
import type { ExtensionContext, LoadExtensionsResult, ToolDefinition } from "../extensions/index.js";
import {
	type CodingAgentModelRuntime,
	createCodingAgentModelRuntime,
	DEFAULT_THINKING_LEVEL,
	findInitialModel,
} from "../models/index.js";
import { theme } from "../modes/interactive/theme/theme.js";
import {
	CODING_AGENT_SESSION_CREATE_ERROR_CODES,
	CodingAgentSessionCreateError,
	type CodingAgentSessionToolDefinition,
	type CreateCodingAgentSessionOptions,
	type CreateCodingAgentSessionResult,
} from "../public-api/sdk/index.js";
import { SettingsRuntime } from "../settings/index.js";
import { createCodingAgentSessionResourceRuntime } from "./coding-agent-resource-runtime.js";
import { CodingAgentSdkBashAdapter } from "./coding-agent-sdk-bash-adapter.js";
import { CodingAgentSdkExtensionTransitionAdapter } from "./coding-agent-sdk-extension-transition-adapter.js";
import {
	CodingAgentSdkResourceSourceAdapter,
	projectCodingAgentSkillInfo,
} from "./coding-agent-sdk-resource-source-adapter.js";
import { resolveCodingAgentSessionDir } from "./coding-agent-session-storage.js";
import { createHostBashExecutor } from "./command-execution/index.js";

export const CODING_AGENT_SDK_HOST_ERROR_CODES = {
	NO_MODEL: "greenfield_sdk_no_model",
} as const;

export type CodingAgentSdkHostErrorCode =
	(typeof CODING_AGENT_SDK_HOST_ERROR_CODES)[keyof typeof CODING_AGENT_SDK_HOST_ERROR_CODES];

export class CodingAgentSdkHostError extends Error {
	constructor(
		readonly code: CodingAgentSdkHostErrorCode,
		message: string,
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

interface CodingAgentSdkRegisteredTool {
	readonly definition: ToolDefinition;
	readonly extensionPath: string;
}

/** 将稳定 SDK 的窄 Tool 合同适配为产品 Extension Tool，不向调用方暴露具体上下文。 */
export function adaptPublicCodingAgentSdkCustomTools(
	customTools: readonly CodingAgentSessionToolDefinition[] | undefined,
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
		const renderCall = definition.renderCall;
		const renderResult = definition.renderResult;
		const adaptedDefinition: ToolDefinition = {
			name: definition.name,
			label: definition.label,
			description: definition.description,
			parameters,
			scope_use: definition.scope_use,
			requires: definition.requires ? [...definition.requires] : undefined,
			category: definition.category,
			async execute(toolCallId, input, signal, onUpdate, context) {
				assertValidCodingAgentSdkCustomToolInput(definition.name, parameters, input);
				return definition.execute(toolCallId, input, signal, onUpdate, toPublicToolExecutionContext(context));
			},
			...(renderCall ? { renderCall: (args, currentTheme) => renderCall(args, currentTheme) } : {}),
			...(renderResult
				? {
						renderResult: (result, options, currentTheme) => renderResult(result, options, currentTheme),
					}
				: {}),
		};
		return { extensionPath: "<sdk>", definition: adaptedDefinition };
	});
}

function assertValidCodingAgentSdkCustomToolInput(toolName: string, parameters: TSchema, input: unknown): void {
	if (Value.Check(parameters, input)) return;
	const issue = Value.Errors(parameters, input).First();
	const location = issue?.path ? ` at ${issue.path}` : "";
	const detail = issue?.message ? `: ${issue.message}` : "";
	throw new CodingAgentSdkCustomToolError(
		CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES.INVALID_INPUT,
		toolName,
		`Invalid input for SDK custom tool "${toolName}"${location}${detail}`,
	);
}

function toPublicToolExecutionContext(
	context: ExtensionContext,
): Parameters<CodingAgentSessionToolDefinition["execute"]>[4] {
	return context;
}

export interface CreateGreenfieldAgentSessionResult {
	readonly session: GreenfieldSdkActiveSession;
	readonly extensionsResult: LoadExtensionsResult;
	readonly modelFallbackMessage?: string;
}

export interface CodingAgentSdkPublicHostContext {
	readonly authStorage?: AuthStorage;
	readonly modelRegistry?: CodingAgentModelRuntime;
	readonly settingsManager?: SettingsRuntime;
	readonly onSessionClosed?: () => void;
}

interface CodingAgentSdkInitialModel {
	readonly model: Model<Api>;
	readonly thinkingLevel: ThinkingLevel;
	readonly modelFallbackMessage?: string;
}

/** `@vetta/coding-agent/sdk` 的产品 Composition 入口；具体管理器不进入公共参数或返回值。 */
export async function createCodingAgentSessionFromPublicOptions(
	options: CreateCodingAgentSessionOptions = {},
	hostContext: CodingAgentSdkPublicHostContext = {},
): Promise<CreateCodingAgentSessionResult> {
	let resourceSourceAdapter: CodingAgentSdkResourceSourceAdapter | undefined;
	try {
		resourceSourceAdapter = await CodingAgentSdkResourceSourceAdapter.create({
			cwd: options.cwd ?? process.cwd(),
			resources: options.resources,
			skillSources: options.skillSources,
			extensionSources: options.extensionSources,
		});
		const created = await createGreenfieldAgentSessionInternal(
			options,
			hostContext,
			resourceSourceAdapter,
			hostContext.onSessionClosed,
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
		if (resourceSourceAdapter) {
			try {
				await resourceSourceAdapter.dispose();
			} catch (cleanupError) {
				throw new AggregateError([error, cleanupError], "Public SDK Session creation and resource cleanup failed");
			}
		}
		if (error instanceof CodingAgentSdkHostError && error.code === CODING_AGENT_SDK_HOST_ERROR_CODES.NO_MODEL) {
			throw new CodingAgentSessionCreateError(CODING_AGENT_SESSION_CREATE_ERROR_CODES.NO_MODEL, error.message, {
				cause: error,
			});
		}
		throw error;
	}
}

async function createGreenfieldAgentSessionInternal(
	options: CreateCodingAgentSessionOptions,
	hostContext: CodingAgentSdkPublicHostContext,
	resourceSourceAdapter?: CodingAgentSdkResourceSourceAdapter,
	onSessionClosed?: () => void,
): Promise<CreateGreenfieldAgentSessionResult> {
	const sessionTools = adaptPublicCodingAgentSdkCustomTools(options.customTools);
	const activeToolNames = resolvePublicSdkActiveToolNames(options.activeTools);
	const activation =
		activeToolNames === undefined
			? undefined
			: {
					mode: "explicit" as const,
					toolNames: [...activeToolNames],
				};
	const cwd = options.cwd ?? process.cwd();
	const agentDir = options.agentDir ?? getAgentDir();
	const authPath = options.agentDir ? join(agentDir, "auth.json") : undefined;
	const modelsPath = options.agentDir ? join(agentDir, "models.json") : undefined;
	const authStorage = hostContext.authStorage ?? AuthStorage.create(authPath);
	const modelRegistry =
		hostContext.modelRegistry ?? createCodingAgentModelRuntime(authStorage, { modelsJsonPath: modelsPath });
	const settingsManager = hostContext.settingsManager ?? SettingsRuntime.create(cwd, agentDir);

	if (!hostContext.modelRegistry) {
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

	const promptTemplateContributions = options.resources?.promptTemplates;
	const contextFileContributions = options.resources?.contextFiles;
	let currentAgentPlugins = options.agentPlugins;
	const resourceLoader = createCodingAgentSessionResourceRuntime({
		cwd,
		agentDir,
		settings: settingsManager,
		additionalExtensionPaths: resourceSourceAdapter?.readExtensionPaths()
			? [...resourceSourceAdapter.readExtensionPaths()]
			: [],
		appendSystemPrompt: options.appendSystemPrompt,
		includeAgentSkills: options.includeAgentSkills,
		additionalSkillPaths: [
			...(currentAgentPlugins?.skillPathContributions?.flatMap((contribution) => contribution.paths) ?? []),
			...(resourceSourceAdapter?.readSkillPaths() ?? options.resources?.skillPaths ?? []),
		],
		additionalPromptTemplatePaths: options.resources?.promptTemplatePaths
			? [...options.resources.promptTemplatePaths]
			: [],
		systemPrompt: options.resources?.systemPrompt,
		skillsOverride: resourceSourceAdapter ? (base) => resourceSourceAdapter.transformSkills(base) : undefined,
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
	await resourceLoader.reload();
	time("resourceLoader.reload");
	const extensionsResult = resourceLoader.getExtensions();
	const storage: GreenfieldSdkSessionStorageTarget = options.storage ?? {
		kind: "file-create",
		conversationDir: resolveCodingAgentSessionDir(cwd),
	};
	const initial = await resolveSdkInitialModel(options, modelRegistry, settingsManager);
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
	const ownedResources: GreenfieldSdkOwnedResource[] = [
		...(resourceSourceAdapter ? [resourceSourceAdapter] : []),
		...(managedMcpSource ? [{ id: "sdk-mcp-source", dispose: () => managedMcpSource.dispose() }] : []),
	];
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
		storage,
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
			const applyResourceSourcePaths = () => {
				if (!resourceSourceAdapter) return;
				resourceLoader.setAdditionalExtensionPaths([...resourceSourceAdapter.readExtensionPaths()]);
				resourceLoader.setAdditionalSkillPaths([
					...(currentAgentPlugins?.skillPathContributions?.flatMap((contribution) => contribution.paths) ?? []),
					...resourceSourceAdapter.readSkillPaths(),
				]);
			};
			const refreshInvalidatedResourceSources = async () => {
				if (!resourceSourceAdapter) return;
				const refreshed = await resourceSourceAdapter.refreshInvalidated();
				if (!refreshed.skillsChanged && !refreshed.extensionsChanged) return;
				applyResourceSourcePaths();
				if (refreshed.extensionsChanged) await reloadHost.reload();
				else resourceLoader.reloadSkills();
			};
			return new CodingAgentGreenfieldSessionCapabilityHost({
				readSession,
				beforePrompt: refreshInvalidatedResourceSources,
				readAvailableModels: async () => modelRegistry.getAvailable(),
				scopedModels: options.scopedModels,
				initialAgentMode: options.agentMode,
				settings: settingsManager,
				reconfigureCustomTools: (customTools) =>
					composition.replaceSessionTools(
						readSession().sessionId,
						adaptPublicCodingAgentSdkCustomTools(customTools) ?? [],
					),
				readSystemPrompt: () => extensionTransitions.readSystemPrompt(),
				readSkills: () => resourceLoader.getSkills().skills.map(projectCodingAgentSkillInfo),
				readPromptTemplates: () => resourceLoader.getPrompts().prompts,
				reconfigureAgentPlugins: (agentPlugins) => {
					currentAgentPlugins = agentPlugins;
					resourceLoader.setAdditionalSkillPaths([
						...(agentPlugins?.skillPathContributions?.flatMap((contribution) => contribution.paths) ?? []),
						...(resourceSourceAdapter?.readSkillPaths() ?? options.resources?.skillPaths ?? []),
					]);
				},
				memoryConfiguration: {
					enabled: options.memoryMode ?? false,
					file: options.memoryFile ?? (options.memoryMode ? join(cwd, "MEMORY.md") : undefined),
					charLimit: options.memoryCharLimit ?? DEFAULT_MEMORY_CHAR_LIMIT,
				},
				flushMemory: (signal) => composition.flushMemory(readSession().sessionId, signal),
				reloadMcp: () => composition.reloadMcp(readSession().sessionId),
				reload: async () => {
					await resourceSourceAdapter?.refreshAll();
					applyResourceSourcePaths();
					await reloadHost.reload();
				},
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
				executor: createHostBashExecutor(),
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
		onSessionClosed,
	});

	return {
		session: created.session,
		extensionsResult,
		...(initial.modelFallbackMessage ? { modelFallbackMessage: initial.modelFallbackMessage } : {}),
	};
}

function resolvePublicSdkActiveToolNames(activeTools: readonly string[] | undefined): readonly string[] | undefined {
	if (activeTools === undefined) return undefined;
	return activeTools.map((name) => {
		if (!isCodingAgentBuiltInToolName(name)) {
			throw new CodingAgentSessionCreateError(
				CODING_AGENT_SESSION_CREATE_ERROR_CODES.INVALID_ACTIVE_TOOL,
				`Unknown Coding Agent built-in tool: ${name}`,
			);
		}
		return name;
	});
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

async function resolveSdkInitialModel(
	options: CreateCodingAgentSessionOptions,
	modelRegistry: CodingAgentModelRuntime,
	settingsManager: SettingsRuntime,
): Promise<CodingAgentSdkInitialModel> {
	let model: Model<Api> | undefined = options.model;

	if (!model) {
		const result = await findInitialModel({
			scopedModels: options.scopedModels ? [...options.scopedModels] : [],
			isContinuing: false,
			defaultProvider: settingsManager.getDefaultProvider(),
			defaultModelId: settingsManager.getDefaultModel(),
			defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
			models: modelRegistry,
		});
		model = result.model;
		if (!model) {
			throw new CodingAgentSdkHostError(
				CODING_AGENT_SDK_HOST_ERROR_CODES.NO_MODEL,
				`No models available. Use /login or set an API key environment variable. See ${join(getDocsPath(), "providers.md")}. Then use /model to select a model.`,
			);
		}
	}

	let thinkingLevel = options.thinkingLevel;
	thinkingLevel ??= settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
	if (!model.reasoning) thinkingLevel = "off";
	return {
		model,
		thinkingLevel,
	};
}

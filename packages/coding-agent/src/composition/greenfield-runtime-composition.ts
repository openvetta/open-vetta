import { join } from "node:path";
import type { Message } from "@vetta/ai";
import type { SessionEndCause, SessionStartSource } from "@vetta/ecosystem-adapter";
import {
	type AgentPluginContinuationInvoker,
	type AgentPluginRuntimeConfig,
	type AgentPluginSystemPromptInvoker,
	type AgentPluginToolInvoker,
	ComposedGreenfieldRuntimeFactory,
	type ConversationScenario,
	GreenfieldRuntimeModel,
	GreenfieldRuntimeSessionBackend,
	InitializationRollbackScope,
	type RuntimeSessionAskUserQuestionCapability,
	type SessionConfig,
	type SessionExecutionMode,
} from "@vetta/runtime-core";
import { selectConversationDocumentModelMessages } from "@vetta/runtime-core/conversation";
import type {
	AgentCoreTurnEngineOptions,
	AgentFeatureDefinition,
	AgentProfile,
	ModelCallContributionContext,
	SessionContextRecord,
} from "@vetta/runtime-core/kernel";
import {
	createMcpDeferredToolController,
	createMcpRuntimeToolSynchronizer,
	type McpRuntimeToolSnapshot,
	type McpRuntimeToolSource,
	type McpRuntimeToolSynchronizer,
	type McpRuntimeToolView,
} from "@vetta/runtime-mcp";
import { type ConversationOwnershipManager, FileConversationRepository } from "@vetta/runtime-storage/conversation";
import {
	CODING_TOOL_SCOPES,
	type CodingToolActivation,
	selectCodingToolRegistrations,
} from "@vetta/runtime-tools/coding";
import {
	adaptCodingAgentToolRegistration,
	CODING_AGENT_MODEL_TOOL_ORDER,
	type CodingAgentCompactionExtensionRuntime,
	CodingAgentGreenfieldAgentMessageContextProjector,
	CodingAgentGreenfieldContextRuntime,
	type CodingAgentGreenfieldContextRuntimeOptions,
	type CodingAgentGreenfieldExtensionEventBinding,
	CodingAgentGreenfieldExtensionEventBridge,
	CodingAgentGreenfieldMemoryController,
	CodingAgentMemoryRolloverOrchestrator,
	type CodingAgentMemoryRolloverOrchestratorOptions,
	type CodingAgentMemoryRolloverRuntime,
	CodingAgentModelRegistryAdapter,
	type CodingAgentModelRegistrySource,
	type CodingAgentPluginMcpRuntime,
	type CodingAgentPluginRuntimeSource,
	type CodingAgentPromptResourceResolver,
	type CodingAgentPromptResourceSource,
	type CodingAgentPromptSettingsSource,
	type CodingAgentSystemPromptOptionsResolver,
	CodingAgentTodoRuntime,
	createCodingAgentAskUserQuestionRuntimeFeature,
	createCodingAgentGreenfieldProductToolFeature,
	createCodingAgentGreenfieldProductToolRegistrations,
	createCodingAgentMemoryRuntimeFeature,
	createCodingAgentTodoRuntimeFeature,
	createCodingAgentTodoRuntimeToolRegistration,
	createEcosystemHookRuntime,
	type EcosystemHookAdapterFactory,
	type HookConfigLayer,
	type KnowledgePageWriterPort,
} from "../adapters/runtime-core/greenfield.js";
import { CodingAgentGreenfieldConversationContextOverlay } from "../adapters/runtime-core/greenfield-conversation-context-overlay.js";
import { CodingAgentGreenfieldExtensionToolRuntime } from "../adapters/runtime-core/greenfield-extension-tool-runtime.js";
import type { ExtensionRunner } from "../core/extensions/runner.js";
import type { Extension } from "../core/extensions/types.js";
import type { TodoLockSource } from "../core/todo-store.js";
import { createKbFilterByTagsTool } from "../core/tools/kb-filter-by-tags/index.js";
import { createKbListTagsTool } from "../core/tools/kb-list-tags/index.js";
import { ConversationOwnershipBinding } from "./conversation-ownership-binding.js";
import { GreenfieldCompositionResourceRegistry } from "./greenfield-composition-resource-registry.js";
import { createGreenfieldCompositionShutdown } from "./greenfield-composition-shutdown.js";
import { GreenfieldSessionExecutionRuntime } from "./greenfield-session-execution-runtime.js";
import { GreenfieldSessionConfigurationState } from "./greenfield-session-peripherals.js";
import type { GreenfieldSessionValueIndex } from "./greenfield-session-resource-index.js";
import { createGreenfieldSessionResourceLifecycleAssembly } from "./greenfield-session-resource-lifecycle-assembly.js";
import { createGreenfieldSubagentSessionAssembly } from "./greenfield-subagent-session-assembly.js";
import { createGreenfieldTurnCapabilitySessionAssembly } from "./greenfield-turn-capability-session-assembly.js";
import {
	type CodingToolsRuntimeComposition,
	createCodingToolsRuntimeComposition,
} from "./runtime-tools-composition.js";

export interface GreenfieldRuntimeSessionOptions {
	readonly sessionId: string;
	readonly cwd?: string;
	readonly model?: NonNullable<SessionConfig["model"]>;
	readonly thinkingLevel?: NonNullable<SessionConfig["thinkingLevel"]>;
	readonly agentMode?: string;
	readonly executionMode?: SessionExecutionMode;
	readonly env?: Readonly<Record<string, string>>;
	readonly enableBackgroundTasks?: boolean;
	readonly includeAgentSkills?: boolean;
	readonly agentPlugins?: AgentPluginRuntimeConfig;
	readonly invokePluginTool?: AgentPluginToolInvoker;
	readonly invokePluginContinuation?: AgentPluginContinuationInvoker;
	readonly invokePluginSystemPrompt?: AgentPluginSystemPromptInvoker;
	readonly askUserQuestion?: RuntimeSessionAskUserQuestionCapability;
	readonly sandboxHostPath?: string;
	readonly linuxBubblewrapPath?: string;
	readonly macosSandboxExecPath?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
	readonly memoryMode?: boolean;
	readonly memoryFile?: string;
	readonly memoryCharLimit?: number;
	/** 子 Session 内部 Profile 使用；根宿主无需设置。 */
	readonly systemPromptAddon?: string;
	/** Workflow 子 Session 的父分支只读快照。 */
	readonly forkContextMessages?: readonly Message[];
	/** Workflow 子 Session 的初始 Todo。 */
	readonly initialTodos?: readonly string[];
	/** 产品组合创建初始 Todo 后施加的锁；不会暴露可写 TodoStore 给宿主。 */
	readonly initialTodoLockSource?: TodoLockSource;
	/** 产品会话自己的 Knowledge Writer；普通会话继续使用 Composition 默认实现。 */
	readonly knowledgePageWriter?: KnowledgePageWriterPort;
}

export interface GreenfieldRuntimeCompositionOptions {
	readonly conversationDir: string;
	readonly modelRegistry: CodingAgentModelRegistrySource;
	readonly initialModel: NonNullable<SessionConfig["model"]>;
	readonly initialThinkingLevel: NonNullable<SessionConfig["thinkingLevel"]>;
	readonly cwd?: string;
	readonly agentDir?: string;
	readonly scenario?: ConversationScenario;
	/** 可选的进程级会话所有权；与 Repository 单次写锁相互独立。 */
	readonly conversationOwnershipManager?: ConversationOwnershipManager;
	readonly activation?: CodingToolActivation;
	readonly knowledgeEnabled?: boolean;
	readonly knowledgeRoot?: string;
	/** 仅用于保留宿主既有系统提示词合同；不会把名称对应的工具加入可执行 Tool Frame。 */
	readonly systemPromptAdvertisedToolNames?: readonly string[];
	readonly mcpSource?: McpRuntimeToolSource;
	readonly streamFn?: AgentCoreTurnEngineOptions["streamFn"];
	readonly tokenBudget?: number;
	readonly reservedOutputTokens?: number;
	/** 仅 Root Profile 启用；子 Session 必须显式关闭，保持单层委派。 */
	readonly enableSubagents?: boolean;
	readonly subagentMaxConcurrent?: number;
	/** 已由宿主 Bootstrap 加载的共享动态资源；必须与 promptSettingsSource 同时提供。 */
	readonly promptResourceSource?: CodingAgentPromptResourceSource;
	/** 已由宿主 Bootstrap 加载的共享设置；必须与 promptResourceSource 同时提供。 */
	readonly promptSettingsSource?: CodingAgentPromptSettingsSource;
	/** 优先使用会话工厂，避免有状态 ResourceLoader / TodoStore 被多个 Session 共享。 */
	readonly createPromptResourceResolver?: (
		sessionOptions: GreenfieldRuntimeSessionOptions,
		todoRuntime: CodingAgentTodoRuntime,
	) => CodingAgentPromptResourceResolver;
	/** 无状态解析器的兼容入口。 */
	readonly resolvePromptResource?: CodingAgentPromptResourceResolver;
	/** 为每个 Session 创建调用级系统提示词来源。 */
	readonly createSystemPromptOptionsResolver?: (
		sessionOptions: GreenfieldRuntimeSessionOptions,
	) => CodingAgentSystemPromptOptionsResolver;
	/** 无状态系统提示词来源的兼容入口。 */
	readonly resolveSystemPromptOptions?: CodingAgentSystemPromptOptionsResolver;
	/** 为每个 Session 绑定动态 Plugin Provider 与 Continuation bridge。 */
	readonly createPluginRuntime?: (
		sessionOptions: GreenfieldRuntimeSessionOptions,
	) => CodingAgentPluginRuntimeSource | undefined;
	/** 已由宿主加载的 Extension Tool 注册；只在 Coding Agent 调用级 Frame 中物化。 */
	readonly extensionTools?: readonly Extension[];
	/** 为每个 Session 创建仅承载插件动态 Server 的 MCP Runtime；不得复用共享文件 MCP Source。 */
	readonly createPluginMcpRuntime?: (context: {
		readonly cwd: string;
		readonly agentDir?: string;
		readonly sessionOptions: GreenfieldRuntimeSessionOptions;
	}) => Promise<CodingAgentPluginMcpRuntime>;
	/** 为每个 Session 创建唯一 Todo Runtime；Tool、Continuation、Scene 与 Controller 共享它。 */
	readonly createTodoRuntime?: (sessionOptions: GreenfieldRuntimeSessionOptions) => CodingAgentTodoRuntime;
	/** 追加到每个 Session 内置 Codex/Claude Hook Adapter 之后。 */
	readonly additionalHookAdapterFactories?: readonly EcosystemHookAdapterFactory[];
	/** 显式 Hook 配置层；未提供时由内置 Adapter 使用各自默认发现规则。 */
	readonly hookConfigLayers?: readonly HookConfigLayer[];
	readonly maxStopHookContinuations?: number;
	/** 运行中读取压缩设置；未提供时使用 Coding Agent 既有默认值。 */
	readonly resolveCompactionSettings?: CodingAgentGreenfieldContextRuntimeOptions["resolveSettings"];
	/** 为每个 Session 创建旧 Extension 压缩事件的窄适配器。 */
	readonly createCompactionExtensionRuntime?: (
		sessionOptions: GreenfieldRuntimeSessionOptions,
	) => CodingAgentCompactionExtensionRuntime | undefined;
	/** 测试或宿主可替换摘要调用；生产默认复用 Coding Agent 既有实现。 */
	readonly generateCompaction?: CodingAgentGreenfieldContextRuntimeOptions["generateCompaction"];
	/** 为每个 memory-mode Session 创建产品级 Memory Runtime；默认使用 Coding Agent 既有实现。 */
	readonly createMemoryRolloverRuntime?: (
		options: CodingAgentMemoryRolloverOrchestratorOptions,
		sessionOptions: GreenfieldRuntimeSessionOptions,
	) => CodingAgentMemoryRolloverRuntime;
}

/** @deprecated 使用宿主无关的 GreenfieldRuntimeSessionOptions。 */
export type GreenfieldCliSessionOptions = GreenfieldRuntimeSessionOptions;

export interface GreenfieldRuntimeSessionHookLifecycle {
	end(sessionId: string, cause: SessionEndCause): Promise<void>;
	start(sessionId: string, source: SessionStartSource): void;
	discard(sessionId: string): void;
}

export interface GreenfieldRuntimeComposition {
	readonly backend: GreenfieldRuntimeSessionBackend<GreenfieldRuntimeSessionOptions>;
	readonly tools: CodingToolsRuntimeComposition;
	readonly scenario: ConversationScenario;
	readonly sessionHooks: GreenfieldRuntimeSessionHookLifecycle;
	bindExtensionRunner(
		sessionId: string,
		runner: ExtensionRunner,
		options?: { readonly replaceExisting?: boolean },
	): CodingAgentGreenfieldExtensionEventBinding;
	refreshExtensionTools(extensions: readonly Extension[]): void;
	appendSessionContext(sessionId: string, records: readonly SessionContextRecord[]): void;
	deliverSessionContext(sessionId: string, records: readonly SessionContextRecord[]): Promise<void>;
	quiesceSessionBackgroundCommands(sessionId: string): Promise<void>;
	preserveSessionExecutionContext(sourceSessionId: string, targetSessionId: string): Promise<void>;
	clearSessionExecutionContext(sessionId: string): void;
	flushMemory(sessionId: string, signal?: AbortSignal): Promise<number>;
	dispose(): Promise<void>;
}

/**
 * Greenfield Runtime 的共享组合入口。
 *
 * 它使用真实文件 Repository 与 Runtime Coding Tools；宿主必须显式持有并使用返回的 Backend。
 */
export async function createGreenfieldRuntimeComposition(
	options: GreenfieldRuntimeCompositionOptions,
): Promise<GreenfieldRuntimeComposition> {
	return createGreenfieldRuntimeCompositionInternal(options, EMPTY_MCP_TOOL_VIEW);
}

async function createGreenfieldRuntimeCompositionInternal(
	options: GreenfieldRuntimeCompositionOptions,
	inheritedMcpView: McpRuntimeToolView,
): Promise<GreenfieldRuntimeComposition> {
	const cwd = options.cwd ?? process.cwd();
	const scenario = options.scenario ?? "cli";
	const configuredExtensionToolRuntime = options.extensionTools
		? new CodingAgentGreenfieldExtensionToolRuntime(options.extensionTools)
		: undefined;
	const extensionToolRuntime = configuredExtensionToolRuntime;
	if ((options.promptResourceSource === undefined) !== (options.promptSettingsSource === undefined)) {
		throw new Error("promptResourceSource and promptSettingsSource must be provided together");
	}
	const effectiveActivation =
		options.activation ?? ({ mode: "scope", scope: scenario } satisfies CodingToolActivation);
	const knowledgeAvailable = options.knowledgeEnabled ?? process.env.VETTA_KNOWLEDGE_DISABLED !== "1";
	let backgroundTasksAvailable = false;
	let mcpSynchronizer: McpRuntimeToolSynchronizer | undefined;
	const resourceRegistry = new GreenfieldCompositionResourceRegistry();
	const tools = createCodingToolsRuntimeComposition({
		cwd,
		activation: effectiveActivation,
		resolveActivation: (context) => {
			const configuration = resourceRegistry.indexes.configurationStates.get(context.sessionId);
			return resolveTurnToolActivation(
				effectiveActivation,
				context,
				{
					backgroundTasksAvailable,
					knowledgeAvailable,
				},
				configuration?.readAgentMode(),
				configuration?.readActiveToolNamesOverride(),
			);
		},
		refreshCatalog: async (context) => {
			if (resourceRegistry.indexes.mcpPromptRefreshReuseSessions.delete(context.sessionId)) return;
			await refreshSessionMcp(context.sessionId, false);
		},
		filterRegistration: (registration, context) => {
			const executionRuntime = resourceRegistry.indexes.executionRuntimes.get(context.sessionId);
			if (executionRuntime?.ownsTool(registration.tool.name)) {
				return false;
			}
			if (
				registration.category === "kb-read" &&
				!isKnowledgeToolEnabled(effectiveActivation, context, knowledgeAvailable)
			) {
				return false;
			}
			const controller = resourceRegistry.indexes.mcpControllers.get(context.sessionId);
			return !controller?.isManagedTool(registration.tool.name) || controller.isToolVisible(registration.tool.name);
		},
		additionalRegistrations: [
			adaptCodingAgentToolRegistration(createKbListTagsTool(options.knowledgeRoot), {
				modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.knowledgeTags,
			}),
			adaptCodingAgentToolRegistration(createKbFilterByTagsTool(options.knowledgeRoot), {
				modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.knowledgeFilter,
			}),
			...inheritedMcpView.tools.map(({ tool }) => ({
				tool,
				scopeUse: CODING_TOOL_SCOPES,
				category: "external" as const,
			})),
		],
		tokenBudget: options.tokenBudget,
		reservedOutputTokens: options.reservedOutputTokens,
	});
	backgroundTasksAvailable = tools.backgroundService !== undefined;
	mcpSynchronizer = options.mcpSource
		? createMcpRuntimeToolSynchronizer(options.mcpSource, {
				register: (tool) =>
					tools.registry.register({
						tool,
						scopeUse: CODING_TOOL_SCOPES,
						category: "external",
					}),
				unregister: (toolName) => tools.registry.unregister(toolName),
			})
		: undefined;
	try {
		await mcpSynchronizer?.refresh();
	} catch (error) {
		mcpSynchronizer?.dispose();
		tools.dispose();
		throw error;
	}
	const repository = new FileConversationRepository({ rootDir: options.conversationDir });
	const baseConversationContextProjector = new CodingAgentGreenfieldAgentMessageContextProjector();
	const conversationContextOverlay = new CodingAgentGreenfieldConversationContextOverlay(
		baseConversationContextProjector,
	);
	const modelAdapter = new CodingAgentModelRegistryAdapter(options.modelRegistry);
	const acquireOwnership = async (sessionId: string): Promise<ConversationOwnershipBinding | undefined> => {
		const manager = options.conversationOwnershipManager;
		if (!manager) return undefined;
		const binding = await ConversationOwnershipBinding.acquire(
			manager,
			repository.resolveConversationPath(sessionId),
		);
		resourceRegistry.trackOwnershipBinding(binding);
		return binding;
	};
	const releaseOwnership = async (binding: ConversationOwnershipBinding | undefined): Promise<void> => {
		if (!binding) return;
		await binding.dispose();
		resourceRegistry.untrackOwnershipBinding(binding);
	};
	const runtimeFactory = new ComposedGreenfieldRuntimeFactory<GreenfieldRuntimeSessionOptions>({
		streamFn: options.streamFn,
		async createResources(sessionOptions, resourceContext) {
			let activeSessionId = sessionOptions.sessionId;
			let activeOwnership = await acquireOwnership(activeSessionId);
			const rollback = new InitializationRollbackScope();
			rollback.defer({
				id: "conversation-ownership",
				rollback: async () => {
					await releaseOwnership(activeOwnership);
					activeOwnership = undefined;
				},
			});
			let executionRuntime: GreenfieldSessionExecutionRuntime | undefined;
			let pluginMcpRuntime: CodingAgentPluginMcpRuntime | undefined;
			const extensionEvents = new CodingAgentGreenfieldExtensionEventBridge();
			resourceRegistry.indexes.resourceContexts.set(activeSessionId, resourceContext);
			rollback.defer({
				id: "resource-context-binding",
				rollback: () => {
					if (resourceRegistry.indexes.resourceContexts.get(activeSessionId) === resourceContext) {
						resourceRegistry.indexes.resourceContexts.delete(activeSessionId);
					}
				},
			});
			rollback.defer({
				id: "conversation-context-overlay",
				rollback: () => conversationContextOverlay.clear(activeSessionId),
			});
			try {
				const sessionCwd = sessionOptions.cwd ?? cwd;
				const requestedPluginRuntime = createSessionPluginRuntime(sessionOptions);
				const configuredPluginRuntime = options.createPluginRuntime?.(sessionOptions);
				if (requestedPluginRuntime && configuredPluginRuntime) {
					throw new Error("Greenfield session plugin capabilities conflict with createPluginRuntime");
				}
				const pluginRuntime = requestedPluginRuntime ?? configuredPluginRuntime;
				const configurationState = new GreenfieldSessionConfigurationState(sessionOptions.agentMode, () =>
					pluginRuntime?.readAgentPlugins(),
				);
				const productToolRegistrations = createCodingAgentGreenfieldProductToolRegistrations({
					cwd: sessionCwd,
					knowledgeRoot: options.knowledgeRoot,
					knowledgePageWriter: sessionOptions.knowledgePageWriter,
				});
				const productToolFeature = createCodingAgentGreenfieldProductToolFeature({
					registrations: productToolRegistrations,
					resolveActivation: (context) =>
						resolveTurnToolActivation(
							effectiveActivation,
							context,
							{ backgroundTasksAvailable, knowledgeAvailable },
							configurationState.readAgentMode(),
							configurationState.readActiveToolNamesOverride(),
						),
				});
				resourceRegistry.indexes.configurationStates.set(activeSessionId, configurationState);
				rollback.defer({
					id: "configuration-state-binding",
					rollback: () => {
						if (resourceRegistry.indexes.configurationStates.get(activeSessionId) === configurationState) {
							resourceRegistry.indexes.configurationStates.delete(activeSessionId);
						}
					},
				});
				pluginMcpRuntime = await options.createPluginMcpRuntime?.({
					cwd: sessionCwd,
					agentDir: options.agentDir,
					sessionOptions,
				});
				if (pluginMcpRuntime) {
					const acquiredPluginMcpRuntime = pluginMcpRuntime;
					rollback.defer({
						id: "plugin-mcp-runtime",
						rollback: async () => {
							try {
								await acquiredPluginMcpRuntime.dispose();
							} finally {
								if (
									resourceRegistry.indexes.pluginMcpRuntimes.get(activeSessionId) === acquiredPluginMcpRuntime
								) {
									resourceRegistry.indexes.pluginMcpRuntimes.delete(activeSessionId);
								}
							}
						},
					});
					await acquiredPluginMcpRuntime.reconfigure(configurationState.readAgentPlugins());
					resourceRegistry.indexes.pluginMcpRuntimes.set(activeSessionId, acquiredPluginMcpRuntime);
				}
				const synchronizer = mcpSynchronizer;
				const mcpController =
					synchronizer || pluginMcpRuntime
						? createMcpDeferredToolController({
								sessionId: sessionOptions.sessionId,
								deferredEnabled: effectiveActivation.mode !== "explicit",
								explicitToolNames:
									effectiveActivation.mode === "explicit" ? new Set(effectiveActivation.toolNames) : undefined,
							})
						: undefined;
				if (mcpController) {
					const snapshot = mergeMcpSnapshots(synchronizer?.snapshot(), pluginMcpRuntime?.snapshot());
					if (snapshot) mcpController.refresh(snapshot);
					resourceRegistry.indexes.mcpControllers.set(sessionOptions.sessionId, mcpController);
					rollback.defer({
						id: "mcp-controller-binding",
						rollback: () => {
							if (resourceRegistry.indexes.mcpControllers.get(activeSessionId) === mcpController) {
								resourceRegistry.indexes.mcpControllers.delete(activeSessionId);
							}
						},
					});
				}
				executionRuntime = new GreenfieldSessionExecutionRuntime({
					cwd: sessionCwd,
					activation: effectiveActivation,
					enableBackgroundTasks: sessionOptions.enableBackgroundTasks,
					initialMode: sessionOptions.executionMode,
					env: sessionOptions.env,
					sandboxHostPath: sessionOptions.sandboxHostPath,
					linuxBubblewrapPath: sessionOptions.linuxBubblewrapPath,
					macosSandboxExecPath: sessionOptions.macosSandboxExecPath,
					readSessionId: () => activeSessionId,
					resolveToolEntry: (toolName) => tools.registry.resolve(toolName),
					resourceContext,
				});
				const activeExecutionRuntime = executionRuntime;
				resourceRegistry.indexes.executionRuntimes.set(activeSessionId, activeExecutionRuntime);
				rollback.defer({
					id: "execution-runtime",
					rollback: async () => {
						try {
							await activeExecutionRuntime.dispose();
						} finally {
							if (resourceRegistry.indexes.executionRuntimes.get(activeSessionId) === activeExecutionRuntime) {
								resourceRegistry.indexes.executionRuntimes.delete(activeSessionId);
							}
						}
					},
				});
				const memoryRuntimeOptions = {
					memoryFile: sessionOptions.memoryFile ?? join(sessionCwd, "MEMORY.md"),
					memoryCharLimit: sessionOptions.memoryCharLimit,
					cwd: sessionCwd,
				};
				const memoryRuntime = sessionOptions.memoryMode
					? (options.createMemoryRolloverRuntime?.(memoryRuntimeOptions, sessionOptions) ??
						new CodingAgentMemoryRolloverOrchestrator(memoryRuntimeOptions))
					: undefined;
				if (memoryRuntime) {
					resourceRegistry.trackMemoryRuntime(memoryRuntime);
					rollback.defer({
						id: "memory-runtime",
						rollback: () => {
							memoryRuntime.dispose();
							resourceRegistry.untrackMemoryRuntime(memoryRuntime);
						},
					});
				}
				const todoRuntime = options.createTodoRuntime?.(sessionOptions) ?? new CodingAgentTodoRuntime();
				resourceRegistry.trackTodoRuntime(todoRuntime);
				rollback.defer({
					id: "todo-runtime",
					rollback: async () => {
						try {
							await todoRuntime.dispose();
						} finally {
							resourceRegistry.untrackTodoRuntime(todoRuntime);
						}
					},
				});
				if (sessionOptions.initialTodos && sessionOptions.initialTodos.length > 0) {
					todoRuntime.getTodoStore().createMany([...sessionOptions.initialTodos]);
					if (sessionOptions.initialTodoLockSource) {
						todoRuntime.getTodoStore().lock(sessionOptions.initialTodoLockSource);
					}
				}
				const todoRegistration = createCodingAgentTodoRuntimeToolRegistration(todoRuntime);
				const todoEnabled = selectCodingToolRegistrations([todoRegistration], effectiveActivation).length > 0;
				const askUserQuestionFeature = sessionOptions.askUserQuestion
					? createCodingAgentAskUserQuestionRuntimeFeature({
							capability: sessionOptions.askUserQuestion,
							scenario,
						})
					: undefined;
				const baseProfile: AgentProfile = mcpController
					? {
							...tools.profile,
							features: [
								...tools.profile.features,
								activeExecutionRuntime.feature,
								...(sessionOptions.forkContextMessages?.length
									? [createForkContextFeature(sessionOptions.forkContextMessages)]
									: []),
								...(todoEnabled ? [createCodingAgentTodoRuntimeFeature(todoRegistration)] : []),
								...(memoryRuntime
									? [createCodingAgentMemoryRuntimeFeature(memoryRuntime.toolRegistration)]
									: []),
								...(askUserQuestionFeature ? [askUserQuestionFeature] : []),
								mcpController.createFeature({ includePromptInstruction: false }),
							],
						}
					: {
							...tools.profile,
							features: [
								...tools.profile.features,
								activeExecutionRuntime.feature,
								...(sessionOptions.forkContextMessages?.length
									? [createForkContextFeature(sessionOptions.forkContextMessages)]
									: []),
								...(todoEnabled ? [createCodingAgentTodoRuntimeFeature(todoRegistration)] : []),
								...(memoryRuntime
									? [createCodingAgentMemoryRuntimeFeature(memoryRuntime.toolRegistration)]
									: []),
								...(askUserQuestionFeature ? [askUserQuestionFeature] : []),
							],
						};
				const modelRuntime = new GreenfieldRuntimeModel({
					initialModel: sessionOptions.model ?? options.initialModel,
					initialThinkingLevel: sessionOptions.thinkingLevel ?? options.initialThinkingLevel,
					catalog: modelAdapter,
					credentials: modelAdapter,
				});
				const memoryController = memoryRuntime
					? new CodingAgentGreenfieldMemoryController({
							runtime: memoryRuntime,
							readMessages: async () =>
								selectConversationDocumentModelMessages(await repository.readDocument(activeSessionId)),
							readModel: () => modelRuntime.readCurrentModel(),
							resolveApiKey: (model) => modelRuntime.resolveApiKey(model),
						})
					: undefined;
				const hookRuntime = createEcosystemHookRuntime({
					host: {
						cwd: sessionCwd,
						getSessionId: () => activeSessionId,
						getTranscriptPath: () => repository.resolveConversationPath(activeSessionId),
						getModelId: () => modelRuntime.readCurrentModel().id,
						abortCurrentRun: resourceContext.abortCurrentRun,
						recordAdditionalContexts: (contexts) => {
							resourceContext.contextAppender.append(
								contexts.map((content) => ({
									type: "ecosystem-hook-context",
									content: [{ type: "text", text: content }],
									modelVisible: true,
									display: false,
								})),
							);
						},
					},
					initialSessionStartSource: resourceContext.operation === "create" ? "startup" : "resume",
					additionalAdapterFactories: options.additionalHookAdapterFactories,
					configLayers: options.hookConfigLayers,
					maxStopContinuations: options.maxStopHookContinuations,
				});
				const contextRuntime = new CodingAgentGreenfieldContextRuntime({
					hookRuntime,
					resolveApiKey: (model) => modelRuntime.resolveApiKey(model),
					resolveSettings: options.resolveCompactionSettings,
					generateCompaction: options.generateCompaction,
					extensionRuntime: options.createCompactionExtensionRuntime?.(sessionOptions),
					memoryRollover: memoryRuntime,
					transformAgentContext: (messages) => extensionEvents.transformContext(messages),
				});
				resourceRegistry.trackContextRuntime(contextRuntime);
				rollback.defer({
					id: "context-runtime",
					rollback: () => {
						contextRuntime.dispose();
						resourceRegistry.untrackContextRuntime(contextRuntime);
					},
				});
				const subagentRuntime = createGreenfieldSubagentSessionAssembly({
					enabled: options.enableSubagents !== false,
					maxConcurrent: options.subagentMaxConcurrent,
					cwd: sessionCwd,
					scenario,
					readParentSessionId: () => activeSessionId,
					readParentSessionPath: () => repository.resolveConversationPath(activeSessionId),
					readParentMessages: async () =>
						selectConversationDocumentModelMessages(await repository.readDocument(activeSessionId)),
					readModel: () => modelRuntime.readCurrentModel(),
					readThinkingLevel: () => modelRuntime.readThinkingLevel(),
					readInheritedMcpView: () => refreshAndMergeMcpViews(synchronizer, pluginMcpRuntime),
					createChildComposition: async (request) => {
						const {
							mcpSource: _mcpSource,
							createPluginMcpRuntime: _createPluginMcpRuntime,
							extensionTools: _extensionTools,
							...childCompositionOptions
						} = options;
						const childComposition = await createGreenfieldRuntimeCompositionInternal(
							{
								...childCompositionOptions,
								conversationDir: request.conversationDir,
								initialModel: request.initialModel,
								initialThinkingLevel: request.initialThinkingLevel,
								cwd: request.cwd,
								activation: request.activation,
								enableSubagents: false,
							},
							request.inheritedMcpView,
						);
						return {
							createSession: (childOptions) => childComposition.backend.create(childOptions),
							resumeSession: (childOptions) => childComposition.backend.resume(childOptions),
							appendSessionContext: (sessionId, records) =>
								childComposition.appendSessionContext(sessionId, records),
							deliverSessionContext: (sessionId, records) =>
								childComposition.deliverSessionContext(sessionId, records),
							dispose: () => childComposition.dispose(),
						};
					},
					hookRuntime,
					resourceContext,
				});
				if (subagentRuntime) {
					const acquiredSubagentRuntime = subagentRuntime;
					rollback.defer({
						id: "subagent-runtime",
						rollback: () => acquiredSubagentRuntime.dispose(),
					});
				}
				const resourceLifecycleAssembly = createGreenfieldSessionResourceLifecycleAssembly({
					session: {
						initialSessionId: sessionOptions.sessionId,
						readSessionId: () => activeSessionId,
						commitSessionId: (sessionId) => {
							activeSessionId = sessionId;
						},
						cwd: sessionCwd,
						parentSessionPath: sessionOptions.parentSessionPath,
						parentEntryId: sessionOptions.parentEntryId,
					},
					conversation: {
						repository,
						documentStore: repository,
						continuationStore: repository,
						resolveConversationPath: (sessionId) => repository.resolveConversationPath(sessionId),
					},
					ownership: {
						rebind: async (sessionId) => {
							await activeOwnership?.rebind(repository.resolveConversationPath(sessionId));
						},
						release: async () => {
							await releaseOwnership(activeOwnership);
							activeOwnership = undefined;
						},
					},
					resourceContext,
					indexes: resourceRegistry.indexes,
					hookRuntime,
					extensionEvents,
					extensionToolRuntime,
					conversationContextOverlay,
					modelRuntime,
					contextRuntime,
					memoryRuntime,
					memoryController,
					todoRuntime,
					todoToolRegistration: todoRegistration,
					todoEnabled,
					subagentRuntime,
					executionRuntime: activeExecutionRuntime,
					configurationState,
					pluginMcpRuntime,
					mcpController,
					codingTools: tools,
					productToolRegistrations,
					activation: effectiveActivation,
					knowledgeAvailable,
					backgroundTasksAvailable,
					askUserQuestion: sessionOptions.askUserQuestion,
					scenario,
					refreshSessionMcp,
					tracking: {
						trackHookSessionDisposer: (dispose) => resourceRegistry.trackHookSessionDisposer(dispose),
						untrackHookSessionDisposer: (dispose) => resourceRegistry.untrackHookSessionDisposer(dispose),
						untrackContextRuntime: (runtime) => resourceRegistry.untrackContextRuntime(runtime),
						untrackMemoryRuntime: (runtime) => resourceRegistry.untrackMemoryRuntime(runtime),
						untrackTodoRuntime: (runtime) => resourceRegistry.untrackTodoRuntime(runtime),
						untrackTurnCapabilityAssembly: (assembly) => resourceRegistry.untrackTurnCapabilityAssembly(assembly),
					},
				});
				rollback.defer({
					id: "hook-session",
					rollback: () => resourceLifecycleAssembly.disposeHookSession(),
				});
				const turnCapabilityAssembly = await createGreenfieldTurnCapabilitySessionAssembly({
					session: {
						initialSessionId: activeSessionId,
						readSessionId: () => activeSessionId,
						cwd: sessionCwd,
						scenario,
						agentDir: options.agentDir,
						includeAgentSkills: sessionOptions.includeAgentSkills,
						systemPromptAddon: sessionOptions.systemPromptAddon,
					},
					activation: {
						resolve: (context) =>
							resolveTurnToolActivation(
								effectiveActivation,
								context,
								{ backgroundTasksAvailable, knowledgeAvailable },
								configurationState.readAgentMode(),
							),
						readAgentMode: () => configurationState.readAgentMode(),
						readAgentPlugins: () => configurationState.readAgentPlugins(),
						readActiveToolNamesOverride: () => configurationState.readActiveToolNamesOverride(),
					},
					prompt: {
						systemPromptOptionsResolver:
							options.createSystemPromptOptionsResolver?.(sessionOptions) ?? options.resolveSystemPromptOptions,
						promptResourceResolver:
							options.createPromptResourceResolver?.(sessionOptions, todoRuntime) ??
							options.resolvePromptResource,
						resourceSource: options.promptResourceSource,
						settingsSource: options.promptSettingsSource,
						systemPromptAdvertisedToolNames: options.systemPromptAdvertisedToolNames,
					},
					baseProfile,
					codingTools: tools,
					executionRuntime: activeExecutionRuntime,
					productToolFeature,
					productToolRegistrations,
					todoRuntime,
					todoToolRegistration: todoEnabled ? todoRegistration : undefined,
					memoryRuntime,
					subagentRuntime,
					contextRuntime,
					conversationContextProjector: conversationContextOverlay,
					modelRuntime,
					hookRuntime,
					pluginRuntime,
					pluginMcpRuntime,
					mcpController,
					extensionEvents,
					extensionToolRuntime,
				});
				resourceRegistry.trackTurnCapabilityAssembly(turnCapabilityAssembly);
				rollback.defer({
					id: "capability-composition",
					rollback: async () => {
						try {
							await turnCapabilityAssembly.dispose();
						} finally {
							resourceRegistry.untrackTurnCapabilityAssembly(turnCapabilityAssembly);
						}
					},
				});
				await turnCapabilityAssembly.previewInitialSystemPrompt();
				const resources = resourceLifecycleAssembly.attachTurnCapabilityAssembly(turnCapabilityAssembly);
				rollback.defer({
					id: "session-bindings",
					rollback: () => resourceLifecycleAssembly.rollbackBindings(),
				});
				rollback.commit();
				return resources;
			} catch (error) {
				return rollback.rollback(error, "Greenfield session resource initialization and rollback failed");
			}
		},
	});
	async function refreshSessionMcp(
		sessionId: string,
		reportPromptBoundary: boolean,
	): Promise<McpRuntimeToolSnapshot | undefined> {
		const pluginRuntime = resourceRegistry.indexes.pluginMcpRuntimes.get(sessionId);
		const resourceContext = resourceRegistry.indexes.resourceContexts.get(sessionId);
		const firstPromptRefresh =
			reportPromptBoundary && !resourceRegistry.indexes.mcpRefreshObservedSessions.has(sessionId);
		const before = mergeMcpSnapshots(mcpSynchronizer?.snapshot(), pluginRuntime?.snapshot());
		let startReported = false;
		if (firstPromptRefresh && resourceContext) {
			await resourceContext.reportObservation({ type: "mcp.reload.start", source: "agent" });
			startReported = true;
		}
		try {
			const baseSnapshot = await mcpSynchronizer?.refresh();
			const pluginSnapshot = await pluginRuntime?.refresh();
			const snapshot = mergeMcpSnapshots(baseSnapshot, pluginSnapshot);
			if (snapshot) resourceRegistry.indexes.mcpControllers.get(sessionId)?.refresh(snapshot);
			const changed = snapshot?.revision !== before?.revision;
			if (reportPromptBoundary && (firstPromptRefresh || changed) && resourceContext) {
				if (!startReported) {
					await resourceContext.reportObservation({ type: "mcp.reload.start", source: "agent" });
				}
				await resourceContext.reportObservation({ type: "mcp.reload.end", changed, source: "agent" });
			}
			if (reportPromptBoundary) resourceRegistry.indexes.mcpRefreshObservedSessions.add(sessionId);
			if (reportPromptBoundary) resourceRegistry.indexes.mcpPromptRefreshReuseSessions.add(sessionId);
			return snapshot;
		} catch (error) {
			if (reportPromptBoundary && resourceContext) {
				if (!startReported) {
					await resourceContext.reportObservation({ type: "mcp.reload.start", source: "agent" });
				}
				await resourceContext.reportObservation({
					type: "mcp.reload.end",
					changed: false,
					errorMessage: error instanceof Error ? error.message : String(error),
					source: "agent",
				});
			}
			throw error;
		}
	}
	const backend = new GreenfieldRuntimeSessionBackend({ runtimeFactory });
	const compositionShutdown = createGreenfieldCompositionShutdown({
		registry: resourceRegistry,
		clearConversationContextOverlay: () => conversationContextOverlay.clearAll(),
		closeConversationRepository: () => repository.close(),
		disposeMcpSynchronizer: mcpSynchronizer ? () => mcpSynchronizer?.dispose() : undefined,
		disposeCodingTools: () => tools.dispose(),
	});
	return {
		backend,
		tools,
		scenario,
		sessionHooks: {
			async end(sessionId, cause) {
				await requireSessionHookController(resourceRegistry.indexes.hookSessionControllers, sessionId).end(cause);
			},
			start(sessionId, source) {
				requireSessionHookController(resourceRegistry.indexes.hookSessionControllers, sessionId).start(source);
			},
			discard(sessionId) {
				requireSessionHookController(resourceRegistry.indexes.hookSessionControllers, sessionId).discard();
			},
		},
		bindExtensionRunner(sessionId, runner, bindingOptions) {
			const bridge = resourceRegistry.indexes.extensionEventBridges.get(sessionId);
			if (!bridge) throw new Error(`Greenfield Extension event bridge not found: ${sessionId}`);
			const unbindEvents = bridge.bind(runner, bindingOptions);
			const unbindTools = extensionToolRuntime?.bindRunner(sessionId, runner, bindingOptions);
			return {
				readSystemPrompt: () => bridge.readSystemPrompt(),
				dispose() {
					unbindTools?.();
					unbindEvents();
				},
			};
		},
		refreshExtensionTools(extensions) {
			extensionToolRuntime?.refresh(extensions);
		},
		appendSessionContext(sessionId, records) {
			const context = resourceRegistry.indexes.resourceContexts.get(sessionId);
			if (!context) throw new Error(`Greenfield session context not found: ${sessionId}`);
			context.contextAppender.append(records);
		},
		async deliverSessionContext(sessionId, records) {
			const context = resourceRegistry.indexes.resourceContexts.get(sessionId);
			if (!context) throw new Error(`Greenfield session context not found: ${sessionId}`);
			await context.deliverAsyncContext(records);
		},
		async quiesceSessionBackgroundCommands(sessionId) {
			await resourceRegistry.indexes.executionRuntimes.get(sessionId)?.quiesceBackgroundCommands();
		},
		async preserveSessionExecutionContext(sourceSessionId, targetSessionId) {
			const [sourceDocument, targetDocument] = await Promise.all([
				repository.readDocument(sourceSessionId),
				repository.readDocument(targetSessionId),
			]);
			conversationContextOverlay.preserve(
				targetSessionId,
				conversationContextOverlay.project(sourceDocument),
				baseConversationContextProjector.project(targetDocument),
			);
		},
		clearSessionExecutionContext(sessionId) {
			conversationContextOverlay.clear(sessionId);
		},
		async flushMemory(sessionId, signal) {
			return (await resourceRegistry.indexes.memoryControllers.get(sessionId)?.flushMemory(signal)) ?? 0;
		},
		async dispose() {
			await compositionShutdown.dispose();
		},
	};
}

function requireSessionHookController<T>(controllers: GreenfieldSessionValueIndex<T>, sessionId: string): T {
	const controller = controllers.get(sessionId);
	if (!controller) throw new Error(`Greenfield session hook lifecycle not found: ${sessionId}`);
	return controller;
}

function mergeMcpSnapshots(
	base: McpRuntimeToolSnapshot | undefined,
	overlay: McpRuntimeToolSnapshot | undefined,
): McpRuntimeToolSnapshot | undefined {
	if (!base && !overlay) return undefined;
	const tools = new Map<string, McpRuntimeToolSnapshot["tools"][number]>();
	for (const tool of base?.tools ?? []) tools.set(tool.name, tool);
	for (const tool of overlay?.tools ?? []) tools.set(tool.name, tool);
	return Object.freeze({
		revision: (base?.revision ?? 0) + (overlay?.revision ?? 0),
		tools: Object.freeze([...tools.values()]),
	});
}

async function refreshAndMergeMcpViews(
	base: McpRuntimeToolSynchronizer | undefined,
	overlay: CodingAgentPluginMcpRuntime | undefined,
): Promise<McpRuntimeToolView> {
	await base?.refresh();
	await overlay?.refresh();
	return mergeMcpToolViews(base?.view(), overlay?.view());
}

function mergeMcpToolViews(
	base: McpRuntimeToolView | undefined,
	overlay: McpRuntimeToolView | undefined,
): McpRuntimeToolView {
	if (!base && !overlay) return EMPTY_MCP_TOOL_VIEW;
	const tools = new Map<string, McpRuntimeToolView["tools"][number]>();
	for (const binding of base?.tools ?? []) tools.set(binding.tool.name, binding);
	for (const binding of overlay?.tools ?? []) tools.set(binding.tool.name, binding);
	return Object.freeze({ tools: Object.freeze([...tools.values()]) });
}

function resolveTurnToolActivation(
	base: CodingToolActivation,
	context: ModelCallContributionContext,
	availability: {
		readonly backgroundTasksAvailable: boolean;
		readonly knowledgeAvailable: boolean;
	},
	agentMode?: string,
	activeToolNamesOverride?: readonly string[],
): CodingToolActivation {
	if (activeToolNamesOverride) return { mode: "explicit", toolNames: [...activeToolNamesOverride] };
	if (base.mode === "explicit") return base;
	const capabilities = new Set(base.capabilities);
	if (availability.backgroundTasksAvailable) capabilities.add("bg-tasks");
	if (isKnowledgeToolEnabled(base, context, availability.knowledgeAvailable)) {
		capabilities.add("knowledge");
	}
	return { ...base, capabilities, agentMode };
}

function isKnowledgeToolEnabled(
	base: CodingToolActivation,
	context: ModelCallContributionContext,
	knowledgeAvailable: boolean,
): boolean {
	if (!knowledgeAvailable) return false;
	return (
		(base.mode === "scope" && base.scope === "kb-processing") ||
		context.input?.context?.some(({ type }) => type === "knowledge_mode_instruction") === true
	);
}

function createForkContextFeature(messages: readonly Message[]): AgentFeatureDefinition {
	const snapshot = [...messages];
	return {
		id: "coding-agent-parent-context",
		prepare: async () => ({
			contribute: async () => ({
				contextProviders: [
					{
						id: "coding-agent-parent-context",
						provide: async () => snapshot,
					},
				],
			}),
			dispose: async () => {},
		}),
	};
}

function createSessionPluginRuntime(
	sessionOptions: GreenfieldRuntimeSessionOptions,
): CodingAgentPluginRuntimeSource | undefined {
	if (
		sessionOptions.agentPlugins === undefined &&
		sessionOptions.invokePluginTool === undefined &&
		sessionOptions.invokePluginContinuation === undefined &&
		sessionOptions.invokePluginSystemPrompt === undefined
	) {
		return undefined;
	}
	return {
		readAgentPlugins: () => sessionOptions.agentPlugins,
		invokeTool: sessionOptions.invokePluginTool,
		invokeContinuation: sessionOptions.invokePluginContinuation,
		invokeSystemPrompt: sessionOptions.invokePluginSystemPrompt,
	};
}

const EMPTY_MCP_TOOL_VIEW: McpRuntimeToolView = Object.freeze({ tools: Object.freeze([]) });

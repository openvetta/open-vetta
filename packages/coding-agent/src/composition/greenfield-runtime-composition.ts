import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Message } from "@vetta/ai";
import {
	type AgentPluginContinuationInvoker,
	type AgentPluginRuntimeConfig,
	type AgentPluginSystemPromptInvoker,
	type AgentPluginToolInvoker,
	ComposedGreenfieldRuntimeFactory,
	type ConversationScenario,
	GreenfieldRuntimeModel,
	type GreenfieldRuntimeResourceContext,
	GreenfieldRuntimeSessionBackend,
	type RuntimeSessionAskUserQuestionCapability,
	type SessionConfig,
	type SessionExecutionMode,
} from "@vetta/runtime-core";
import { selectConversationDocumentModelMessages } from "@vetta/runtime-core/conversation";
import {
	type AgentCoreTurnEngineOptions,
	type AgentFeatureDefinition,
	type AgentProfile,
	type ModelCallContributionContext,
	RuntimeCapabilityComposition,
	type SessionContextRecord,
} from "@vetta/runtime-core/kernel";
import {
	createMcpDeferredToolController,
	createMcpRuntimeToolSynchronizer,
	type McpDeferredToolController,
	type McpRuntimeToolSnapshot,
	type McpRuntimeToolSource,
	type McpRuntimeToolSynchronizer,
	type McpRuntimeToolView,
} from "@vetta/runtime-mcp";
import { type ConversationOwnershipManager, FileConversationRepository } from "@vetta/runtime-storage/conversation";
import type {
	SubagentChildHandle,
	SubagentLifecycle,
	SubagentSnapshot,
	SubagentSpawnRequest,
	SubagentTypeDefinition,
} from "@vetta/runtime-subagents";
import {
	CODING_TOOL_SCOPES,
	type CodingToolActivation,
	guardCodingToolRegistration,
	selectCodingToolRegistrations,
} from "@vetta/runtime-tools/coding";
import {
	adaptCodingAgentToolRegistration,
	CODING_AGENT_ASK_USER_QUESTION_TOOL_NAME,
	CODING_AGENT_MODEL_TOOL_ORDER,
	type CodingAgentCompactionExtensionRuntime,
	CodingAgentContinuationOrchestrator,
	CodingAgentGreenfieldContextRuntime,
	type CodingAgentGreenfieldContextRuntimeOptions,
	CodingAgentGreenfieldMemoryController,
	CodingAgentGreenfieldPromptAdapter,
	type CodingAgentMemoryController,
	CodingAgentMemoryRolloverOrchestrator,
	type CodingAgentMemoryRolloverOrchestratorOptions,
	type CodingAgentMemoryRolloverRuntime,
	CodingAgentModelCallFrameComposer,
	CodingAgentModelRegistryAdapter,
	type CodingAgentModelRegistrySource,
	type CodingAgentPluginMcpRuntime,
	CodingAgentPluginRunOrchestrator,
	type CodingAgentPluginRuntimeSource,
	type CodingAgentPluginToolActivation,
	CodingAgentPluginToolRuntime,
	type CodingAgentPromptResourceResolver,
	type CodingAgentPromptResourceSource,
	CodingAgentPromptRuntime,
	type CodingAgentPromptSettingsSource,
	CodingAgentStopHookContinuationSource,
	type CodingAgentSystemPromptOptionsResolver,
	CodingAgentTodoContinuationSource,
	CodingAgentTodoRuntime,
	createCodingAgentAskUserQuestionRuntimeFeature,
	createCodingAgentGreenfieldProductToolFeature,
	createCodingAgentGreenfieldProductToolRegistrations,
	createCodingAgentInvokeSkillRuntimeFeature,
	createCodingAgentMemoryRuntimeFeature,
	createCodingAgentPromptResourceResolver,
	createCodingAgentPromptRuntime,
	createCodingAgentTodoRuntimeFeature,
	createCodingAgentTodoRuntimeToolRegistration,
	createEcosystemHookRuntime,
	type EcosystemHookAdapterFactory,
	type HookConfigLayer,
	isCodingAgentAskUserQuestionEnabled,
	type KnowledgePageWriterPort,
} from "../adapters/runtime-core/greenfield.js";
import type { TodoLockSource } from "../core/todo-store.js";
import { createKbFilterByTagsTool } from "../core/tools/kb-filter-by-tags/index.js";
import { createKbListTagsTool } from "../core/tools/kb-list-tags/index.js";
import { ConversationOwnershipBinding } from "./conversation-ownership-binding.js";
import { GreenfieldSessionExecutionRuntime } from "./greenfield-session-execution-runtime.js";
import {
	GreenfieldBackgroundWorkController,
	GreenfieldSessionConfigurationState,
} from "./greenfield-session-peripherals.js";
import { createGreenfieldSubagentChildHandle } from "./greenfield-subagent-child.js";
import { type GreenfieldSubagentProfile, GreenfieldSubagentRuntime } from "./greenfield-subagent-runtime.js";
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

export interface GreenfieldRuntimeComposition {
	readonly backend: GreenfieldRuntimeSessionBackend<GreenfieldRuntimeSessionOptions>;
	readonly tools: CodingToolsRuntimeComposition;
	readonly scenario: ConversationScenario;
	appendSessionContext(sessionId: string, records: readonly SessionContextRecord[]): void;
	deliverSessionContext(sessionId: string, records: readonly SessionContextRecord[]): Promise<void>;
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
	if ((options.promptResourceSource === undefined) !== (options.promptSettingsSource === undefined)) {
		throw new Error("promptResourceSource and promptSettingsSource must be provided together");
	}
	const effectiveActivation =
		options.activation ?? ({ mode: "scope", scope: scenario } satisfies CodingToolActivation);
	const knowledgeAvailable = options.knowledgeEnabled ?? process.env.VETTA_KNOWLEDGE_DISABLED !== "1";
	let backgroundTasksAvailable = false;
	let mcpSynchronizer: McpRuntimeToolSynchronizer | undefined;
	const mcpControllers = new Map<string, McpDeferredToolController>();
	const pluginMcpRuntimes = new Map<string, CodingAgentPluginMcpRuntime>();
	const executionRuntimes = new Map<string, GreenfieldSessionExecutionRuntime>();
	const configurationStates = new Map<string, GreenfieldSessionConfigurationState>();
	const resourceContexts = new Map<string, GreenfieldRuntimeResourceContext>();
	const mcpRefreshObservedSessions = new Set<string>();
	const mcpPromptRefreshReuseSessions = new Set<string>();
	const tools = createCodingToolsRuntimeComposition({
		cwd,
		activation: effectiveActivation,
		resolveActivation: (context) => {
			const configuration = configurationStates.get(context.sessionId);
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
			if (mcpPromptRefreshReuseSessions.delete(context.sessionId)) return;
			await refreshSessionMcp(context.sessionId, false);
		},
		filterRegistration: (registration, context) => {
			const executionRuntime = executionRuntimes.get(context.sessionId);
			if (executionRuntime?.ownsTool(registration.tool.name)) {
				return false;
			}
			if (
				registration.category === "kb-read" &&
				!isKnowledgeToolEnabled(effectiveActivation, context, knowledgeAvailable)
			) {
				return false;
			}
			const controller = mcpControllers.get(context.sessionId);
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
	const capabilityCompositions = new Set<RuntimeCapabilityComposition>();
	const todoRuntimes = new Set<CodingAgentTodoRuntime>();
	const contextRuntimes = new Set<CodingAgentGreenfieldContextRuntime>();
	const memoryRuntimes = new Set<CodingAgentMemoryRolloverRuntime>();
	const memoryControllers = new Map<string, CodingAgentMemoryController>();
	const hookSessionDisposers = new Set<() => Promise<void>>();
	const ownershipBindings = new Set<ConversationOwnershipBinding>();
	const modelAdapter = new CodingAgentModelRegistryAdapter(options.modelRegistry);
	const acquireOwnership = async (sessionId: string): Promise<ConversationOwnershipBinding | undefined> => {
		const manager = options.conversationOwnershipManager;
		if (!manager) return undefined;
		const binding = await ConversationOwnershipBinding.acquire(
			manager,
			repository.resolveConversationPath(sessionId),
		);
		ownershipBindings.add(binding);
		return binding;
	};
	const releaseOwnership = async (binding: ConversationOwnershipBinding | undefined): Promise<void> => {
		if (!binding) return;
		ownershipBindings.delete(binding);
		await binding.dispose();
	};
	const stateActivation =
		effectiveActivation.mode === "scope"
			? withCapabilities(effectiveActivation, [
					...(backgroundTasksAvailable ? ["bg-tasks"] : []),
					...(knowledgeAvailable && effectiveActivation.scope === "kb-processing" ? ["knowledge"] : []),
				])
			: effectiveActivation;
	const runtimeFactory = new ComposedGreenfieldRuntimeFactory<GreenfieldRuntimeSessionOptions>({
		streamFn: options.streamFn,
		async createResources(sessionOptions, resourceContext) {
			let activeSessionId = sessionOptions.sessionId;
			let activeOwnership = await acquireOwnership(activeSessionId);
			let executionRuntime: GreenfieldSessionExecutionRuntime | undefined;
			let subagentRuntime: GreenfieldSubagentRuntime | undefined;
			let pluginMcpRuntime: CodingAgentPluginMcpRuntime | undefined;
			resourceContexts.set(activeSessionId, resourceContext);
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
				configurationStates.set(activeSessionId, configurationState);
				pluginMcpRuntime = await options.createPluginMcpRuntime?.({
					cwd: sessionCwd,
					agentDir: options.agentDir,
					sessionOptions,
				});
				if (pluginMcpRuntime) {
					await pluginMcpRuntime.reconfigure(configurationState.readAgentPlugins());
					pluginMcpRuntimes.set(activeSessionId, pluginMcpRuntime);
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
					mcpControllers.set(sessionOptions.sessionId, mcpController);
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
				executionRuntimes.set(activeSessionId, activeExecutionRuntime);
				const memoryRuntimeOptions = {
					memoryFile: sessionOptions.memoryFile ?? join(sessionCwd, "MEMORY.md"),
					memoryCharLimit: sessionOptions.memoryCharLimit,
					cwd: sessionCwd,
				};
				const memoryRuntime = sessionOptions.memoryMode
					? (options.createMemoryRolloverRuntime?.(memoryRuntimeOptions, sessionOptions) ??
						new CodingAgentMemoryRolloverOrchestrator(memoryRuntimeOptions))
					: undefined;
				if (memoryRuntime) memoryRuntimes.add(memoryRuntime);
				const todoRuntime = options.createTodoRuntime?.(sessionOptions) ?? new CodingAgentTodoRuntime();
				todoRuntimes.add(todoRuntime);
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
				});
				contextRuntimes.add(contextRuntime);
				const openSubagentChild = async (
					operation: "create" | "resume",
					requestOrSnapshot: SubagentSpawnRequest | SubagentSnapshot,
					type: SubagentTypeDefinition<GreenfieldSubagentProfile>,
					forkContext: readonly Message[] | undefined,
				): Promise<SubagentChildHandle> => {
					const childSessionId =
						operation === "create" ? randomUUID() : (requestOrSnapshot as SubagentSnapshot).id;
					const snapshot = operation === "resume" ? (requestOrSnapshot as SubagentSnapshot) : undefined;
					const childConversationDir = snapshot?.sessionFile
						? dirname(snapshot.sessionFile)
						: join(dirname(repository.resolveConversationPath(activeSessionId)), ".subagents", activeSessionId);
					const retainedForkContext = operation === "create" ? forkContext : undefined;
					const inheritedView = type.profile.inheritParentMcp
						? await refreshAndMergeMcpViews(synchronizer, pluginMcpRuntime)
						: EMPTY_MCP_TOOL_VIEW;
					const {
						mcpSource: _mcpSource,
						createPluginMcpRuntime: _createPluginMcpRuntime,
						...childCompositionOptions
					} = options;
					const childComposition = await createGreenfieldRuntimeCompositionInternal(
						{
							...childCompositionOptions,
							conversationDir: childConversationDir,
							initialModel: modelRuntime.readCurrentModel(),
							initialThinkingLevel: modelRuntime.readThinkingLevel(),
							cwd: sessionCwd,
							activation: withInheritedMcpTools(withScenario(type.profile.activation, scenario), inheritedView),
							enableSubagents: false,
						},
						inheritedView,
					);
					try {
						const childOptions: GreenfieldRuntimeSessionOptions = {
							sessionId: childSessionId,
							cwd: sessionCwd,
							parentSessionPath: repository.resolveConversationPath(activeSessionId),
							systemPromptAddon: type.profile.systemPromptAddon,
							forkContextMessages: retainedForkContext,
							initialTodos:
								operation === "create" && type.profile.includeTodo
									? (requestOrSnapshot as SubagentSpawnRequest).todos
									: undefined,
						};
						const childSession =
							operation === "create"
								? await childComposition.backend.create(childOptions)
								: await childComposition.backend.resume(childOptions);
						const childSessionFile = childSession.createCoreAssembly().lifecycle.sessionPath;
						return createGreenfieldSubagentChildHandle({
							session: childSession,
							sessionFile: childSessionFile,
							appendContext: (records) => childComposition.appendSessionContext(childSession.sessionId, records),
							deliverContext: (records) =>
								childComposition.deliverSessionContext(childSession.sessionId, records),
							disposeComposition: () => childComposition.dispose(),
						});
					} catch (error) {
						await childComposition.dispose();
						throw error;
					}
				};
				if (options.enableSubagents !== false) {
					const subagentLifecycle: SubagentLifecycle = {
						beforeStart: async (input) => {
							const outcome = await hookRuntime.runSubagentStart(
								{ agentId: input.id, agentType: input.agentType },
								`${activeSessionId}:subagent-start:${input.id}`,
							);
							await hookRuntime.recordAdditionalContexts(outcome.additionalContexts);
							if (outcome.shouldStop || outcome.shouldBlock) {
								return {
									blockedReason:
										outcome.stopReason ??
										outcome.blockReason ??
										"SubagentStart ecosystem hook blocked subagent spawn",
								};
							}
							return outcome.additionalContexts.length > 0
								? { message: `${outcome.additionalContexts.join("\n\n")}\n\n${input.message}` }
								: undefined;
						},
						beforeStop: async (input) => {
							const outcome = await hookRuntime.runSubagentStop({
								agentId: input.id,
								agentType: input.agentType,
								turnId: `${activeSessionId}:subagent-stop:${input.id}:${input.generation}`,
								stopHookActive: input.stopHookActive,
								lastAssistantMessage: input.lastAssistantText ?? null,
								agentTranscriptPath: input.sessionFile ?? null,
							});
							await hookRuntime.recordAdditionalContexts(outcome.additionalContexts);
							if (
								!input.interrupted &&
								outcome.shouldBlock &&
								!outcome.shouldStop &&
								outcome.continuationFragments.length > 0
							) {
								return { continuation: outcome.continuationFragments.join("\n\n") };
							}
							return undefined;
						},
					};
					subagentRuntime = new GreenfieldSubagentRuntime({
						parentSessionId: activeSessionId,
						maxConcurrent: options.subagentMaxConcurrent,
						lifecycle: subagentLifecycle,
						readParentMessages: async () =>
							selectConversationDocumentModelMessages(await repository.readDocument(activeSessionId)),
						createChild: (request, type, forkContext) => openSubagentChild("create", request, type, forkContext),
						reopenChild: (snapshot, type, forkContext) =>
							openSubagentChild("resume", snapshot, type, forkContext),
						validateRecoveredChild: (snapshot) =>
							validateRecoveredSubagentTranscript(snapshot, repository.resolveConversationPath(activeSessionId)),
						onRecoveryIssue: (message) => {
							console.warn("[greenfield-runtime] subagent recovery issue", message);
						},
						onNotify: (payload) => {
							void resourceContext
								.deliverAsyncContext([
									{
										type: "subagent-notification",
										content: [{ type: "text", text: payload.text }],
										modelVisible: true,
										display: true,
									},
								])
								.catch((error: unknown) => {
									console.warn("[greenfield-runtime] failed to deliver subagent notification", error);
								});
						},
						onUpdate: (agents) => {
							void resourceContext
								.reportObservation({
									type: "subagents_update",
									agents: agents.map(toSubagentInfo),
									source: "tool",
								})
								.catch((error: unknown) => {
									console.warn("[greenfield-runtime] failed to publish subagent observation", error);
								});
						},
					});
				}
				let hookSessionEnded = false;
				const endHookSession = async (): Promise<void> => {
					if (hookSessionEnded) return;
					hookSessionEnded = true;
					hookSessionDisposers.delete(endHookSession);
					try {
						await hookRuntime.runSessionEnd("dispose");
					} catch (error) {
						console.warn("[ecosystem-hooks] SessionEnd failed during Greenfield dispose", error);
					}
				};
				const pluginSession = {
					id: activeSessionId,
					cwd: sessionCwd,
					scenario,
				};
				const pluginRunOrchestrator = pluginRuntime
					? new CodingAgentPluginRunOrchestrator({
							session: pluginSession,
							...pluginRuntime,
							readAgentPlugins: () => configurationState.readAgentPlugins(),
						})
					: undefined;
				const pluginToolRuntime =
					pluginRuntime && pluginRunOrchestrator
						? new CodingAgentPluginToolRuntime({
								readAgentPlugins: () => configurationState.readAgentPlugins(),
								invokeTool: pluginRuntime.invokeTool,
								runOrchestrator: pluginRunOrchestrator,
								shouldPreserveBaseTool: (toolName) => mcpController?.isManagedTool(toolName) === true,
								resolveActivation: (context) =>
									toPluginToolActivation(
										resolveTurnToolActivation(
											effectiveActivation,
											context,
											{
												backgroundTasksAvailable,
												knowledgeAvailable,
											},
											configurationState.readAgentMode(),
										),
										configurationState.readAgentMode(),
									),
							})
						: undefined;
				const todoContinuationSource = new CodingAgentTodoContinuationSource({ state: todoRuntime });
				const stopHookContinuationSource = new CodingAgentStopHookContinuationSource({ hookRuntime });
				const continuationOrchestrator = new CodingAgentContinuationOrchestrator({
					todo: todoContinuationSource,
					plugin: pluginRunOrchestrator,
					stopHook: stopHookContinuationSource,
				});
				const injectedSystemPromptOptionsResolver =
					options.createSystemPromptOptionsResolver?.(sessionOptions) ?? options.resolveSystemPromptOptions;
				const promptRuntime = injectedSystemPromptOptionsResolver
					? undefined
					: options.promptResourceSource && options.promptSettingsSource
						? new CodingAgentPromptRuntime({
								cwd: sessionCwd,
								resourceLoader: options.promptResourceSource,
								settingsManager: options.promptSettingsSource,
								scenario,
								readAgentMode: () => configurationState.readAgentMode(),
								readMemory: memoryRuntime ? () => memoryRuntime.readPromptMemory() : undefined,
								readAgentPlugins: () => configurationState.readAgentPlugins(),
							})
						: await createCodingAgentPromptRuntime({
								cwd: sessionCwd,
								agentDir: options.agentDir,
								scenario,
								resourceLoaderOptions: {
									includeAgentSkills: sessionOptions.includeAgentSkills,
								},
								readAgentMode: () => configurationState.readAgentMode(),
								readMemory: memoryRuntime ? () => memoryRuntime.readPromptMemory() : undefined,
								readAgentPlugins: () => configurationState.readAgentPlugins(),
							});
				const resolveSystemPromptOptions =
					injectedSystemPromptOptionsResolver ?? promptRuntime?.resolveSystemPromptOptions;
				if (!resolveSystemPromptOptions) {
					throw new Error("Coding Agent system prompt resolver was not created");
				}
				const promptResourceSource = options.promptResourceSource ?? promptRuntime?.readResourceSource();
				const invokeSkillFeature = promptResourceSource
					? createCodingAgentInvokeSkillRuntimeFeature({
							resourceSource: promptResourceSource,
							readAgentMode: () => configurationState.readAgentMode(),
						})
					: undefined;
				const readAvailableTools = () =>
					new Map([
						...tools.registry
							.snapshot()
							.entries.filter((entry) => !activeExecutionRuntime.ownsTool(entry.registration.tool.name))
							.map(
								(entry) =>
									[entry.registration.tool.name, guardCodingToolRegistration(tools.registry, entry)] as const,
							),
						...activeExecutionRuntime.readAvailableTools(),
						...productToolRegistrations.map(({ tool }) => [tool.name, tool] as const),
						...(todoEnabled ? [[todoRegistration.tool.name, todoRegistration.tool] as const] : []),
						...(memoryRuntime
							? [[memoryRuntime.toolRegistration.tool.name, memoryRuntime.toolRegistration.tool] as const]
							: []),
						...(subagentRuntime ? subagentRuntime.readTools().map((tool) => [tool.name, tool] as const) : []),
						...(invokeSkillFeature ? [[invokeSkillFeature.tool.name, invokeSkillFeature.tool] as const] : []),
					]);
				const profile: AgentProfile = {
					...baseProfile,
					features: [
						...baseProfile.features,
						productToolFeature,
						...(invokeSkillFeature ? [invokeSkillFeature] : []),
						...(subagentRuntime ? [subagentRuntime.feature] : []),
					],
					observers: [...(baseProfile.observers ?? []), contextRuntime, ...(memoryRuntime ? [memoryRuntime] : [])],
					contextStrategy: contextRuntime,
					modelCallContextTransformer: contextRuntime,
					continuationPolicy: continuationOrchestrator,
					modelCallFrameComposer: new CodingAgentModelCallFrameComposer({
						readMcpPromptState: mcpController ? () => mcpController.readPromptState() : undefined,
						readAvailableTools,
						readActiveToolNamesOverride: () => configurationState.readActiveToolNamesOverride(),
						pluginRunOrchestrator,
						pluginMcpRuntime,
						pluginToolRuntime,
						readAgentMode: () => configurationState.readAgentMode(),
						isMcpToolVisible: (toolName) => mcpController?.isToolVisible(toolName) ?? true,
						systemPromptAdvertisedToolNames: options.systemPromptAdvertisedToolNames,
						hookRuntime,
						resolveSystemPromptOptions: async (context) => {
							const promptOptions = await resolveSystemPromptOptions(context);
							return {
								...promptOptions,
								cwd: promptOptions.cwd ?? sessionCwd,
								agentPlugins: promptOptions.agentPlugins ?? configurationState.readAgentPlugins(),
								appendSystemPrompt: joinPromptAddons(
									promptOptions.appendSystemPrompt,
									sessionOptions.systemPromptAddon,
								),
								...(memoryRuntime ? { memory: memoryRuntime.renderPromptMemory() } : {}),
							};
						},
					}),
				};
				let capabilities: RuntimeCapabilityComposition;
				try {
					capabilities = await RuntimeCapabilityComposition.create({
						initialProfile: profile,
						compiler: tools.compiler,
					});
				} catch (error) {
					if (mcpController) mcpControllers.delete(sessionOptions.sessionId);
					todoRuntimes.delete(todoRuntime);
					contextRuntimes.delete(contextRuntime);
					if (memoryRuntime) {
						memoryRuntimes.delete(memoryRuntime);
						memoryRuntime.dispose();
					}
					if (memoryController) memoryControllers.delete(activeSessionId);
					contextRuntime.dispose();
					await todoRuntime.dispose();
					throw error;
				}
				capabilityCompositions.add(capabilities);
				if (memoryController) memoryControllers.set(activeSessionId, memoryController);
				hookSessionDisposers.add(endHookSession);
				const promptAdapter = new CodingAgentGreenfieldPromptAdapter({
					resolvePromptResource:
						options.createPromptResourceResolver?.(sessionOptions, todoRuntime) ??
						options.resolvePromptResource ??
						(options.promptResourceSource
							? createCodingAgentPromptResourceResolver({
									resourceLoader: options.promptResourceSource,
									todoStore: todoRuntime.getTodoStore(),
								})
							: undefined),
					hookRuntime,
				});
				return {
					sessionId: sessionOptions.sessionId,
					repository,
					conversationDocumentStore: repository,
					conversationContinuationStore: repository,
					promptAdapter: {
						async prepare(request, context) {
							await refreshSessionMcp(activeSessionId, true);
							const prepared = await promptAdapter.prepare(request, context);
							await todoRuntime.flush();
							return prepared;
						},
					},
					snapshotProvider: capabilities,
					modelRuntime,
					documentParticipants: [todoRuntime, contextRuntime, ...(subagentRuntime ? [subagentRuntime] : [])],
					todoController: todoRuntime,
					toolController: {
						readActiveToolNames: () => {
							const override = configurationState.readActiveToolNamesOverride();
							return override
								? override.filter((toolName) => readAvailableTools().has(toolName))
								: readActiveToolNames(
										tools,
										withAgentMode(stateActivation, configurationState.readAgentMode()),
										knowledgeAvailable,
										effectiveActivation,
										mcpController,
									);
						},
						readAvailableTools,
						setActiveToolNames: (toolNames) => {
							configurationState.setActiveToolNamesOverride(toolNames);
						},
					},
					createSessionPeripherals: (session) => ({
						hostInteraction: activeExecutionRuntime.hostInteraction,
						executionController: activeExecutionRuntime.createExecutionController(session),
						backgroundWorkController: new GreenfieldBackgroundWorkController(
							activeExecutionRuntime.backgroundService,
							subagentRuntime,
						),
						configurationController: configurationState.createController(
							session,
							pluginMcpRuntime
								? {
										reconfigureAgentPlugins: async (agentPlugins) => {
											await pluginMcpRuntime?.reconfigure(agentPlugins);
										},
									}
								: undefined,
						),
					}),
					contextRuntime,
					identity: {
						cwd: sessionOptions.cwd ?? cwd,
						sessionPath: repository.resolveConversationPath(sessionOptions.sessionId),
						parentSessionPath: sessionOptions.parentSessionPath,
						parentEntryId: sessionOptions.parentEntryId,
					},
					stateSource: {
						read: () => {
							const baseToolNames =
								pluginRunOrchestrator?.readActiveToolNames() ??
								readActiveToolNames(
									tools,
									withAgentMode(stateActivation, configurationState.readAgentMode()),
									knowledgeAvailable,
									effectiveActivation,
									mcpController,
								);
							const executionTools = activeExecutionRuntime.readAvailableTools();
							const activeToolNames = [
								...baseToolNames.filter(
									(toolName) => !activeExecutionRuntime.ownsTool(toolName) || executionTools.has(toolName),
								),
								...selectCodingToolRegistrations(
									productToolRegistrations,
									withAgentMode(stateActivation, configurationState.readAgentMode()),
								).map(({ tool }) => tool.name),
								...(todoEnabled ? [todoRegistration.tool.name] : []),
								...(memoryRuntime ? [memoryRuntime.toolRegistration.tool.name] : []),
								...(subagentRuntime ? subagentRuntime.readTools().map(({ name }) => name) : []),
								...(sessionOptions.askUserQuestion &&
								isCodingAgentAskUserQuestionEnabled({
									capability: sessionOptions.askUserQuestion,
									scenario,
								})
									? [CODING_AGENT_ASK_USER_QUESTION_TOOL_NAME]
									: []),
							];
							const contextWindow = modelRuntime.readCurrentModel().contextWindow;
							const contextUsage = contextRuntime.readUsage(contextWindow);
							const override = configurationState.readActiveToolNamesOverride();
							return {
								contextPercent: contextUsage.percent,
								contextWindow,
								activeToolNames: override
									? override.filter((toolName) => readAvailableTools().has(toolName))
									: [...new Set(activeToolNames)],
							};
						},
					},
					async onConversationContinued(result) {
						const previousSessionId = activeSessionId;
						await activeOwnership?.rebind(repository.resolveConversationPath(result.sessionId));
						activeSessionId = result.sessionId;
						if (mcpRefreshObservedSessions.delete(previousSessionId)) {
							mcpRefreshObservedSessions.add(result.sessionId);
						}
						if (mcpPromptRefreshReuseSessions.delete(previousSessionId)) {
							mcpPromptRefreshReuseSessions.add(result.sessionId);
						}
						pluginSession.id = result.sessionId;
						if (memoryController && memoryControllers.get(previousSessionId) === memoryController) {
							memoryControllers.delete(previousSessionId);
							memoryControllers.set(result.sessionId, memoryController);
						}
						if (mcpController && mcpControllers.get(previousSessionId) === mcpController) {
							mcpControllers.delete(previousSessionId);
							mcpControllers.set(result.sessionId, mcpController);
						}
						if (pluginMcpRuntime && pluginMcpRuntimes.get(previousSessionId) === pluginMcpRuntime) {
							pluginMcpRuntimes.delete(previousSessionId);
							pluginMcpRuntimes.set(result.sessionId, pluginMcpRuntime);
						}
						if (executionRuntimes.get(previousSessionId) === activeExecutionRuntime) {
							executionRuntimes.delete(previousSessionId);
							executionRuntimes.set(result.sessionId, activeExecutionRuntime);
						}
						if (configurationStates.get(previousSessionId) === configurationState) {
							configurationStates.delete(previousSessionId);
							configurationStates.set(result.sessionId, configurationState);
						}
						if (resourceContexts.get(previousSessionId) === resourceContext) {
							resourceContexts.delete(previousSessionId);
							resourceContexts.set(result.sessionId, resourceContext);
						}
					},
					async dispose() {
						try {
							await subagentRuntime?.dispose();
							contextRuntimes.delete(contextRuntime);
							contextRuntime.dispose();
							if (memoryRuntime) {
								memoryRuntimes.delete(memoryRuntime);
								memoryRuntime.dispose();
							}
							if (memoryControllers.get(activeSessionId) === memoryController) {
								memoryControllers.delete(activeSessionId);
							}
							await endHookSession();
							if (mcpControllers.get(activeSessionId) === mcpController) {
								mcpControllers.delete(activeSessionId);
							}
							if (pluginMcpRuntime && pluginMcpRuntimes.get(activeSessionId) === pluginMcpRuntime) {
								pluginMcpRuntimes.delete(activeSessionId);
							}
							await pluginMcpRuntime?.dispose();
							if (executionRuntimes.get(activeSessionId) === activeExecutionRuntime) {
								executionRuntimes.delete(activeSessionId);
							}
							if (configurationStates.get(activeSessionId) === configurationState) {
								configurationStates.delete(activeSessionId);
							}
							if (resourceContexts.get(activeSessionId) === resourceContext) {
								resourceContexts.delete(activeSessionId);
							}
							mcpRefreshObservedSessions.delete(activeSessionId);
							mcpPromptRefreshReuseSessions.delete(activeSessionId);
							activeExecutionRuntime.dispose();
							capabilityCompositions.delete(capabilities);
							todoRuntimes.delete(todoRuntime);
							await todoRuntime.dispose();
							await capabilities.close();
						} finally {
							await releaseOwnership(activeOwnership);
							activeOwnership = undefined;
						}
					},
				};
			} catch (error) {
				await subagentRuntime?.dispose();
				if (pluginMcpRuntime && pluginMcpRuntimes.get(activeSessionId) === pluginMcpRuntime) {
					pluginMcpRuntimes.delete(activeSessionId);
				}
				await pluginMcpRuntime?.dispose();
				if (executionRuntimes.get(activeSessionId) === executionRuntime) {
					executionRuntimes.delete(activeSessionId);
				}
				configurationStates.delete(activeSessionId);
				if (resourceContexts.get(activeSessionId) === resourceContext) {
					resourceContexts.delete(activeSessionId);
				}
				mcpRefreshObservedSessions.delete(activeSessionId);
				mcpPromptRefreshReuseSessions.delete(activeSessionId);
				executionRuntime?.dispose();
				await releaseOwnership(activeOwnership);
				throw error;
			}
		},
	});
	async function refreshSessionMcp(
		sessionId: string,
		reportPromptBoundary: boolean,
	): Promise<McpRuntimeToolSnapshot | undefined> {
		const pluginRuntime = pluginMcpRuntimes.get(sessionId);
		const resourceContext = resourceContexts.get(sessionId);
		const firstPromptRefresh = reportPromptBoundary && !mcpRefreshObservedSessions.has(sessionId);
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
			if (snapshot) mcpControllers.get(sessionId)?.refresh(snapshot);
			const changed = snapshot?.revision !== before?.revision;
			if (reportPromptBoundary && (firstPromptRefresh || changed) && resourceContext) {
				if (!startReported) {
					await resourceContext.reportObservation({ type: "mcp.reload.start", source: "agent" });
				}
				await resourceContext.reportObservation({ type: "mcp.reload.end", changed, source: "agent" });
			}
			if (reportPromptBoundary) mcpRefreshObservedSessions.add(sessionId);
			if (reportPromptBoundary) mcpPromptRefreshReuseSessions.add(sessionId);
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

	let disposed = false;
	return {
		backend,
		tools,
		scenario,
		appendSessionContext(sessionId, records) {
			const context = resourceContexts.get(sessionId);
			if (!context) throw new Error(`Greenfield session context not found: ${sessionId}`);
			context.contextAppender.append(records);
		},
		async deliverSessionContext(sessionId, records) {
			const context = resourceContexts.get(sessionId);
			if (!context) throw new Error(`Greenfield session context not found: ${sessionId}`);
			await context.deliverAsyncContext(records);
		},
		async flushMemory(sessionId, signal) {
			return (await memoryControllers.get(sessionId)?.flushMemory(signal)) ?? 0;
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			for (const contextRuntime of contextRuntimes) contextRuntime.dispose();
			for (const memoryRuntime of memoryRuntimes) memoryRuntime.dispose();
			const capabilityResults = await Promise.allSettled([
				...[...hookSessionDisposers].map((disposeHookSession) => disposeHookSession()),
				...[...todoRuntimes].map((runtime) => runtime.dispose()),
				...[...capabilityCompositions].map((capabilities) => capabilities.close()),
				...[...ownershipBindings].map((binding) => releaseOwnership(binding)),
				...[...pluginMcpRuntimes.values()].map((runtime) => runtime.dispose()),
			]);
			capabilityCompositions.clear();
			todoRuntimes.clear();
			contextRuntimes.clear();
			memoryRuntimes.clear();
			memoryControllers.clear();
			resourceContexts.clear();
			mcpRefreshObservedSessions.clear();
			mcpPromptRefreshReuseSessions.clear();
			hookSessionDisposers.clear();
			mcpControllers.clear();
			pluginMcpRuntimes.clear();
			for (const executionRuntime of executionRuntimes.values()) executionRuntime.dispose();
			executionRuntimes.clear();
			configurationStates.clear();
			ownershipBindings.clear();
			await repository.close();
			mcpSynchronizer?.dispose();
			tools.dispose();
			const errors = capabilityResults
				.filter((result): result is PromiseRejectedResult => result.status === "rejected")
				.map(({ reason }) => reason);
			if (errors.length > 0) {
				throw new AggregateError(errors, "Failed to dispose one or more Greenfield runtime resources");
			}
		},
	};
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

function withInheritedMcpTools(
	activation: CodingToolActivation,
	inheritedMcpView: McpRuntimeToolView,
): CodingToolActivation {
	if (activation.mode === "scope" || inheritedMcpView.tools.length === 0) return activation;
	return {
		mode: "explicit",
		toolNames: [...new Set([...activation.toolNames, ...inheritedMcpView.tools.map(({ tool }) => tool.name)])],
	};
}

function toPluginToolActivation(
	activation: CodingToolActivation,
	agentMode: string | undefined,
): CodingAgentPluginToolActivation {
	if (activation.mode === "explicit") {
		return activation;
	}
	return {
		mode: "scope",
		scenario: activation.scope ?? "cli",
		capabilities: activation.capabilities,
		additionallyEnabledToolNames: activation.additionallyEnabledToolNames,
		agentMode,
	};
}

function readActiveToolNames(
	tools: CodingToolsRuntimeComposition,
	activation: CodingToolActivation,
	knowledgeAvailable: boolean,
	baseActivation: CodingToolActivation,
	mcpController: McpDeferredToolController | undefined,
): string[] {
	const selected = selectCodingToolRegistrations(
		tools.registry.snapshot().registrations.filter(({ category, tool }) => {
			if (
				category === "kb-read" &&
				!(knowledgeAvailable && baseActivation.mode === "scope" && baseActivation.scope === "kb-processing")
			) {
				return false;
			}
			return !mcpController?.isManagedTool(tool.name) || mcpController.isToolVisible(tool.name);
		}),
		activation,
	).map(({ tool }) => tool.name);
	if (!mcpController?.isDeferred()) return selected;
	return [...selected, "tool_search"];
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

function withCapabilities(base: Extract<CodingToolActivation, { mode: "scope" }>, added: readonly string[]) {
	return {
		...base,
		capabilities: new Set([...(base.capabilities ?? []), ...added]),
	} satisfies CodingToolActivation;
}

function withAgentMode(activation: CodingToolActivation, agentMode: string | undefined): CodingToolActivation {
	return activation.mode === "scope" ? { ...activation, agentMode } : activation;
}

function withScenario(activation: CodingToolActivation, scenario: ConversationScenario): CodingToolActivation {
	return activation.mode === "scope" ? { ...activation, scope: scenario } : activation;
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

function toSubagentInfo(snapshot: SubagentSnapshot): Omit<SubagentSnapshot, "usage"> {
	const { usage: _usage, ...info } = snapshot;
	return info;
}

function joinPromptAddons(base: string | undefined, addon: string | undefined): string | undefined {
	const parts = [base, addon].filter((value): value is string => Boolean(value?.trim()));
	return parts.length > 0 ? parts.join("\n\n") : undefined;
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

async function validateRecoveredSubagentTranscript(
	snapshot: SubagentSnapshot,
	parentSessionPath: string,
): Promise<string | undefined> {
	const sessionFile = snapshot.sessionFile;
	if (!sessionFile) return "Recovered subagent has no child session transcript";
	const expectedDirectory = resolve(dirname(parentSessionPath), ".subagents", snapshot.parentSessionId);
	const resolvedSessionFile = resolve(sessionFile);
	const childRepository = new FileConversationRepository({ rootDir: expectedDirectory });
	const expectedSessionFile = childRepository.resolveConversationPath(snapshot.id);
	await childRepository.close();
	if (resolvedSessionFile !== expectedSessionFile) {
		return "Recovered subagent transcript does not match the parent-owned session path";
	}
	try {
		const metadata = await stat(resolvedSessionFile);
		return metadata.isFile() ? undefined : "Recovered subagent transcript is not a file";
	} catch {
		return "Recovered subagent transcript is missing";
	}
}

const EMPTY_MCP_TOOL_VIEW: McpRuntimeToolView = Object.freeze({ tools: Object.freeze([]) });

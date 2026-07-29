import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { Message } from "@vetta/ai";
import { createKbFilterByTagsTool, createKbListTagsTool } from "@vetta/coding-agent";
import {
	adaptCodingAgentToolRegistration,
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
	createCodingAgentMemoryRuntimeFeature,
	createCodingAgentPromptResourceResolver,
	createCodingAgentPromptRuntime,
	createCodingAgentTodoRuntimeFeature,
	createCodingAgentTodoRuntimeToolRegistration,
	createEcosystemHookRuntime,
	type EcosystemHookAdapterFactory,
	type HookConfigLayer,
} from "@vetta/coding-agent/runtime-host/greenfield";
import {
	ComposedGreenfieldRuntimeFactory,
	type ConversationScenario,
	GreenfieldRuntimeModel,
	type GreenfieldRuntimeResourceContext,
	GreenfieldRuntimeSessionBackend,
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
	type McpRuntimeToolSource,
	type McpRuntimeToolSynchronizer,
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
	type CodingToolActivation,
	guardCodingToolRegistration,
	selectCodingToolRegistrations,
} from "@vetta/runtime-tools/coding";
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

export interface GreenfieldCliSessionOptions {
	readonly sessionId: string;
	readonly cwd?: string;
	readonly agentMode?: string;
	readonly executionMode?: SessionExecutionMode;
	readonly env?: Readonly<Record<string, string>>;
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
		sessionOptions: GreenfieldCliSessionOptions,
		todoRuntime: CodingAgentTodoRuntime,
	) => CodingAgentPromptResourceResolver;
	/** 无状态解析器的兼容入口。 */
	readonly resolvePromptResource?: CodingAgentPromptResourceResolver;
	/** 为每个 Session 创建调用级系统提示词来源。 */
	readonly createSystemPromptOptionsResolver?: (
		sessionOptions: GreenfieldCliSessionOptions,
	) => CodingAgentSystemPromptOptionsResolver;
	/** 无状态系统提示词来源的兼容入口。 */
	readonly resolveSystemPromptOptions?: CodingAgentSystemPromptOptionsResolver;
	/** 为每个 Session 绑定动态 Plugin Provider 与 Continuation bridge。 */
	readonly createPluginRuntime?: (
		sessionOptions: GreenfieldCliSessionOptions,
	) => CodingAgentPluginRuntimeSource | undefined;
	/** 为每个 Session 创建唯一 Todo Runtime；Tool、Continuation、Scene 与 Controller 共享它。 */
	readonly createTodoRuntime?: (sessionOptions: GreenfieldCliSessionOptions) => CodingAgentTodoRuntime;
	/** 追加到每个 Session 内置 Codex/Claude Hook Adapter 之后。 */
	readonly additionalHookAdapterFactories?: readonly EcosystemHookAdapterFactory[];
	/** 显式 Hook 配置层；未提供时由内置 Adapter 使用各自默认发现规则。 */
	readonly hookConfigLayers?: readonly HookConfigLayer[];
	readonly maxStopHookContinuations?: number;
	/** 运行中读取压缩设置；未提供时使用 Coding Agent 既有默认值。 */
	readonly resolveCompactionSettings?: CodingAgentGreenfieldContextRuntimeOptions["resolveSettings"];
	/** 为每个 Session 创建旧 Extension 压缩事件的窄适配器。 */
	readonly createCompactionExtensionRuntime?: (
		sessionOptions: GreenfieldCliSessionOptions,
	) => CodingAgentCompactionExtensionRuntime | undefined;
	/** 测试或宿主可替换摘要调用；生产默认复用 Coding Agent 既有实现。 */
	readonly generateCompaction?: CodingAgentGreenfieldContextRuntimeOptions["generateCompaction"];
	/** 为每个 memory-mode Session 创建产品级 Memory Runtime；默认使用 Coding Agent 既有实现。 */
	readonly createMemoryRolloverRuntime?: (
		options: CodingAgentMemoryRolloverOrchestratorOptions,
		sessionOptions: GreenfieldCliSessionOptions,
	) => CodingAgentMemoryRolloverRuntime;
}

export interface GreenfieldRuntimeComposition {
	readonly backend: GreenfieldRuntimeSessionBackend<GreenfieldCliSessionOptions>;
	readonly tools: CodingToolsRuntimeComposition;
	readonly scenario: ConversationScenario;
	appendSessionContext(sessionId: string, records: readonly SessionContextRecord[]): void;
	deliverSessionContext(sessionId: string, records: readonly SessionContextRecord[]): Promise<void>;
	flushMemory(sessionId: string, signal?: AbortSignal): Promise<number>;
	dispose(): Promise<void>;
}

/**
 * CLI 的 Greenfield 并行组合入口。
 *
 * 它使用真实文件 Repository 与 Runtime Coding Tools，但不替换现有 CLI/RuntimeHost
 * 默认入口；调用方必须显式持有并使用返回的 Backend。
 */
export async function createGreenfieldRuntimeComposition(
	options: GreenfieldRuntimeCompositionOptions,
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
	const executionRuntimes = new Map<string, GreenfieldSessionExecutionRuntime>();
	const tools = createCodingToolsRuntimeComposition({
		cwd,
		activation: effectiveActivation,
		resolveActivation: (context) =>
			resolveTurnToolActivation(effectiveActivation, context, {
				backgroundTasksAvailable,
				knowledgeAvailable,
			}),
		refreshCatalog: async (context) => {
			const snapshot = await mcpSynchronizer?.refresh();
			if (snapshot) mcpControllers.get(context.sessionId)?.refresh(snapshot);
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
			adaptCodingAgentToolRegistration(createKbListTagsTool(options.knowledgeRoot)),
			adaptCodingAgentToolRegistration(createKbFilterByTagsTool(options.knowledgeRoot)),
		],
		tokenBudget: options.tokenBudget,
		reservedOutputTokens: options.reservedOutputTokens,
	});
	backgroundTasksAvailable = tools.backgroundService !== undefined;
	mcpSynchronizer = options.mcpSource
		? createMcpRuntimeToolSynchronizer(options.mcpSource, tools.registry)
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
	const resourceContexts = new Map<string, GreenfieldRuntimeResourceContext>();
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
	const runtimeFactory = new ComposedGreenfieldRuntimeFactory<GreenfieldCliSessionOptions>({
		streamFn: options.streamFn,
		async createResources(sessionOptions, resourceContext) {
			let activeSessionId = sessionOptions.sessionId;
			let activeOwnership = await acquireOwnership(activeSessionId);
			let executionRuntime: GreenfieldSessionExecutionRuntime | undefined;
			let subagentRuntime: GreenfieldSubagentRuntime | undefined;
			resourceContexts.set(activeSessionId, resourceContext);
			try {
				const synchronizer = mcpSynchronizer;
				const mcpController = synchronizer
					? createMcpDeferredToolController({
							sessionId: sessionOptions.sessionId,
							deferredEnabled: effectiveActivation.mode !== "explicit",
							explicitToolNames:
								effectiveActivation.mode === "explicit" ? new Set(effectiveActivation.toolNames) : undefined,
						})
					: undefined;
				if (mcpController && synchronizer) {
					mcpController.refresh(synchronizer.snapshot());
					mcpControllers.set(sessionOptions.sessionId, mcpController);
				}
				const sessionCwd = sessionOptions.cwd ?? cwd;
				executionRuntime = new GreenfieldSessionExecutionRuntime({
					cwd: sessionCwd,
					activation: effectiveActivation,
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
				}
				const todoRegistration = createCodingAgentTodoRuntimeToolRegistration(todoRuntime);
				const todoEnabled = selectCodingToolRegistrations([todoRegistration], effectiveActivation).length > 0;
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
							],
						};
				const modelRuntime = new GreenfieldRuntimeModel({
					initialModel: options.initialModel,
					initialThinkingLevel: options.initialThinkingLevel,
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
				const subagentForkContexts = new Map<string, readonly Message[]>();
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
					const retainedForkContext =
						operation === "create" ? forkContext : (subagentForkContexts.get(childSessionId) ?? forkContext);
					if (retainedForkContext) subagentForkContexts.set(childSessionId, retainedForkContext);
					const childComposition = await createGreenfieldRuntimeComposition({
						...options,
						conversationDir: childConversationDir,
						initialModel: modelRuntime.readCurrentModel(),
						initialThinkingLevel: modelRuntime.readThinkingLevel(),
						cwd: sessionCwd,
						activation: withScenario(type.profile.activation, scenario),
						enableSubagents: false,
					});
					try {
						const childOptions: GreenfieldCliSessionOptions = {
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
				const pluginRuntime = options.createPluginRuntime?.(sessionOptions);
				const configurationState = new GreenfieldSessionConfigurationState(sessionOptions.agentMode, () =>
					pluginRuntime?.readAgentPlugins(),
				);
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
										resolveTurnToolActivation(effectiveActivation, context, {
											backgroundTasksAvailable,
											knowledgeAvailable,
										}),
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
								readAgentMode: () => configurationState.readAgentMode(),
								readMemory: memoryRuntime ? () => memoryRuntime.readPromptMemory() : undefined,
								readAgentPlugins: () => configurationState.readAgentPlugins(),
							});
				const resolveSystemPromptOptions =
					injectedSystemPromptOptionsResolver ?? promptRuntime?.resolveSystemPromptOptions;
				if (!resolveSystemPromptOptions) {
					throw new Error("Coding Agent system prompt resolver was not created");
				}
				const profile: AgentProfile = {
					...baseProfile,
					features: [...baseProfile.features, ...(subagentRuntime ? [subagentRuntime.feature] : [])],
					observers: [...(baseProfile.observers ?? []), contextRuntime, ...(memoryRuntime ? [memoryRuntime] : [])],
					contextStrategy: contextRuntime,
					modelCallContextTransformer: contextRuntime,
					continuationPolicy: continuationOrchestrator,
					modelCallFrameComposer: new CodingAgentModelCallFrameComposer({
						readMcpPromptState: mcpController ? () => mcpController.readPromptState() : undefined,
						readAvailableTools: () =>
							new Map([
								...tools.registry
									.snapshot()
									.entries.filter((entry) => !activeExecutionRuntime.ownsTool(entry.registration.tool.name))
									.map(
										(entry) =>
											[
												entry.registration.tool.name,
												guardCodingToolRegistration(tools.registry, entry),
											] as const,
									),
								...activeExecutionRuntime.readAvailableTools(),
								...(todoEnabled ? [[todoRegistration.tool.name, todoRegistration.tool] as const] : []),
								...(memoryRuntime
									? [[memoryRuntime.toolRegistration.tool.name, memoryRuntime.toolRegistration.tool] as const]
									: []),
								...(subagentRuntime
									? subagentRuntime.readTools().map((tool) => [tool.name, tool] as const)
									: []),
							]),
						pluginRunOrchestrator,
						pluginToolRuntime,
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
							const prepared = await promptAdapter.prepare(request, context);
							await todoRuntime.flush();
							return prepared;
						},
					},
					snapshotProvider: capabilities,
					modelRuntime,
					documentParticipants: [todoRuntime, contextRuntime],
					todoController: todoRuntime,
					createSessionPeripherals: (session) => ({
						hostInteraction: activeExecutionRuntime.hostInteraction,
						executionController: activeExecutionRuntime.createExecutionController(session),
						backgroundWorkController: new GreenfieldBackgroundWorkController(
							activeExecutionRuntime.backgroundService,
							subagentRuntime,
						),
						configurationController: configurationState.createController(session),
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
							const activeToolNames = [
								...(pluginRunOrchestrator?.readActiveToolNames() ??
									readActiveToolNames(
										tools,
										stateActivation,
										knowledgeAvailable,
										effectiveActivation,
										mcpController,
									)),
								...(todoEnabled ? [todoRegistration.tool.name] : []),
								...(memoryRuntime ? [memoryRuntime.toolRegistration.tool.name] : []),
								...(subagentRuntime ? subagentRuntime.readTools().map(({ name }) => name) : []),
							];
							const contextWindow = modelRuntime.readCurrentModel().contextWindow;
							const contextUsage = contextRuntime.readUsage(contextWindow);
							return {
								contextPercent: contextUsage.percent,
								contextWindow,
								activeToolNames: [...new Set(activeToolNames)],
							};
						},
					},
					async onConversationContinued(result) {
						const previousSessionId = activeSessionId;
						await activeOwnership?.rebind(repository.resolveConversationPath(result.sessionId));
						activeSessionId = result.sessionId;
						pluginSession.id = result.sessionId;
						if (memoryController && memoryControllers.get(previousSessionId) === memoryController) {
							memoryControllers.delete(previousSessionId);
							memoryControllers.set(result.sessionId, memoryController);
						}
						if (mcpController && mcpControllers.get(previousSessionId) === mcpController) {
							mcpControllers.delete(previousSessionId);
							mcpControllers.set(result.sessionId, mcpController);
						}
						if (executionRuntimes.get(previousSessionId) === activeExecutionRuntime) {
							executionRuntimes.delete(previousSessionId);
							executionRuntimes.set(result.sessionId, activeExecutionRuntime);
						}
						if (resourceContexts.get(previousSessionId) === resourceContext) {
							resourceContexts.delete(previousSessionId);
							resourceContexts.set(result.sessionId, resourceContext);
						}
					},
					async dispose() {
						try {
							await subagentRuntime?.dispose();
							subagentForkContexts.clear();
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
							if (executionRuntimes.get(activeSessionId) === activeExecutionRuntime) {
								executionRuntimes.delete(activeSessionId);
							}
							if (resourceContexts.get(activeSessionId) === resourceContext) {
								resourceContexts.delete(activeSessionId);
							}
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
				if (executionRuntimes.get(activeSessionId) === executionRuntime) {
					executionRuntimes.delete(activeSessionId);
				}
				if (resourceContexts.get(activeSessionId) === resourceContext) {
					resourceContexts.delete(activeSessionId);
				}
				executionRuntime?.dispose();
				await releaseOwnership(activeOwnership);
				throw error;
			}
		},
	});
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
			]);
			capabilityCompositions.clear();
			todoRuntimes.clear();
			contextRuntimes.clear();
			memoryRuntimes.clear();
			memoryControllers.clear();
			resourceContexts.clear();
			hookSessionDisposers.clear();
			mcpControllers.clear();
			for (const executionRuntime of executionRuntimes.values()) executionRuntime.dispose();
			executionRuntimes.clear();
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
): CodingToolActivation {
	if (base.mode === "explicit") return base;
	const capabilities = new Set(base.capabilities);
	if (availability.backgroundTasksAvailable) capabilities.add("bg-tasks");
	if (isKnowledgeToolEnabled(base, context, availability.knowledgeAvailable)) {
		capabilities.add("knowledge");
	}
	return { ...base, capabilities };
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

import { join } from "node:path";
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
	CodingAgentStopHookContinuationSource,
	type CodingAgentSystemPromptOptionsResolver,
	CodingAgentTodoContinuationSource,
	CodingAgentTodoRuntime,
	createCodingAgentMemoryRuntimeFeature,
	createCodingAgentPromptRuntime,
	createCodingAgentTodoRuntimeFeature,
	createCodingAgentTodoRuntimeToolRegistration,
	createEcosystemHookRuntime,
	type EcosystemHookAdapterFactory,
	type HookConfigLayer,
} from "@vetta/coding-agent/runtime-host/greenfield";
import {
	ComposedGreenfieldRuntimeFactory,
	GreenfieldRuntimeModel,
	GreenfieldRuntimeSessionBackend,
	type SessionConfig,
} from "@vetta/runtime-core";
import { selectConversationDocumentModelMessages } from "@vetta/runtime-core/conversation";
import {
	type AgentCoreTurnEngineOptions,
	type AgentProfile,
	type ModelCallContributionContext,
	RuntimeCapabilityComposition,
} from "@vetta/runtime-core/kernel";
import {
	createMcpDeferredToolController,
	createMcpRuntimeToolSynchronizer,
	type McpDeferredToolController,
	type McpRuntimeToolSource,
	type McpRuntimeToolSynchronizer,
} from "@vetta/runtime-mcp";
import { FileConversationRepository } from "@vetta/runtime-storage/conversation";
import {
	type CodingToolActivation,
	guardCodingToolRegistration,
	selectCodingToolRegistrations,
} from "@vetta/runtime-tools/coding";
import {
	type CodingToolsRuntimeComposition,
	createCodingToolsRuntimeComposition,
} from "./runtime-tools-composition.js";

export interface GreenfieldCliSessionOptions {
	readonly sessionId: string;
	readonly cwd?: string;
	readonly agentMode?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
	readonly memoryMode?: boolean;
	readonly memoryFile?: string;
	readonly memoryCharLimit?: number;
}

export interface GreenfieldRuntimeCompositionOptions {
	readonly conversationDir: string;
	readonly modelRegistry: CodingAgentModelRegistrySource;
	readonly initialModel: NonNullable<SessionConfig["model"]>;
	readonly initialThinkingLevel: NonNullable<SessionConfig["thinkingLevel"]>;
	readonly cwd?: string;
	readonly agentDir?: string;
	readonly activation?: CodingToolActivation;
	readonly knowledgeEnabled?: boolean;
	readonly knowledgeRoot?: string;
	readonly mcpSource?: McpRuntimeToolSource;
	readonly streamFn?: AgentCoreTurnEngineOptions["streamFn"];
	readonly tokenBudget?: number;
	readonly reservedOutputTokens?: number;
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
	const effectiveActivation = options.activation ?? ({ mode: "scope", scope: "cli" } satisfies CodingToolActivation);
	const knowledgeAvailable = options.knowledgeEnabled ?? process.env.VETTA_KNOWLEDGE_DISABLED !== "1";
	let backgroundTasksAvailable = false;
	let mcpSynchronizer: McpRuntimeToolSynchronizer | undefined;
	const mcpControllers = new Map<string, McpDeferredToolController>();
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
	const hookSessionDisposers = new Set<() => Promise<void>>();
	const modelAdapter = new CodingAgentModelRegistryAdapter(options.modelRegistry);
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
			const todoRegistration = createCodingAgentTodoRuntimeToolRegistration(todoRuntime);
			const todoEnabled = selectCodingToolRegistrations([todoRegistration], effectiveActivation).length > 0;
			const baseProfile: AgentProfile = mcpController
				? {
						...tools.profile,
						features: [
							...tools.profile.features,
							...(todoEnabled ? [createCodingAgentTodoRuntimeFeature(todoRegistration)] : []),
							...(memoryRuntime ? [createCodingAgentMemoryRuntimeFeature(memoryRuntime.toolRegistration)] : []),
							mcpController.createFeature({ includePromptInstruction: false }),
						],
					}
				: {
						...tools.profile,
						features: [
							...tools.profile.features,
							...(todoEnabled ? [createCodingAgentTodoRuntimeFeature(todoRegistration)] : []),
							...(memoryRuntime ? [createCodingAgentMemoryRuntimeFeature(memoryRuntime.toolRegistration)] : []),
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
			const pluginSession = {
				id: activeSessionId,
				cwd: sessionCwd,
				scenario: "cli",
			};
			const pluginRunOrchestrator = pluginRuntime
				? new CodingAgentPluginRunOrchestrator({
						session: pluginSession,
						...pluginRuntime,
					})
				: undefined;
			const pluginToolRuntime =
				pluginRuntime && pluginRunOrchestrator
					? new CodingAgentPluginToolRuntime({
							readAgentPlugins: pluginRuntime.readAgentPlugins,
							invokeTool: pluginRuntime.invokeTool,
							runOrchestrator: pluginRunOrchestrator,
							shouldPreserveBaseTool: (toolName) => mcpController?.isManagedTool(toolName) === true,
							resolveActivation: (context) =>
								toPluginToolActivation(
									resolveTurnToolActivation(effectiveActivation, context, {
										backgroundTasksAvailable,
										knowledgeAvailable,
									}),
									sessionOptions.agentMode,
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
				: await createCodingAgentPromptRuntime({
						cwd: sessionCwd,
						agentDir: options.agentDir,
						scenario: "cli",
						readAgentMode: () => sessionOptions.agentMode,
						readMemory: memoryRuntime ? () => memoryRuntime.readPromptMemory() : undefined,
						readAgentPlugins: pluginRuntime?.readAgentPlugins,
					});
			const resolveSystemPromptOptions =
				injectedSystemPromptOptionsResolver ?? promptRuntime?.resolveSystemPromptOptions;
			if (!resolveSystemPromptOptions) {
				throw new Error("Coding Agent system prompt resolver was not created");
			}
			const profile: AgentProfile = {
				...baseProfile,
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
								.entries.map(
									(entry) =>
										[
											entry.registration.tool.name,
											guardCodingToolRegistration(tools.registry, entry),
										] as const,
								),
							...(todoEnabled ? [[todoRegistration.tool.name, todoRegistration.tool] as const] : []),
							...(memoryRuntime
								? [[memoryRuntime.toolRegistration.tool.name, memoryRuntime.toolRegistration.tool] as const]
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
							agentPlugins: promptOptions.agentPlugins ?? pluginRuntime?.readAgentPlugins(),
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
					options.createPromptResourceResolver?.(sessionOptions, todoRuntime) ?? options.resolvePromptResource,
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
				onConversationContinued(result) {
					const previousSessionId = activeSessionId;
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
				},
				async dispose() {
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
					capabilityCompositions.delete(capabilities);
					todoRuntimes.delete(todoRuntime);
					await todoRuntime.dispose();
					await capabilities.close();
				},
			};
		},
	});
	const backend = new GreenfieldRuntimeSessionBackend({ runtimeFactory });

	let disposed = false;
	return {
		backend,
		tools,
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
			]);
			capabilityCompositions.clear();
			todoRuntimes.clear();
			contextRuntimes.clear();
			memoryRuntimes.clear();
			memoryControllers.clear();
			hookSessionDisposers.clear();
			mcpControllers.clear();
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

import { createKbFilterByTagsTool, createKbListTagsTool } from "@vetta/coding-agent";
import {
	adaptCodingAgentToolRegistration,
	CodingAgentContinuationOrchestrator,
	CodingAgentGreenfieldPromptAdapter,
	CodingAgentModelCallFrameComposer,
	CodingAgentModelRegistryAdapter,
	type CodingAgentModelRegistrySource,
	CodingAgentPluginRunOrchestrator,
	type CodingAgentPluginRuntimeSource,
	type CodingAgentPluginToolActivation,
	CodingAgentPluginToolRuntime,
	type CodingAgentPromptResourceResolver,
	CodingAgentStopHookContinuationSource,
	type CodingAgentStopHookInvoker,
	type CodingAgentSystemPromptOptionsResolver,
	CodingAgentTodoContinuationSource,
	createCodingAgentPromptRuntime,
	type TodoContinuationState,
} from "@vetta/coding-agent/runtime-host/greenfield";
import {
	ComposedGreenfieldRuntimeFactory,
	GreenfieldRuntimeModel,
	GreenfieldRuntimeSessionBackend,
	type SessionConfig,
} from "@vetta/runtime-core";
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
	/** 为每个 Session 绑定 Todo 状态；该状态应与同 Session 的 Todo Tool 共享。 */
	readonly createTodoContinuationState?: (
		sessionOptions: GreenfieldCliSessionOptions,
	) => TodoContinuationState | undefined;
	/** 为每个 Session 绑定既有 Ecosystem Stop Hook bridge。 */
	readonly createStopHookInvoker?: (
		sessionOptions: GreenfieldCliSessionOptions,
	) => CodingAgentStopHookInvoker | undefined;
}

export interface GreenfieldRuntimeComposition {
	readonly backend: GreenfieldRuntimeSessionBackend<GreenfieldCliSessionOptions>;
	readonly tools: CodingToolsRuntimeComposition;
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
		async createResources(sessionOptions) {
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
			const baseProfile: AgentProfile = mcpController
				? {
						...tools.profile,
						features: [
							...tools.profile.features,
							mcpController.createFeature({ includePromptInstruction: false }),
						],
					}
				: tools.profile;
			const sessionCwd = sessionOptions.cwd ?? cwd;
			const pluginRuntime = options.createPluginRuntime?.(sessionOptions);
			const pluginRunOrchestrator = pluginRuntime
				? new CodingAgentPluginRunOrchestrator({
						session: {
							id: sessionOptions.sessionId,
							cwd: sessionCwd,
							scenario: "cli",
						},
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
			const todoContinuationState = options.createTodoContinuationState?.(sessionOptions);
			const todoContinuationSource = todoContinuationState
				? new CodingAgentTodoContinuationSource({ state: todoContinuationState })
				: undefined;
			const stopHookInvoker = options.createStopHookInvoker?.(sessionOptions);
			const stopHookContinuationSource = stopHookInvoker
				? new CodingAgentStopHookContinuationSource({ invoke: stopHookInvoker })
				: undefined;
			const continuationOrchestrator =
				todoContinuationSource || pluginRunOrchestrator || stopHookContinuationSource
					? new CodingAgentContinuationOrchestrator({
							todo: todoContinuationSource,
							plugin: pluginRunOrchestrator,
							stopHook: stopHookContinuationSource,
						})
					: undefined;
			const injectedSystemPromptOptionsResolver =
				options.createSystemPromptOptionsResolver?.(sessionOptions) ?? options.resolveSystemPromptOptions;
			const promptRuntime = injectedSystemPromptOptionsResolver
				? undefined
				: await createCodingAgentPromptRuntime({
						cwd: sessionCwd,
						agentDir: options.agentDir,
						scenario: "cli",
						readAgentMode: () => sessionOptions.agentMode,
						readAgentPlugins: pluginRuntime?.readAgentPlugins,
					});
			const resolveSystemPromptOptions =
				injectedSystemPromptOptionsResolver ?? promptRuntime?.resolveSystemPromptOptions;
			if (!resolveSystemPromptOptions) {
				throw new Error("Coding Agent system prompt resolver was not created");
			}
			const profile: AgentProfile = {
				...baseProfile,
				continuationPolicy: continuationOrchestrator,
				modelCallFrameComposer: new CodingAgentModelCallFrameComposer({
					readMcpPromptState: mcpController ? () => mcpController.readPromptState() : undefined,
					readAvailableTools: () =>
						new Map(
							tools.registry
								.snapshot()
								.entries.map((entry) => [
									entry.registration.tool.name,
									guardCodingToolRegistration(tools.registry, entry),
								]),
						),
					pluginRunOrchestrator,
					pluginToolRuntime,
					resolveSystemPromptOptions: async (context) => {
						const promptOptions = await resolveSystemPromptOptions(context);
						return {
							...promptOptions,
							cwd: promptOptions.cwd ?? sessionCwd,
							agentPlugins: promptOptions.agentPlugins ?? pluginRuntime?.readAgentPlugins(),
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
				throw error;
			}
			capabilityCompositions.add(capabilities);
			const modelRuntime = new GreenfieldRuntimeModel({
				initialModel: options.initialModel,
				initialThinkingLevel: options.initialThinkingLevel,
				catalog: modelAdapter,
				credentials: modelAdapter,
			});
			return {
				sessionId: sessionOptions.sessionId,
				repository,
				conversationDocumentStore: repository,
				promptAdapter: new CodingAgentGreenfieldPromptAdapter({
					resolvePromptResource:
						options.createPromptResourceResolver?.(sessionOptions) ?? options.resolvePromptResource,
				}),
				snapshotProvider: capabilities,
				modelRuntime,
				identity: {
					cwd: sessionOptions.cwd ?? cwd,
					sessionPath: repository.resolveConversationPath(sessionOptions.sessionId),
					parentSessionPath: sessionOptions.parentSessionPath,
					parentEntryId: sessionOptions.parentEntryId,
				},
				stateSource: {
					read: () => ({
						contextPercent: null,
						contextWindow: modelRuntime.readCurrentModel().contextWindow,
						activeToolNames: [
							...(pluginRunOrchestrator?.readActiveToolNames() ??
								readActiveToolNames(
									tools,
									stateActivation,
									knowledgeAvailable,
									effectiveActivation,
									mcpController,
								)),
						],
					}),
				},
				async dispose() {
					if (mcpControllers.get(sessionOptions.sessionId) === mcpController) {
						mcpControllers.delete(sessionOptions.sessionId);
					}
					capabilityCompositions.delete(capabilities);
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
		async dispose() {
			if (disposed) return;
			disposed = true;
			const capabilityResults = await Promise.allSettled(
				[...capabilityCompositions].map((capabilities) => capabilities.close()),
			);
			capabilityCompositions.clear();
			mcpControllers.clear();
			await repository.close();
			mcpSynchronizer?.dispose();
			tools.dispose();
			const errors = capabilityResults
				.filter((result): result is PromiseRejectedResult => result.status === "rejected")
				.map(({ reason }) => reason);
			if (errors.length > 0) {
				throw new AggregateError(errors, "Failed to dispose one or more runtime capability compositions");
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

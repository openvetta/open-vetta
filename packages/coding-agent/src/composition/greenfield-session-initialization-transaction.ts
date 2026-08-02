import { join } from "node:path";
import type { Message } from "@vetta/ai";
import {
	type ConversationScenario,
	GreenfieldRuntimeModel,
	type GreenfieldRuntimeResourceContext,
	type GreenfieldRuntimeResources,
	InitializationRollbackScope,
} from "@vetta/runtime-core";
import type { AgentFeatureDefinition, AgentProfile, ModelCallContributionContext } from "@vetta/runtime-core/kernel";
import { type CodingToolActivation, selectCodingToolRegistrations } from "@vetta/runtime-tools/coding";
import {
	CodingAgentGreenfieldContextRuntime,
	CodingAgentGreenfieldExtensionEventBridge,
	CodingAgentGreenfieldMemoryController,
	CodingAgentMemoryRolloverOrchestrator,
	type CodingAgentMemoryRolloverRuntime,
	type CodingAgentModelRegistryAdapter,
	type CodingAgentPluginRuntimeSource,
	CodingAgentTodoRuntime,
	createCodingAgentAskUserQuestionRuntimeFeature,
	createCodingAgentGreenfieldProductToolFeature,
	createCodingAgentGreenfieldProductToolRegistrations,
	createCodingAgentMemoryRuntimeFeature,
	createCodingAgentTodoRuntimeFeature,
	createCodingAgentTodoRuntimeToolRegistration,
	createEcosystemHookRuntime,
} from "../adapters/runtime-core/greenfield.js";
import type { CodingAgentGreenfieldConversationContextOverlay } from "../adapters/runtime-core/greenfield-conversation-context-overlay.js";
import type { CodingAgentGreenfieldExtensionToolRuntime } from "../adapters/runtime-core/greenfield-extension-tool-runtime.js";
import type { GreenfieldMcpSessionCoordinator } from "./greenfield-mcp-session-coordinator.js";
import type {
	GreenfieldRuntimeCompositionOptions,
	GreenfieldRuntimeSessionOptions,
} from "./greenfield-runtime-composition-contract.js";
import { GreenfieldSessionExecutionRuntime } from "./greenfield-session-execution-runtime.js";
import { GreenfieldSessionConfigurationState } from "./greenfield-session-peripherals.js";
import type { GreenfieldSessionResourceIndexes } from "./greenfield-session-resource-lifecycle-assembly.js";
import { createGreenfieldSessionResourceLifecycleAssembly } from "./greenfield-session-resource-lifecycle-assembly.js";
import type { GreenfieldSessionConversationResources } from "./greenfield-session-runtime-resources.js";
import {
	createGreenfieldSubagentSessionAssembly,
	type GreenfieldSubagentChildComposition,
	type GreenfieldSubagentChildCompositionRequest,
} from "./greenfield-subagent-session-assembly.js";
import {
	createGreenfieldTurnCapabilitySessionAssembly,
	type GreenfieldTurnCapabilitySessionAssembly,
} from "./greenfield-turn-capability-session-assembly.js";
import type { CodingToolsRuntimeComposition } from "./runtime-tools-composition.js";

export interface GreenfieldSessionInitializationRegistry {
	readonly indexes: GreenfieldSessionResourceIndexes;
	trackContextRuntime(runtime: CodingAgentGreenfieldContextRuntime): void;
	untrackContextRuntime(runtime: CodingAgentGreenfieldContextRuntime): void;
	trackMemoryRuntime(runtime: CodingAgentMemoryRolloverRuntime): void;
	untrackMemoryRuntime(runtime: CodingAgentMemoryRolloverRuntime): void;
	trackTodoRuntime(runtime: CodingAgentTodoRuntime): void;
	untrackTodoRuntime(runtime: CodingAgentTodoRuntime): void;
	trackTurnCapabilityAssembly(assembly: GreenfieldTurnCapabilitySessionAssembly): void;
	untrackTurnCapabilityAssembly(assembly: GreenfieldTurnCapabilitySessionAssembly): void;
	trackHookSessionDisposer(dispose: () => Promise<void>): void;
	untrackHookSessionDisposer(dispose: () => Promise<void>): void;
}

export interface GreenfieldSessionInitializationTransactionOptions<TOwnershipBinding> {
	readonly composition: GreenfieldRuntimeCompositionOptions;
	readonly cwd: string;
	readonly scenario: ConversationScenario;
	readonly activation: CodingToolActivation;
	readonly knowledgeAvailable: boolean;
	readonly backgroundTasksAvailable: boolean;
	readonly codingTools: CodingToolsRuntimeComposition;
	readonly registry: GreenfieldSessionInitializationRegistry;
	readonly mcpCoordinator: GreenfieldMcpSessionCoordinator;
	readonly conversation: GreenfieldSessionConversationResources;
	readonly readConversationModelMessages: (sessionId: string) => Promise<readonly Message[]>;
	readonly conversationContextOverlay: CodingAgentGreenfieldConversationContextOverlay;
	readonly modelAdapter: CodingAgentModelRegistryAdapter;
	readonly extensionToolRuntime?: CodingAgentGreenfieldExtensionToolRuntime;
	readonly acquireOwnership: (sessionId: string) => Promise<TOwnershipBinding | undefined>;
	readonly rebindOwnership: (binding: TOwnershipBinding | undefined, sessionId: string) => Promise<void>;
	readonly releaseOwnership: (binding: TOwnershipBinding | undefined) => Promise<void>;
	readonly resolveActivation: (
		context: ModelCallContributionContext,
		agentMode?: string,
		activeToolNamesOverride?: readonly string[],
	) => CodingToolActivation;
	readonly createChildComposition: (
		request: GreenfieldSubagentChildCompositionRequest,
	) => Promise<GreenfieldSubagentChildComposition>;
}

export interface GreenfieldSessionInitializationTransaction {
	initialize(
		sessionOptions: GreenfieldRuntimeSessionOptions,
		resourceContext: GreenfieldRuntimeResourceContext,
	): Promise<GreenfieldRuntimeResources>;
}

/** 创建单个 Session 的完整对象图，并在提交前统一持有初始化失败回滚责任。 */
export function createGreenfieldSessionInitializationTransaction<TOwnershipBinding>(
	options: GreenfieldSessionInitializationTransactionOptions<TOwnershipBinding>,
): GreenfieldSessionInitializationTransaction {
	return {
		initialize: (sessionOptions, resourceContext) => initializeSession(options, sessionOptions, resourceContext),
	};
}

async function initializeSession<TOwnershipBinding>(
	options: GreenfieldSessionInitializationTransactionOptions<TOwnershipBinding>,
	sessionOptions: GreenfieldRuntimeSessionOptions,
	resourceContext: GreenfieldRuntimeResourceContext,
): Promise<GreenfieldRuntimeResources> {
	const composition = options.composition;
	let activeSessionId = sessionOptions.sessionId;
	let activeOwnership = await options.acquireOwnership(activeSessionId);
	const rollback = new InitializationRollbackScope();
	rollback.defer({
		id: "conversation-ownership",
		rollback: async () => {
			await options.releaseOwnership(activeOwnership);
			activeOwnership = undefined;
		},
	});
	const extensionEvents = new CodingAgentGreenfieldExtensionEventBridge();
	options.registry.indexes.resourceContexts.set(activeSessionId, resourceContext);
	rollback.defer({
		id: "resource-context-binding",
		rollback: () => {
			if (options.registry.indexes.resourceContexts.get(activeSessionId) === resourceContext) {
				options.registry.indexes.resourceContexts.delete(activeSessionId);
			}
		},
	});
	rollback.defer({
		id: "conversation-context-overlay",
		rollback: () => options.conversationContextOverlay.clear(activeSessionId),
	});
	try {
		const sessionCwd = sessionOptions.cwd ?? options.cwd;
		const requestedPluginRuntime = createSessionPluginRuntime(sessionOptions);
		const configuredPluginRuntime = composition.createPluginRuntime?.(sessionOptions);
		if (requestedPluginRuntime && configuredPluginRuntime) {
			throw new Error("Greenfield session plugin capabilities conflict with createPluginRuntime");
		}
		const pluginRuntime = requestedPluginRuntime ?? configuredPluginRuntime;
		const configurationState = new GreenfieldSessionConfigurationState(sessionOptions.agentMode, () =>
			pluginRuntime?.readAgentPlugins(),
		);
		const productToolRegistrations = createCodingAgentGreenfieldProductToolRegistrations({
			cwd: sessionCwd,
			knowledgeRoot: composition.knowledgeRoot,
			knowledgePageWriter: sessionOptions.knowledgePageWriter,
		});
		const productToolFeature = createCodingAgentGreenfieldProductToolFeature({
			registrations: productToolRegistrations,
			resolveActivation: (context) =>
				options.resolveActivation(
					context,
					configurationState.readAgentMode(),
					configurationState.readActiveToolNamesOverride(),
				),
		});
		options.registry.indexes.configurationStates.set(activeSessionId, configurationState);
		rollback.defer({
			id: "configuration-state-binding",
			rollback: () => {
				if (options.registry.indexes.configurationStates.get(activeSessionId) === configurationState) {
					options.registry.indexes.configurationStates.delete(activeSessionId);
				}
			},
		});
		const pluginMcpRuntime = await composition.createPluginMcpRuntime?.({
			cwd: sessionCwd,
			agentDir: composition.agentDir,
			sessionOptions,
		});
		if (pluginMcpRuntime) {
			rollback.defer({
				id: "plugin-mcp-runtime",
				rollback: async () => {
					try {
						await pluginMcpRuntime.dispose();
					} finally {
						if (options.registry.indexes.pluginMcpRuntimes.get(activeSessionId) === pluginMcpRuntime) {
							options.registry.indexes.pluginMcpRuntimes.delete(activeSessionId);
						}
					}
				},
			});
			await pluginMcpRuntime.reconfigure(configurationState.readAgentPlugins());
			options.registry.indexes.pluginMcpRuntimes.set(activeSessionId, pluginMcpRuntime);
		}
		const mcpController = options.mcpCoordinator.createSessionController({
			sessionId: sessionOptions.sessionId,
			activation: options.activation,
			pluginRuntime: pluginMcpRuntime,
		});
		if (mcpController) {
			options.registry.indexes.mcpControllers.set(sessionOptions.sessionId, mcpController);
			rollback.defer({
				id: "mcp-controller-binding",
				rollback: () => {
					if (options.registry.indexes.mcpControllers.get(activeSessionId) === mcpController) {
						options.registry.indexes.mcpControllers.delete(activeSessionId);
					}
				},
			});
		}
		const executionRuntime = new GreenfieldSessionExecutionRuntime({
			cwd: sessionCwd,
			activation: options.activation,
			enableBackgroundTasks: sessionOptions.enableBackgroundTasks,
			initialMode: sessionOptions.executionMode,
			env: sessionOptions.env,
			sandboxHostPath: sessionOptions.sandboxHostPath,
			linuxBubblewrapPath: sessionOptions.linuxBubblewrapPath,
			macosSandboxExecPath: sessionOptions.macosSandboxExecPath,
			readSessionId: () => activeSessionId,
			resolveToolEntry: (toolName) => options.codingTools.registry.resolve(toolName),
			resourceContext,
		});
		options.registry.indexes.executionRuntimes.set(activeSessionId, executionRuntime);
		rollback.defer({
			id: "execution-runtime",
			rollback: async () => {
				try {
					await executionRuntime.dispose();
				} finally {
					if (options.registry.indexes.executionRuntimes.get(activeSessionId) === executionRuntime) {
						options.registry.indexes.executionRuntimes.delete(activeSessionId);
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
			? (composition.createMemoryRolloverRuntime?.(memoryRuntimeOptions, sessionOptions) ??
				new CodingAgentMemoryRolloverOrchestrator(memoryRuntimeOptions))
			: undefined;
		if (memoryRuntime) {
			options.registry.trackMemoryRuntime(memoryRuntime);
			rollback.defer({
				id: "memory-runtime",
				rollback: () => {
					memoryRuntime.dispose();
					options.registry.untrackMemoryRuntime(memoryRuntime);
				},
			});
		}
		const todoRuntime = composition.createTodoRuntime?.(sessionOptions) ?? new CodingAgentTodoRuntime();
		options.registry.trackTodoRuntime(todoRuntime);
		rollback.defer({
			id: "todo-runtime",
			rollback: async () => {
				try {
					await todoRuntime.dispose();
				} finally {
					options.registry.untrackTodoRuntime(todoRuntime);
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
		const todoEnabled = selectCodingToolRegistrations([todoRegistration], options.activation).length > 0;
		const askUserQuestionFeature = sessionOptions.askUserQuestion
			? createCodingAgentAskUserQuestionRuntimeFeature({
					capability: sessionOptions.askUserQuestion,
					scenario: options.scenario,
				})
			: undefined;
		const baseProfile: AgentProfile = mcpController
			? {
					...options.codingTools.profile,
					features: [
						...options.codingTools.profile.features,
						executionRuntime.feature,
						...(sessionOptions.forkContextMessages?.length
							? [createForkContextFeature(sessionOptions.forkContextMessages)]
							: []),
						...(todoEnabled ? [createCodingAgentTodoRuntimeFeature(todoRegistration)] : []),
						...(memoryRuntime ? [createCodingAgentMemoryRuntimeFeature(memoryRuntime.toolRegistration)] : []),
						...(askUserQuestionFeature ? [askUserQuestionFeature] : []),
						mcpController.createFeature({ includePromptInstruction: false }),
					],
				}
			: {
					...options.codingTools.profile,
					features: [
						...options.codingTools.profile.features,
						executionRuntime.feature,
						...(sessionOptions.forkContextMessages?.length
							? [createForkContextFeature(sessionOptions.forkContextMessages)]
							: []),
						...(todoEnabled ? [createCodingAgentTodoRuntimeFeature(todoRegistration)] : []),
						...(memoryRuntime ? [createCodingAgentMemoryRuntimeFeature(memoryRuntime.toolRegistration)] : []),
						...(askUserQuestionFeature ? [askUserQuestionFeature] : []),
					],
				};
		const modelRuntime = new GreenfieldRuntimeModel({
			initialModel: sessionOptions.model ?? composition.initialModel,
			initialThinkingLevel: sessionOptions.thinkingLevel ?? composition.initialThinkingLevel,
			catalog: options.modelAdapter,
			credentials: options.modelAdapter,
		});
		const memoryController = memoryRuntime
			? new CodingAgentGreenfieldMemoryController({
					runtime: memoryRuntime,
					readMessages: () => options.readConversationModelMessages(activeSessionId),
					readModel: () => modelRuntime.readCurrentModel(),
					resolveApiKey: (model) => modelRuntime.resolveApiKey(model),
				})
			: undefined;
		const hookRuntime = createEcosystemHookRuntime({
			host: {
				cwd: sessionCwd,
				getSessionId: () => activeSessionId,
				getTranscriptPath: () => options.conversation.resolveConversationPath(activeSessionId),
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
			additionalAdapterFactories: composition.additionalHookAdapterFactories,
			configLayers: composition.hookConfigLayers,
			maxStopContinuations: composition.maxStopHookContinuations,
		});
		const contextRuntime = new CodingAgentGreenfieldContextRuntime({
			hookRuntime,
			resolveApiKey: (model) => modelRuntime.resolveApiKey(model),
			resolveSettings: composition.resolveCompactionSettings,
			generateCompaction: composition.generateCompaction,
			extensionRuntime: composition.createCompactionExtensionRuntime?.(sessionOptions),
			memoryRollover: memoryRuntime,
			transformAgentContext: (messages) => extensionEvents.transformContext(messages),
		});
		options.registry.trackContextRuntime(contextRuntime);
		rollback.defer({
			id: "context-runtime",
			rollback: () => {
				contextRuntime.dispose();
				options.registry.untrackContextRuntime(contextRuntime);
			},
		});
		const subagentRuntime = createGreenfieldSubagentSessionAssembly({
			enabled: composition.enableSubagents !== false,
			maxConcurrent: composition.subagentMaxConcurrent,
			cwd: sessionCwd,
			scenario: options.scenario,
			readParentSessionId: () => activeSessionId,
			readParentSessionPath: () => options.conversation.resolveConversationPath(activeSessionId),
			readParentMessages: () => options.readConversationModelMessages(activeSessionId),
			readModel: () => modelRuntime.readCurrentModel(),
			readThinkingLevel: () => modelRuntime.readThinkingLevel(),
			readInheritedMcpView: () => options.mcpCoordinator.readInheritedToolView(pluginMcpRuntime),
			createChildComposition: options.createChildComposition,
			hookRuntime,
			resourceContext,
		});
		if (subagentRuntime) {
			rollback.defer({
				id: "subagent-runtime",
				rollback: () => subagentRuntime.dispose(),
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
			conversation: options.conversation,
			ownership: {
				rebind: async (sessionId) => {
					await options.rebindOwnership(activeOwnership, sessionId);
				},
				release: async () => {
					await options.releaseOwnership(activeOwnership);
					activeOwnership = undefined;
				},
			},
			resourceContext,
			indexes: options.registry.indexes,
			hookRuntime,
			extensionEvents,
			extensionToolRuntime: options.extensionToolRuntime,
			conversationContextOverlay: options.conversationContextOverlay,
			modelRuntime,
			contextRuntime,
			memoryRuntime,
			memoryController,
			todoRuntime,
			todoToolRegistration: todoRegistration,
			todoEnabled,
			subagentRuntime,
			executionRuntime,
			configurationState,
			pluginMcpRuntime,
			mcpController,
			codingTools: options.codingTools,
			productToolRegistrations,
			activation: options.activation,
			knowledgeAvailable: options.knowledgeAvailable,
			backgroundTasksAvailable: options.backgroundTasksAvailable,
			askUserQuestion: sessionOptions.askUserQuestion,
			scenario: options.scenario,
			refreshSessionMcp: (sessionId, reportPromptBoundary) =>
				options.mcpCoordinator.refreshSession(sessionId, reportPromptBoundary),
			tracking: {
				trackHookSessionDisposer: (dispose) => options.registry.trackHookSessionDisposer(dispose),
				untrackHookSessionDisposer: (dispose) => options.registry.untrackHookSessionDisposer(dispose),
				untrackContextRuntime: (runtime) => options.registry.untrackContextRuntime(runtime),
				untrackMemoryRuntime: (runtime) => options.registry.untrackMemoryRuntime(runtime),
				untrackTodoRuntime: (runtime) => options.registry.untrackTodoRuntime(runtime),
				untrackTurnCapabilityAssembly: (assembly) => options.registry.untrackTurnCapabilityAssembly(assembly),
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
				scenario: options.scenario,
				agentDir: composition.agentDir,
				includeAgentSkills: sessionOptions.includeAgentSkills,
				systemPromptAddon: sessionOptions.systemPromptAddon,
			},
			activation: {
				resolve: (context) => options.resolveActivation(context, configurationState.readAgentMode()),
				readAgentMode: () => configurationState.readAgentMode(),
				readAgentPlugins: () => configurationState.readAgentPlugins(),
				readActiveToolNamesOverride: () => configurationState.readActiveToolNamesOverride(),
			},
			prompt: {
				systemPromptOptionsResolver:
					composition.createSystemPromptOptionsResolver?.(sessionOptions) ??
					composition.resolveSystemPromptOptions,
				promptResourceResolver:
					composition.createPromptResourceResolver?.(sessionOptions, todoRuntime) ??
					composition.resolvePromptResource,
				resourceSource: composition.promptResourceSource,
				settingsSource: composition.promptSettingsSource,
				systemPromptAdvertisedToolNames: composition.systemPromptAdvertisedToolNames,
			},
			baseProfile,
			codingTools: options.codingTools,
			executionRuntime,
			productToolFeature,
			productToolRegistrations,
			todoRuntime,
			todoToolRegistration: todoEnabled ? todoRegistration : undefined,
			memoryRuntime,
			subagentRuntime,
			contextRuntime,
			conversationContextProjector: options.conversationContextOverlay,
			modelRuntime,
			hookRuntime,
			pluginRuntime,
			pluginMcpRuntime,
			mcpController,
			extensionEvents,
			extensionToolRuntime: options.extensionToolRuntime,
		});
		options.registry.trackTurnCapabilityAssembly(turnCapabilityAssembly);
		rollback.defer({
			id: "capability-composition",
			rollback: async () => {
				try {
					await turnCapabilityAssembly.dispose();
				} finally {
					options.registry.untrackTurnCapabilityAssembly(turnCapabilityAssembly);
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

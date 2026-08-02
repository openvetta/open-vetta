import { ComposedGreenfieldRuntimeFactory, GreenfieldRuntimeSessionBackend } from "@vetta/runtime-core";
import { selectConversationDocumentModelMessages } from "@vetta/runtime-core/conversation";
import type { ModelCallContributionContext } from "@vetta/runtime-core/kernel";
import type { McpRuntimeToolView } from "@vetta/runtime-mcp";
import { FileConversationRepository } from "@vetta/runtime-storage/conversation";
import { CODING_TOOL_SCOPES, type CodingToolActivation } from "@vetta/runtime-tools/coding";
import {
	adaptCodingAgentToolRegistration,
	CODING_AGENT_MODEL_TOOL_ORDER,
	CodingAgentGreenfieldAgentMessageContextProjector,
	CodingAgentModelRegistryAdapter,
} from "../adapters/runtime-core/greenfield.js";
import { CodingAgentGreenfieldConversationContextOverlay } from "../adapters/runtime-core/greenfield-conversation-context-overlay.js";
import { CodingAgentGreenfieldExtensionToolRuntime } from "../adapters/runtime-core/greenfield-extension-tool-runtime.js";
import { createKbFilterByTagsTool } from "../core/tools/kb-filter-by-tags/index.js";
import { createKbListTagsTool } from "../core/tools/kb-list-tags/index.js";
import { ConversationOwnershipBinding } from "./conversation-ownership-binding.js";
import { GreenfieldCompositionResourceRegistry } from "./greenfield-composition-resource-registry.js";
import { createGreenfieldCompositionShutdown } from "./greenfield-composition-shutdown.js";
import {
	createGreenfieldMcpSessionCoordinator,
	type GreenfieldMcpSessionCoordinator,
} from "./greenfield-mcp-session-coordinator.js";
import type {
	GreenfieldRuntimeComposition,
	GreenfieldRuntimeCompositionOptions,
	GreenfieldRuntimeSessionOptions,
} from "./greenfield-runtime-composition-contract.js";

export type {
	GreenfieldCliSessionOptions,
	GreenfieldRuntimeComposition,
	GreenfieldRuntimeCompositionOptions,
	GreenfieldRuntimeSessionHookLifecycle,
	GreenfieldRuntimeSessionOptions,
} from "./greenfield-runtime-composition-contract.js";

import { createGreenfieldSessionInitializationTransaction } from "./greenfield-session-initialization-transaction.js";
import type { GreenfieldSessionValueIndex } from "./greenfield-session-resource-index.js";
import { createCodingToolsRuntimeComposition } from "./runtime-tools-composition.js";

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
	let mcpCoordinator: GreenfieldMcpSessionCoordinator;
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
			await mcpCoordinator.refreshCatalogForModelCall(context.sessionId);
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
	try {
		mcpCoordinator = await createGreenfieldMcpSessionCoordinator({
			source: options.mcpSource,
			indexes: resourceRegistry.indexes,
			registry: {
				register: (tool) =>
					tools.registry.register({
						tool,
						scopeUse: CODING_TOOL_SCOPES,
						category: "external",
					}),
				unregister: (toolName) => tools.registry.unregister(toolName),
			},
		});
	} catch (error) {
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
	const conversation = {
		repository,
		documentStore: repository,
		continuationStore: repository,
		resolveConversationPath: (sessionId: string) => repository.resolveConversationPath(sessionId),
	};
	const sessionInitialization = createGreenfieldSessionInitializationTransaction({
		composition: options,
		cwd,
		scenario,
		activation: effectiveActivation,
		knowledgeAvailable,
		backgroundTasksAvailable,
		codingTools: tools,
		registry: resourceRegistry,
		mcpCoordinator,
		conversation,
		readConversationModelMessages: async (sessionId) =>
			selectConversationDocumentModelMessages(await repository.readDocument(sessionId)),
		conversationContextOverlay,
		modelAdapter,
		extensionToolRuntime,
		acquireOwnership,
		rebindOwnership: async (binding, sessionId) => {
			await binding?.rebind(repository.resolveConversationPath(sessionId));
		},
		releaseOwnership,
		resolveActivation: (context, agentMode, activeToolNamesOverride) =>
			resolveTurnToolActivation(
				effectiveActivation,
				context,
				{ backgroundTasksAvailable, knowledgeAvailable },
				agentMode,
				activeToolNamesOverride,
			),
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
				appendSessionContext: (sessionId, records) => childComposition.appendSessionContext(sessionId, records),
				deliverSessionContext: (sessionId, records) => childComposition.deliverSessionContext(sessionId, records),
				dispose: () => childComposition.dispose(),
			};
		},
	});
	const runtimeFactory = new ComposedGreenfieldRuntimeFactory<GreenfieldRuntimeSessionOptions>({
		streamFn: options.streamFn,
		createResources: (sessionOptions, resourceContext) =>
			sessionInitialization.initialize(sessionOptions, resourceContext),
	});
	const backend = new GreenfieldRuntimeSessionBackend({ runtimeFactory });
	const compositionShutdown = createGreenfieldCompositionShutdown({
		registry: resourceRegistry,
		clearConversationContextOverlay: () => conversationContextOverlay.clearAll(),
		closeConversationRepository: () => repository.close(),
		disposeMcpSynchronizer: mcpCoordinator.sharedRuntimeAvailable ? () => mcpCoordinator.dispose() : undefined,
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

const EMPTY_MCP_TOOL_VIEW: McpRuntimeToolView = Object.freeze({ tools: Object.freeze([]) });

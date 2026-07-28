import {
	CodingAgentGreenfieldPromptAdapter,
	CodingAgentModelRegistryAdapter,
	type CodingAgentModelRegistrySource,
	type CodingAgentPromptResourceResolver,
} from "@vetta/coding-agent/runtime-host/greenfield";
import {
	ComposedGreenfieldRuntimeFactory,
	GreenfieldRuntimeModel,
	GreenfieldRuntimeSessionBackend,
	type SessionConfig,
} from "@vetta/runtime-core";
import { type AgentCoreTurnEngineOptions, RuntimeCapabilityComposition } from "@vetta/runtime-core/kernel";
import { FileConversationRepository } from "@vetta/runtime-storage/conversation";
import { type CodingToolActivation, selectCodingToolRegistrations } from "@vetta/runtime-tools/coding";
import {
	type CodingToolsRuntimeComposition,
	createCodingToolsRuntimeComposition,
} from "./runtime-tools-composition.js";

export interface GreenfieldCliSessionOptions {
	readonly sessionId: string;
	readonly cwd?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
}

export interface GreenfieldRuntimeCompositionOptions {
	readonly conversationDir: string;
	readonly modelRegistry: CodingAgentModelRegistrySource;
	readonly initialModel: NonNullable<SessionConfig["model"]>;
	readonly initialThinkingLevel: NonNullable<SessionConfig["thinkingLevel"]>;
	readonly cwd?: string;
	readonly activation?: CodingToolActivation;
	readonly streamFn?: AgentCoreTurnEngineOptions["streamFn"];
	readonly tokenBudget?: number;
	readonly reservedOutputTokens?: number;
	readonly resolvePromptResource?: CodingAgentPromptResourceResolver;
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
	const tools = createCodingToolsRuntimeComposition({
		cwd,
		activation: options.activation,
		tokenBudget: options.tokenBudget,
		reservedOutputTokens: options.reservedOutputTokens,
	});
	const repository = new FileConversationRepository({ rootDir: options.conversationDir });
	const capabilityCompositions = new Set<RuntimeCapabilityComposition>();
	const modelAdapter = new CodingAgentModelRegistryAdapter(options.modelRegistry);
	const effectiveActivation =
		options.activation ??
		(tools.backgroundService
			? { mode: "scope" as const, scope: "cli", capabilities: new Set(["bg-tasks"]) }
			: { mode: "scope" as const, scope: "cli" });
	const runtimeFactory = new ComposedGreenfieldRuntimeFactory<GreenfieldCliSessionOptions>({
		streamFn: options.streamFn,
		async createResources(sessionOptions) {
			const capabilities = await RuntimeCapabilityComposition.create({
				initialProfile: tools.profile,
				compiler: tools.compiler,
			});
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
						activeToolNames: selectCodingToolRegistrations(
							tools.registry.snapshot().registrations,
							effectiveActivation,
						).map(({ tool }) => tool.name),
					}),
				},
				async dispose() {
					capabilityCompositions.delete(capabilities);
					await capabilities.close();
				},
			};
		},
	});
	const backend = new GreenfieldRuntimeSessionBackend({
		runtimeFactory,
		promptAdapter: new CodingAgentGreenfieldPromptAdapter({
			resolvePromptResource: options.resolvePromptResource,
		}),
	});

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
			await repository.close();
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

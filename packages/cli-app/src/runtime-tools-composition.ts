import { createLegacyCommandToolExecutor } from "@vetta/coding-agent/adapters/runtime-tools/command-executor.js";
import {
	createToolExecutableResolver,
	type EnsureTool,
} from "@vetta/coding-agent/adapters/runtime-tools/executable-resolver.js";
import {
	type AgentFeatureDefinition,
	type AgentProfile,
	type CompiledRuntimeSnapshot,
	FeatureCompiler,
	PassthroughContextStrategy,
	RandomIdGenerator,
} from "@vetta/runtime-core/kernel";
import {
	type CodingToolActivation,
	type CodingToolExecutableResolver,
	type CommandToolExecutor,
	createBashToolRegistration,
	createCodingToolsFeature,
	createCurrentTimeToolRegistration,
	createFindToolRegistration,
	createGlobToolRegistration,
	createGrepToolRegistration,
	createLsToolRegistration,
	createReadToolRegistration,
	createShellToolRegistration,
	InMemoryCodingToolRegistry,
} from "@vetta/runtime-tools/coding";

export interface CodingToolsRuntimeCompositionOptions {
	readonly cwd?: string;
	readonly activation?: CodingToolActivation;
	readonly commandExecutor?: CommandToolExecutor;
	readonly ensureTool?: EnsureTool;
	readonly tokenBudget?: number;
	readonly reservedOutputTokens?: number;
}

export interface CodingToolsRuntimeComposition {
	readonly cwd: string;
	readonly commandExecutor: CommandToolExecutor;
	readonly executableResolver: CodingToolExecutableResolver;
	readonly registry: InMemoryCodingToolRegistry;
	readonly feature: AgentFeatureDefinition;
	readonly profile: AgentProfile;
	readonly compiler: FeatureCompiler;
	readonly compile: (signal?: AbortSignal) => Promise<CompiledRuntimeSnapshot>;
}

export function createCodingToolsRuntimeComposition(
	options: CodingToolsRuntimeCompositionOptions = {},
): CodingToolsRuntimeComposition {
	const cwd = options.cwd ?? process.cwd();
	const commandExecutor = options.commandExecutor ?? createLegacyCommandToolExecutor();
	const executableResolver = createToolExecutableResolver(options.ensureTool);
	const registry = new InMemoryCodingToolRegistry([
		createCurrentTimeToolRegistration(),
		createReadToolRegistration(cwd),
		createBashToolRegistration(cwd, { executor: commandExecutor }),
		createShellToolRegistration(cwd, { executor: commandExecutor }),
		createLsToolRegistration(cwd),
		createGlobToolRegistration(cwd),
		createGrepToolRegistration(cwd, { executableResolver }),
		createFindToolRegistration(cwd, { executableResolver }),
	]);
	const feature = createCodingToolsFeature({
		catalog: registry,
		activation: options.activation ?? { mode: "scope", scope: "cli" },
	});
	const profile: AgentProfile = {
		id: "coding-tools-runtime",
		instructions: [],
		features: [feature],
		contextStrategy: new PassthroughContextStrategy(),
		toolPolicy: {
			async authorize(_request, signal) {
				signal.throwIfAborted();
				return true;
			},
		},
		tokenBudget: options.tokenBudget ?? 8_000,
		reservedOutputTokens: options.reservedOutputTokens ?? 1_000,
	};
	const compiler = new FeatureCompiler({ idGenerator: new RandomIdGenerator() });

	return {
		cwd,
		commandExecutor,
		executableResolver,
		registry,
		feature,
		profile,
		compiler,
		compile: (signal = new AbortController().signal) => compiler.compile(profile, signal),
	};
}

import {
	createCodingAgentBackgroundCommandHost,
	createCodingAgentEditPathPolicy,
	createCodingAgentForegroundCommandHost,
	createCodingAgentWritePathPolicy,
	createToolExecutableResolver,
	type EnsureTool,
} from "@vetta/coding-agent/host";
import {
	type AgentFeatureDefinition,
	type AgentProfile,
	type CompiledRuntimeSnapshot,
	FeatureCompiler,
	PassthroughContextStrategy,
	RandomIdGenerator,
} from "@vetta/runtime-core/kernel";
import {
	type BackgroundCommandService,
	type CodingToolActivation,
	type CodingToolActivationResolver,
	type CodingToolCatalogRefresher,
	type CodingToolExecutableResolver,
	type CodingToolRegistration,
	type CodingToolRegistrationFilter,
	type CommandToolExecutor,
	createBackgroundCommandService,
	createBackgroundCommandToolExecutor,
	createBashToolRegistration,
	createCodingToolsFeature,
	createCurrentTimeToolRegistration,
	createEditToolRegistration,
	createFindToolRegistration,
	createForegroundCommandToolExecutor,
	createGlobToolRegistration,
	createGrepToolRegistration,
	createLsToolRegistration,
	createReadToolRegistration,
	createShellToolRegistration,
	createTaskOutputToolRegistration,
	createTaskStopToolRegistration,
	createTreeToolRegistration,
	createWriteToolRegistration,
	InMemoryCodingToolRegistry,
} from "@vetta/runtime-tools/coding";

export interface CodingToolsRuntimeCompositionOptions {
	readonly cwd?: string;
	readonly activation?: CodingToolActivation;
	readonly resolveActivation?: CodingToolActivationResolver;
	readonly refreshCatalog?: CodingToolCatalogRefresher;
	readonly filterRegistration?: CodingToolRegistrationFilter;
	readonly backgroundService?: BackgroundCommandService;
	readonly commandExecutor?: CommandToolExecutor;
	readonly ensureTool?: EnsureTool;
	readonly additionalRegistrations?: readonly CodingToolRegistration[];
	readonly tokenBudget?: number;
	readonly reservedOutputTokens?: number;
}

export interface CodingToolsRuntimeComposition {
	readonly cwd: string;
	readonly backgroundService?: BackgroundCommandService;
	readonly commandExecutor: CommandToolExecutor;
	readonly executableResolver: CodingToolExecutableResolver;
	readonly registry: InMemoryCodingToolRegistry;
	readonly feature: AgentFeatureDefinition;
	readonly profile: AgentProfile;
	readonly compiler: FeatureCompiler;
	readonly compile: (signal?: AbortSignal) => Promise<CompiledRuntimeSnapshot>;
	readonly dispose: () => void;
}

export function createCodingToolsRuntimeComposition(
	options: CodingToolsRuntimeCompositionOptions = {},
): CodingToolsRuntimeComposition {
	const cwd = options.cwd ?? process.cwd();
	const commandHost = createCodingAgentForegroundCommandHost(cwd);
	const backgroundService =
		options.backgroundService ??
		(options.commandExecutor ? undefined : createBackgroundCommandService(createCodingAgentBackgroundCommandHost()));
	const foregroundExecutor = createForegroundCommandToolExecutor(commandHost);
	const commandExecutor =
		options.commandExecutor ??
		(backgroundService
			? createBackgroundCommandToolExecutor({
					...commandHost,
					foregroundExecutor,
					backgroundService,
				})
			: foregroundExecutor);
	const executableResolver = createToolExecutableResolver(options.ensureTool);
	const registry = new InMemoryCodingToolRegistry([
		createCurrentTimeToolRegistration(),
		createReadToolRegistration(cwd),
		createEditToolRegistration(cwd, { pathPolicy: createCodingAgentEditPathPolicy(cwd) }),
		createBashToolRegistration(cwd, { executor: commandExecutor }),
		createShellToolRegistration(cwd, { executor: commandExecutor }),
		...(backgroundService
			? [
					createTaskOutputToolRegistration({ backgroundService }),
					createTaskStopToolRegistration({ backgroundService }),
				]
			: []),
		createLsToolRegistration(cwd),
		createGlobToolRegistration(cwd),
		createGrepToolRegistration(cwd, { executableResolver }),
		createFindToolRegistration(cwd, { executableResolver }),
		createTreeToolRegistration(cwd, { executableResolver }),
		createWriteToolRegistration(cwd, { pathPolicy: createCodingAgentWritePathPolicy(cwd) }),
		...(options.additionalRegistrations ?? []),
	]);
	const feature = createCodingToolsFeature({
		catalog: registry,
		resolveActivation: options.resolveActivation,
		refreshCatalog: options.refreshCatalog,
		filterRegistration: options.filterRegistration,
		activation:
			options.activation ??
			(backgroundService
				? { mode: "scope", scope: "cli", capabilities: new Set(["bg-tasks"]) }
				: { mode: "scope", scope: "cli" }),
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
		backgroundService,
		commandExecutor,
		executableResolver,
		registry,
		feature,
		profile,
		compiler,
		compile: (signal = new AbortController().signal) => compiler.compile(profile, signal),
		dispose: () => backgroundService?.dispose(),
	};
}

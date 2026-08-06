import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
	type CodingAgentExtensionCompatibilityAssessment,
	type CodingAgentExtensionEventCompatibilityProfile,
	type CodingAgentHostBootstrap,
	type CodingAgentHostBootstrapOptions,
	createCodingAgentHostBootstrap,
	prepareCodingAgentPrintInvocation,
	resolveCodingAgentGreenfieldExtensionCompatibility,
	resolveCodingAgentInitialModel,
	runPrintMode,
} from "@vetta/coding-agent/bootstrap";
import {
	CodingAgentGreenfieldActiveSessionHost,
	createCodingAgentSessionSetupSeedInitializer,
	createGreenfieldRuntimeComposition,
	type GreenfieldCliSessionOptions,
	type GreenfieldRuntimeComposition,
	type GreenfieldRuntimeCompositionOptions,
	resolveGreenfieldSessionIdFromPath,
} from "@vetta/coding-agent/composition";
import { getVettaHomePath } from "@vetta/coding-agent/config";
import type { CodingAgentHtmlExportRuntime } from "@vetta/coding-agent/export-html";
import {
	createCodingAgentMcpRuntimeToolSource,
	createCodingAgentPluginMcpRuntime,
	createHostBashExecutor,
} from "@vetta/coding-agent/host-services";
import {
	GREENFIELD_FULL_RPC_PROFILE,
	GreenfieldRpcBashCapability,
	type RpcRuntimeDecision,
	type RpcSessionCapabilities,
	runRpcModeWithCapabilities,
} from "@vetta/coding-agent/rpc";
import {
	type CodingAgentRuntimeExtensionEventHost,
	createCodingAgentCompactionExtensionRuntime,
	createCodingAgentRuntimeBranchNavigationHost,
	createCodingAgentRuntimeExtensionCommandActions,
	createCodingAgentRuntimeExtensionEventHost,
	createCodingAgentRuntimeResourceReloadHost,
} from "@vetta/coding-agent/runtime";
import { buildDefaultHookConfigLayers } from "@vetta/ecosystem-adapter";
import {
	type GreenfieldRuntimeSession,
	InitializationRollbackScope,
	RetryableCleanup,
	type RuntimeSessionCatalog,
} from "@vetta/runtime-core";
import {
	FileConversationOwnershipManager,
	type FileConversationOwnershipManagerOptions,
} from "@vetta/runtime-storage/conversation";
import { GreenfieldAgentSessionHost } from "../agent-runtime/greenfield-agent-session-host.js";
import { GreenfieldExtensionSessionHost } from "../agent-runtime/greenfield-extension-session-host.js";
import { GreenfieldPrintSessionAdapter } from "../greenfield-print-session-adapter.js";
import {
	type GreenfieldImLegacySessionMigration,
	type GreenfieldImLegacySessionMigrationIncompatible,
	migrateGreenfieldImLegacySession,
} from "./greenfield-im-legacy-session-migration.js";
import { GreenfieldImRpcSessionAdapter } from "./greenfield-im-rpc-session-adapter.js";
import { resolveGreenfieldImSessionPath } from "./greenfield-im-session-selection.js";
import { GreenfieldRpcSessionAdapter } from "./greenfield-rpc-session-adapter.js";
import type {
	GreenfieldRpcFallbackReason,
	GreenfieldRpcRuntimeHostFallback,
} from "./legacy-runtime-fallback-contract.js";

export type {
	GreenfieldRpcFallbackReason,
	GreenfieldRpcRuntimeHostFallback,
} from "./legacy-runtime-fallback-contract.js";

export interface GreenfieldRpcRuntimeHostExtensionIncompatible {
	readonly kind: "extension-incompatible";
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly sessionPath: string | undefined;
	readonly extensionCompatibility: CodingAgentExtensionCompatibilityAssessment;
}

export interface GreenfieldRpcRuntimeHostSessionIncompatible {
	readonly kind: "session-incompatible";
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly sessionPath: string;
	readonly sessionCompatibility: GreenfieldImLegacySessionMigrationIncompatible;
}

export interface GreenfieldRpcRuntimeHostReady {
	readonly kind: "greenfield";
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly session: GreenfieldRuntimeSession;
	readonly runtime: GreenfieldRuntimeComposition;
	readonly capabilities: RpcSessionCapabilities;
	readonly runtimeDecision: RpcRuntimeDecision;
}

export type GreenfieldRpcRuntimeHostPreparation =
	| GreenfieldRpcRuntimeHostExtensionIncompatible
	| GreenfieldRpcRuntimeHostSessionIncompatible
	| GreenfieldRpcRuntimeHostReady;

export interface GreenfieldPrintRuntimeHostReady {
	readonly kind: "greenfield-print";
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly session: GreenfieldRuntimeSession;
	readonly runtime: GreenfieldRuntimeComposition;
	readonly printSession: GreenfieldPrintSessionAdapter;
	readonly runtimeDecision: RpcRuntimeDecision;
}

export type GreenfieldPrintRuntimeHostPreparation =
	| GreenfieldRpcRuntimeHostExtensionIncompatible
	| GreenfieldRpcRuntimeHostSessionIncompatible
	| GreenfieldPrintRuntimeHostReady;

/** @deprecated Use the neutral Greenfield RPC host contracts. */
export type GreenfieldImFallbackReason = GreenfieldRpcFallbackReason;
/** @deprecated Use the neutral Greenfield RPC host contracts. */
export type GreenfieldImRuntimeHostExtensionIncompatible = GreenfieldRpcRuntimeHostExtensionIncompatible;
/** @deprecated Use the neutral Greenfield RPC host contracts. */
export type GreenfieldImRuntimeHostFallback = GreenfieldRpcRuntimeHostFallback;
/** @deprecated Use the neutral Greenfield RPC host contracts. */
export type GreenfieldImRuntimeHostReady = GreenfieldRpcRuntimeHostReady;
/** @deprecated Use the neutral Greenfield RPC host contracts. */
export type GreenfieldImRuntimeHostPreparation = GreenfieldRpcRuntimeHostPreparation;

export interface PrepareGreenfieldImRuntimeHostOptions {
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly conversationDir: string;
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly requestedBackend?: RpcRuntimeDecision["requestedBackend"];
	readonly htmlExporter?: CodingAgentHtmlExportRuntime;
	readonly createSessionId?: () => string;
	readonly ownership?: FileConversationOwnershipManagerOptions;
	readonly createPluginRuntime?: GreenfieldRuntimeCompositionOptions["createPluginRuntime"];
}

export type PrepareGreenfieldRpcRuntimeHostOptions = PrepareGreenfieldImRuntimeHostOptions;

export interface CreateGreenfieldImRuntimeHostOptions
	extends Omit<PrepareGreenfieldImRuntimeHostOptions, "bootstrap">,
		CodingAgentHostBootstrapOptions {}

export const GREENFIELD_IM_EXTENSION_EVENT_PROFILE = {
	input: "supported",
	before_agent_start: "supported",
	resources_discover: "supported",
	session_start: "supported",
	session_shutdown: "supported",
	session_before_switch: "supported",
	session_switch: "supported",
	session_before_fork: "supported",
	session_fork: "supported",
	session_before_tree: "supported",
	session_tree: "supported",
	session_before_compact: "supported",
	session_compact: "supported",
	agent_start: "supported",
	agent_end: "supported",
	turn_start: "supported",
	turn_end: "supported",
	message_start: "supported",
	message_update: "supported",
	message_end: "supported",
	context: "supported",
	tool_call: "supported",
	tool_result: "supported",
	tool_execution_start: "supported",
	tool_execution_update: "supported",
	tool_execution_phase: "supported",
	tool_execution_end: "supported",
	model_select: "supported",
	user_bash: "inapplicable",
} as const satisfies CodingAgentExtensionEventCompatibilityProfile;

/**
 * 构建显式 opt-in 的 Greenfield IM Runtime Host。
 *
 * 返回兼容性结果不会启动 Legacy，也不会处置 Bootstrap；最终后端选择仍由调用方负责。
 */
export async function createGreenfieldImRuntimeHost(
	options: CreateGreenfieldImRuntimeHostOptions,
): Promise<GreenfieldImRuntimeHostPreparation> {
	const bootstrap = await createCodingAgentHostBootstrap(options);
	return prepareGreenfieldImRuntimeHost({ ...options, bootstrap });
}

export async function prepareGreenfieldImRuntimeHost(
	options: PrepareGreenfieldImRuntimeHostOptions,
): Promise<GreenfieldImRuntimeHostPreparation> {
	return prepareGreenfieldRuntimeHost(options, "greenfield-im", "rpc");
}

export async function prepareGreenfieldRpcRuntimeHost(
	options: PrepareGreenfieldRpcRuntimeHostOptions,
): Promise<GreenfieldRpcRuntimeHostPreparation> {
	return prepareGreenfieldRuntimeHost(options, "greenfield", "rpc");
}

export async function prepareGreenfieldPrintRuntimeHost(
	options: PrepareGreenfieldRpcRuntimeHostOptions,
): Promise<GreenfieldPrintRuntimeHostPreparation> {
	return prepareGreenfieldRuntimeHost(options, "greenfield", "print");
}

async function prepareGreenfieldRuntimeHost(
	options: PrepareGreenfieldImRuntimeHostOptions,
	backend: "greenfield-im",
	intent: "rpc",
): Promise<GreenfieldRpcRuntimeHostPreparation>;
async function prepareGreenfieldRuntimeHost(
	options: PrepareGreenfieldImRuntimeHostOptions,
	backend: "greenfield",
	intent: "rpc",
): Promise<GreenfieldRpcRuntimeHostPreparation>;
async function prepareGreenfieldRuntimeHost(
	options: PrepareGreenfieldImRuntimeHostOptions,
	backend: "greenfield",
	intent: "print",
): Promise<GreenfieldPrintRuntimeHostPreparation>;
async function prepareGreenfieldRuntimeHost(
	options: PrepareGreenfieldImRuntimeHostOptions,
	backend: "greenfield" | "greenfield-im",
	intent: "rpc" | "print",
): Promise<GreenfieldRpcRuntimeHostPreparation | GreenfieldPrintRuntimeHostPreparation> {
	const { bootstrap } = options;
	const { parsed } = bootstrap;
	assertGreenfieldInvocation(bootstrap, backend, intent);

	const extensionCompatibility = resolveCodingAgentGreenfieldExtensionCompatibility(bootstrap.extensionCompatibility, {
		actions: true,
		eventProfile: GREENFIELD_IM_EXTENSION_EVENT_PROFILE,
		tools: true,
		commands: true,
		inapplicableRuntimeCapabilities: ["shortcut", "message-renderer"],
	});
	if (extensionCompatibility.requiresLegacyRuntime) {
		return {
			kind: "extension-incompatible",
			bootstrap,
			sessionPath: parsed.session,
			extensionCompatibility,
		};
	}

	let sessionPath = await resolveGreenfieldImSessionPath({
		explicitSessionPath: parsed.session,
		continueSession: parsed.continue === true,
		cwd: bootstrap.cwd,
		sessionDir: options.conversationDir,
		sessionCatalog: options.sessionCatalog,
	});
	let sessionId = resolveSessionId(options.conversationDir, sessionPath, options.createSessionId ?? randomUUID);
	let sessionMigration: RpcRuntimeDecision["sessionMigration"];
	if (!sessionId) {
		if (!sessionPath) throw new Error("Legacy session migration requires a source path");
		const migration = await migrateGreenfieldImLegacySession(sessionPath, options.conversationDir);
		sessionMigration = toRpcSessionMigration(migration);
		if (migration.kind === "session-incompatible") {
			return {
				kind: "session-incompatible",
				bootstrap,
				sessionPath,
				sessionCompatibility: migration,
			};
		}
		sessionPath = migration.targetPath;
		sessionId = migration.targetSessionId;
	}
	const runtimeDecision: RpcRuntimeDecision = {
		requestedBackend: options.requestedBackend ?? backend,
		effectiveBackend: backend,
		...(sessionMigration ? { sessionMigration } : {}),
	};

	const initial = await resolveCodingAgentInitialModel(bootstrap);
	if (initial.warning) console.warn(initial.warning);
	if (initial.error) throw new Error(initial.error);
	if (!initial.model) throw new Error("No models available for Greenfield Runtime");
	if (parsed.apiKey) bootstrap.authStorage.setRuntimeApiKey(initial.model.provider, parsed.apiKey);

	const mcpDebug = bootstrap.settingsManager.getMcpDebug();
	const managedMcpSource = await createCodingAgentMcpRuntimeToolSource({
		projectRoot: bootstrap.cwd,
		agentDir: bootstrap.agentDir,
		debug: mcpDebug,
		enabled: true,
	});
	const rollback = new InitializationRollbackScope();
	const dismissMcpRollback = rollback.defer({
		id: "managed-mcp-source",
		rollback: () => managedMcpSource.dispose(),
	});

	let runtime: GreenfieldRuntimeComposition | undefined;
	let session: GreenfieldRuntimeSession | undefined;
	let extensionEventHost: CodingAgentRuntimeExtensionEventHost | undefined;
	let activeSessionHost: CodingAgentGreenfieldActiveSessionHost | undefined;
	let extensionSessionHost: GreenfieldExtensionSessionHost | undefined;
	let dismissRuntimeRollback: (() => void) | undefined;
	let dismissSessionRollback: (() => void) | undefined;
	let dismissExtensionRollback: (() => void) | undefined;
	let dismissActiveSessionRollback: (() => void) | undefined;
	try {
		runtime = await createGreenfieldRuntimeComposition({
			conversationDir: options.conversationDir,
			modelRegistry: bootstrap.modelRegistry,
			initialModel: initial.model,
			initialThinkingLevel: initial.thinkingLevel,
			cwd: bootstrap.cwd,
			agentDir: bootstrap.agentDir,
			hookConfigLayers: buildDefaultHookConfigLayers({
				cwd: bootstrap.cwd,
				vettaHome: getVettaHomePath(),
			}),
			scenario: backend === "greenfield-im" ? "im-claw" : (parsed.scenario ?? "cli"),
			activation:
				parsed.noTools || parsed.tools
					? { mode: "explicit", toolNames: parsed.tools ?? [] }
					: { mode: "scope", scope: backend === "greenfield-im" ? "im-claw" : (parsed.scenario ?? "cli") },
			enableSubagents: backend !== "greenfield-im" && intent === "rpc",
			systemPromptAdvertisedToolNames:
				backend === "greenfield-im" && !parsed.noTools && !parsed.tools
					? ["kb_filter_by_tags", "kb_list_available_tags"]
					: undefined,
			mcpSource: managedMcpSource.source,
			promptResourceSource: bootstrap.resourceLoader,
			promptSettingsSource: bootstrap.settingsManager,
			resolveCompactionSettings: () => bootstrap.settingsManager.getCompactionSettings(),
			createCompactionExtensionRuntime: () =>
				createCodingAgentCompactionExtensionRuntime(() => extensionSessionHost?.readRunner()),
			createPluginRuntime: options.createPluginRuntime,
			extensionTools: bootstrap.extensionsResult.extensions,
			createPluginMcpRuntime: ({ agentDir }) => createCodingAgentPluginMcpRuntime({ agentDir, debug: mcpDebug }),
			conversationOwnershipManager: new FileConversationOwnershipManager(options.ownership),
		});
		const acquiredRuntime = runtime;
		dismissRuntimeRollback = rollback.defer({
			id: "runtime-composition",
			rollback: () => acquiredRuntime.dispose(),
		});
		const sessionOptions: GreenfieldCliSessionOptions = {
			sessionId,
			cwd: bootstrap.cwd,
			memoryMode: parsed.memoryMode || parsed.memoryFile !== undefined,
			memoryFile: parsed.memoryFile,
		};
		session = sessionPath
			? await runtime.backend.resume(sessionOptions)
			: await runtime.backend.create(sessionOptions);
		const acquiredSession = session;
		dismissSessionRollback = rollback.defer({
			id: "runtime-session",
			rollback: () => acquiredSession.dispose(),
		});
		// Legacy CLI writes bootstrap metadata before AgentSession construction, so its
		// first ecosystem SessionStart is "resume" even for a newly allocated file.
		runtime.sessionHooks.start(session.sessionId, "resume");
		const createExtensionEventHost = (
			targetSession: GreenfieldRuntimeSession,
			bindingOptions?: { readonly replaceExisting?: boolean },
		) => {
			const extensionsResult = bootstrap.resourceLoader.getExtensions();
			return createCodingAgentRuntimeExtensionEventHost({
				extensions: extensionsResult.extensions,
				runtime: extensionsResult.runtime,
				cwd: bootstrap.cwd,
				session: targetSession,
				modelRegistry: bootstrap.modelRegistry,
				resourceLoader: bootstrap.resourceLoader,
				bindEvents: (runner, rebindOptions) =>
					runtime!.bindExtensionRunner(targetSession.sessionId, runner, rebindOptions ?? bindingOptions),
			});
		};
		extensionEventHost = createExtensionEventHost(session);
		const acquiredExtensionEventHost = extensionEventHost;
		const dismissExtensionEventRollback = rollback.defer({
			id: "extension-event-host",
			rollback: () => acquiredExtensionEventHost.dispose(),
		});
		extensionSessionHost = new GreenfieldExtensionSessionHost(extensionEventHost, createExtensionEventHost);
		dismissExtensionEventRollback();
		const acquiredExtensionSessionHost = extensionSessionHost;
		dismissExtensionRollback = rollback.defer({
			id: "extension-session-host",
			rollback: () => acquiredExtensionSessionHost.dispose(),
		});
		activeSessionHost = new CodingAgentGreenfieldActiveSessionHost({
			runtime,
			initialSession: session,
			sessionOptions,
			conversationDir: options.conversationDir,
			sessionCatalog: options.sessionCatalog,
			createSessionId: options.createSessionId ?? randomUUID,
			resolveSessionId: (path) => resolveGreenfieldSessionIdFromPath(options.conversationDir, path),
			lifecycle: {
				before: (transition) => extensionSessionHost!.before(transition),
				prepare: (transition) => extensionSessionHost!.prepare(transition),
				after: (transition) => extensionSessionHost!.after(transition),
			},
		});
		dismissSessionRollback();
		const acquiredActiveSessionHost = activeSessionHost;
		dismissActiveSessionRollback = rollback.defer({
			id: "active-session-host",
			rollback: () => acquiredActiveSessionHost.dispose(),
		});
		const branchNavigationHost = createCodingAgentRuntimeBranchNavigationHost({
			withActiveSession: (operation) => activeSessionHost!.runActiveSessionMutation(operation),
			readRunner: () => extensionSessionHost!.readRunner(),
			settingsManager: bootstrap.settingsManager,
			clearExecutionContext: (targetSessionId) => runtime!.clearSessionExecutionContext(targetSessionId),
		});
		const resourceReloadHost = createCodingAgentRuntimeResourceReloadHost({
			settingsManager: bootstrap.settingsManager,
			resourceLoader: bootstrap.resourceLoader,
			runWithExtensionLifecycle: (operation) =>
				extensionSessionHost!.reload(activeSessionHost!.readSession(), operation),
			afterReload: () => {
				const extensionsResult = bootstrap.resourceLoader.getExtensions();
				for (const [name, value] of bootstrap.parsed.unknownFlags) {
					extensionsResult.runtime.flagValues.set(name, value);
				}
				for (const { name, config } of extensionsResult.runtime.pendingProviderRegistrations) {
					bootstrap.modelRegistry.registerProvider(name, config);
				}
				extensionsResult.runtime.pendingProviderRegistrations = [];
				runtime!.refreshExtensionTools(extensionsResult.extensions);
			},
		});
		const extensionCommandActions = createCodingAgentRuntimeExtensionCommandActions({
			waitForIdle: () => activeSessionHost!.waitForIdle(),
			newSession: (newSessionOptions) => activeSessionHost!.newSession(newSessionOptions),
			createSessionSetupInitializer: createCodingAgentSessionSetupSeedInitializer,
			fork: (entryId) => activeSessionHost!.fork(entryId),
			navigateTree: (targetId, navigateOptions) => branchNavigationHost.navigateTree(targetId, navigateOptions),
			switchSession: (targetPath) => activeSessionHost!.switchSession(targetPath),
			reload: () => activeSessionHost!.runActiveSessionMutation(() => resourceReloadHost.reload()),
		});
		extensionSessionHost.bindCommandContext(extensionCommandActions);
		const agentSessionHost = new GreenfieldAgentSessionHost({
			runtime,
			activeSessionHost,
			extensionSessionHost,
			mcpSource: managedMcpSource,
			readRetrySettings: () => bootstrap.settingsManager.getRetrySettings(),
			setRetryEnabled: (enabled) => bootstrap.settingsManager.setRetryEnabled(enabled),
		});
		dismissActiveSessionRollback();
		dismissRuntimeRollback();
		dismissMcpRollback();
		dismissExtensionRollback();
		const dismissAgentSessionHostRollback = rollback.defer({
			id: "agent-session-host",
			rollback: () => agentSessionHost.dispose(),
		});
		if (intent === "print") {
			const prepared: GreenfieldPrintRuntimeHostReady = {
				kind: "greenfield-print",
				bootstrap,
				get session() {
					return agentSessionHost.readSession();
				},
				runtime,
				printSession: new GreenfieldPrintSessionAdapter({ sessionHost: agentSessionHost }),
				runtimeDecision,
			};
			rollback.commit();
			return prepared;
		}
		const bash = new GreenfieldRpcBashCapability({
			executor: createHostBashExecutor(),
			readContextDeliveryController: () =>
				agentSessionHost.readSession().createCoreAssembly().contextDeliveryController,
			readShellCommandPrefix: () => bootstrap.settingsManager.getShellCommandPrefix(),
		});
		const adapter =
			backend === "greenfield-im"
				? new GreenfieldImRpcSessionAdapter({
						sessionHost: agentSessionHost,
						runtime,
						resourceLoader: bootstrap.resourceLoader,
						runtimeDecision,
						htmlExporter: options.htmlExporter,
						extensionCommandHost: extensionSessionHost,
						disposeSessionResources: false,
					})
				: new GreenfieldRpcSessionAdapter({
						profile: GREENFIELD_FULL_RPC_PROFILE,
						runtimeBackend: "greenfield",
						sessionHost: agentSessionHost,
						runtime,
						resourceLoader: bootstrap.resourceLoader,
						runtimeDecision,
						htmlExporter: options.htmlExporter,
						retryController: agentSessionHost.retryController,
						turnExecutor: agentSessionHost.turnExecutor,
						disposeSessionResources: false,
						bash,
						readAvailableModels: async () =>
							(await bootstrap.modelRegistry.getAvailable()).map((model) => ({
								...model,
								remote: bootstrap.modelRegistry.isRemote(model),
							})),
						extensionCommandHost: extensionSessionHost,
					});
		const dismissAdapterRollback = rollback.defer({ id: "rpc-adapter", rollback: () => adapter.dispose() });
		const capabilities = new GreenfieldRpcRuntimeHostCapabilities(adapter, agentSessionHost);
		dismissAdapterRollback();
		dismissAgentSessionHostRollback();
		rollback.defer({ id: "runtime-capabilities", rollback: () => capabilities.dispose() });
		const prepared: GreenfieldRpcRuntimeHostReady = {
			kind: "greenfield",
			bootstrap,
			get session() {
				return agentSessionHost.readSession();
			},
			runtime,
			capabilities,
			runtimeDecision,
		};
		rollback.commit();
		return prepared;
	} catch (error) {
		return rollback.rollback(error, "Greenfield IM Runtime startup and cleanup failed");
	}
}

export async function runGreenfieldImRuntimeHost(prepared: GreenfieldImRuntimeHostReady): Promise<never> {
	return runRpcModeWithCapabilities(prepared.capabilities, { enableHostBridge: true });
}

export async function runGreenfieldRpcRuntimeHost(prepared: GreenfieldImRuntimeHostReady): Promise<never> {
	return runRpcModeWithCapabilities(prepared.capabilities, {
		enableHostBridge: prepared.bootstrap.parsed.enableHostBridge === true,
	});
}

export async function runGreenfieldPrintRuntimeHost(prepared: GreenfieldPrintRuntimeHostReady): Promise<void> {
	try {
		const invocation = await prepareCodingAgentPrintInvocation({
			parsed: prepared.bootstrap.parsed,
			autoResizeImages: prepared.bootstrap.settingsManager.getImageAutoResize(),
		});
		if (invocation.kind === "interactive-unsupported") {
			throw new Error("交互式终端模式已移除。请使用 --print 进行单次执行，或使用 Vetta 桌面应用。");
		}
		await runPrintMode(prepared.printSession, invocation.options);
	} finally {
		await prepared.printSession.dispose();
	}
}

function assertGreenfieldInvocation(
	bootstrap: CodingAgentHostBootstrap,
	backend: "greenfield" | "greenfield-im",
	intent: "rpc" | "print",
): void {
	const { parsed } = bootstrap;
	if (intent === "rpc" && parsed.mode !== "rpc") throw new Error("Greenfield Runtime requires --mode rpc");
	if (intent === "print" && parsed.mode === "rpc") throw new Error("Greenfield Print does not support RPC mode");
	if (intent === "print" && backend === "greenfield-im")
		throw new Error("Greenfield IM Runtime only supports RPC mode");
	if (backend === "greenfield-im" && !parsed.enableHostBridge) {
		throw new Error("Greenfield IM Runtime requires --enable-host-bridge");
	}
	if (parsed.resume) throw new Error("--resume is no longer supported; use --continue or --session");
	if (backend === "greenfield-im" && parsed.scenario && parsed.scenario !== "im-claw") {
		throw new Error(`Greenfield IM Runtime requires scenario im-claw, received ${parsed.scenario}`);
	}
}

function toRpcSessionMigration(
	migration: GreenfieldImLegacySessionMigration,
): NonNullable<RpcRuntimeDecision["sessionMigration"]> {
	return {
		status: migration.status,
		...(migration.kind === "session-incompatible" ? { errorCode: migration.errorCode } : {}),
		...(migration.kind === "session-incompatible" && migration.issueCode ? { issueCode: migration.issueCode } : {}),
		...(migration.kind === "session-incompatible" && migration.issueCount
			? { issueCount: migration.issueCount }
			: {}),
	};
}

function resolveSessionId(
	conversationDir: string,
	sessionPath: string | undefined,
	createSessionId: () => string,
): string | undefined {
	if (!sessionPath) return createSessionId();
	const sessionId = resolveGreenfieldSessionIdFromPath(conversationDir, sessionPath);
	if (sessionId) return sessionId;
	if (sessionPath.endsWith(".conversation.jsonl")) {
		throw new Error(`Invalid Greenfield conversation path: ${sessionPath}`);
	}
	if (extname(sessionPath) === ".jsonl") return undefined;
	throw new Error(`Unsupported session path: ${sessionPath}`);
}

class GreenfieldRpcRuntimeHostCapabilities implements RpcSessionCapabilities {
	readonly profile;
	readonly turn;
	readonly state;
	readonly model;
	readonly queue;
	readonly context;
	readonly memory;
	readonly retry;
	readonly bash;
	readonly session;
	readonly commands;
	private readonly cleanup = new RetryableCleanup();

	constructor(
		private readonly adapter: GreenfieldRpcSessionAdapter,
		private readonly sessionHost: GreenfieldAgentSessionHost,
	) {
		this.profile = adapter.profile;
		this.turn = adapter.turn;
		this.state = adapter.state;
		this.model = adapter.model;
		this.queue = adapter.queue;
		this.context = adapter.context;
		this.memory = adapter.memory;
		this.retry = adapter.retry;
		this.bash = adapter.bash;
		this.session = adapter.session;
		this.commands = adapter.commands;
		this.cleanup.add({ id: "rpc-adapter", phase: 0, cleanup: () => this.adapter.dispose() });
		this.cleanup.add({ id: "agent-session-host", phase: 1, cleanup: () => this.sessionHost.dispose() });
	}

	async initialize(input: Parameters<RpcSessionCapabilities["initialize"]>[0]): Promise<void> {
		await this.sessionHost.initializeExtensions({
			uiContext: input.uiContext,
			shutdownHandler: input.onShutdownRequested,
			onError: input.onExtensionError,
		});
		await this.adapter.initialize(input);
	}

	subscribe(listener: (event: unknown) => void): () => void {
		const removeAdapter = this.adapter.subscribe(listener);
		const removeRetry = this.sessionHost.subscribeRetryEvents(listener);
		return () => {
			removeRetry();
			removeAdapter();
		};
	}

	async shutdown(): Promise<void> {
		await this.sessionHost.shutdownExtensions();
		await this.adapter.shutdown();
	}

	async dispose(): Promise<void> {
		try {
			await this.cleanup.run("Failed to dispose Greenfield IM Runtime host");
		} catch (error) {
			throw new AggregateError(
				error instanceof AggregateError ? error.errors : [error],
				"Failed to dispose Greenfield IM Runtime host",
			);
		}
	}
}

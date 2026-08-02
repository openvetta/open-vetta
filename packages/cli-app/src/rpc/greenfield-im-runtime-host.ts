import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
	type CodingAgentExtensionCompatibilityAssessment,
	type CodingAgentExtensionEventCompatibilityProfile,
	type CodingAgentHostBootstrap,
	type CodingAgentHostBootstrapOptions,
	createCodingAgentHostBootstrap,
	resolveCodingAgentGreenfieldExtensionCompatibility,
	resolveCodingAgentInitialModel,
} from "@vetta/coding-agent/bootstrap";
import { getVettaHomePath } from "@vetta/coding-agent/config";
import { buildDefaultHookConfigLayers } from "@vetta/coding-agent/hooks";
import {
	type RpcRuntimeDecision,
	type RpcSessionCapabilities,
	runRpcModeWithCapabilities,
} from "@vetta/coding-agent/rpc";
import {
	CodingAgentGreenfieldBranchNavigationHost,
	CodingAgentGreenfieldExtensionEventHost,
	CodingAgentGreenfieldResourceReloadHost,
	type CodingAgentPluginRuntimeSource,
	createCodingAgentCompactionExtensionRuntime,
	createCodingAgentMcpRuntimeToolSource,
	createCodingAgentPluginMcpRuntime,
	type ExtensionCommandContextActions,
} from "@vetta/coding-agent/runtime-host/greenfield";
import {
	type GreenfieldRuntimeSession,
	InitializationRollbackScope,
	RetryableCleanup,
	type RuntimeSessionCatalog,
} from "@vetta/runtime-core";
import type { ManagedMcpRuntimeToolSource } from "@vetta/runtime-mcp";
import {
	FileConversationOwnershipManager,
	type FileConversationOwnershipManagerOptions,
} from "@vetta/runtime-storage/conversation";
import {
	CodingAgentGreenfieldActiveSessionHost,
	createGreenfieldRuntimeComposition,
	type GreenfieldCliSessionOptions,
	type GreenfieldRuntimeComposition,
} from "../greenfield-runtime-composition.js";
import { resolveGreenfieldSessionIdFromPath } from "./greenfield-conversation-path.js";
import { GreenfieldImExtensionSessionHost } from "./greenfield-im-extension-session-host.js";
import {
	type GreenfieldImLegacySessionMigration,
	migrateGreenfieldImLegacySession,
} from "./greenfield-im-legacy-session-migration.js";
import { GreenfieldImRpcSessionAdapter } from "./greenfield-im-rpc-session-adapter.js";
import { resolveGreenfieldImSessionPath } from "./greenfield-im-session-selection.js";

export type GreenfieldImFallbackReason = "legacy-session" | "legacy-extension";

export interface GreenfieldImRuntimeHostFallback {
	readonly kind: "legacy-fallback";
	readonly reason: GreenfieldImFallbackReason;
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly sessionPath: string | undefined;
	readonly extensionCompatibility?: CodingAgentExtensionCompatibilityAssessment;
	readonly sessionMigration?: RpcRuntimeDecision["sessionMigration"];
}

export interface GreenfieldImRuntimeHostReady {
	readonly kind: "greenfield";
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly session: GreenfieldRuntimeSession;
	readonly runtime: GreenfieldRuntimeComposition;
	readonly capabilities: RpcSessionCapabilities;
	readonly runtimeDecision: RpcRuntimeDecision;
}

export type GreenfieldImRuntimeHostPreparation = GreenfieldImRuntimeHostFallback | GreenfieldImRuntimeHostReady;

export interface PrepareGreenfieldImRuntimeHostOptions {
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly conversationDir: string;
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly createSessionId?: () => string;
	readonly ownership?: FileConversationOwnershipManagerOptions;
	readonly createPluginRuntime?: (
		sessionOptions: GreenfieldCliSessionOptions,
	) => CodingAgentPluginRuntimeSource | undefined;
}

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
 * 返回 fallback 不会启动 Legacy，也不会处置 Bootstrap；最终后端选择仍由调用方负责。
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
	const { bootstrap } = options;
	const { parsed } = bootstrap;
	assertGreenfieldImInvocation(bootstrap);

	const extensionCompatibility = resolveCodingAgentGreenfieldExtensionCompatibility(bootstrap.extensionCompatibility, {
		actions: true,
		eventProfile: GREENFIELD_IM_EXTENSION_EVENT_PROFILE,
		tools: true,
		commands: true,
		inapplicableRuntimeCapabilities: ["shortcut", "message-renderer"],
	});
	if (extensionCompatibility.requiresLegacyRuntime) {
		return {
			kind: "legacy-fallback",
			reason: "legacy-extension",
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
		if (migration.kind === "legacy-fallback") {
			return {
				kind: "legacy-fallback",
				reason: "legacy-session",
				bootstrap,
				sessionPath,
				sessionMigration,
			};
		}
		sessionPath = migration.targetPath;
		sessionId = migration.targetSessionId;
	}
	const runtimeDecision: RpcRuntimeDecision = {
		requestedBackend: "greenfield-im",
		effectiveBackend: "greenfield-im",
		...(sessionMigration ? { sessionMigration } : {}),
	};

	const initial = await resolveCodingAgentInitialModel(bootstrap);
	if (initial.warning) console.warn(initial.warning);
	if (initial.error) throw new Error(initial.error);
	if (!initial.model) throw new Error("No models available for Greenfield IM Runtime");
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
	let extensionEventHost: CodingAgentGreenfieldExtensionEventHost | undefined;
	let activeSessionHost: CodingAgentGreenfieldActiveSessionHost | undefined;
	let extensionSessionHost: GreenfieldImExtensionSessionHost | undefined;
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
			scenario: "im-claw",
			activation:
				parsed.noTools || parsed.tools
					? { mode: "explicit", toolNames: parsed.tools ?? [] }
					: { mode: "scope", scope: "im-claw" },
			enableSubagents: false,
			systemPromptAdvertisedToolNames:
				parsed.noTools || parsed.tools ? undefined : ["kb_filter_by_tags", "kb_list_available_tags"],
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
			return new CodingAgentGreenfieldExtensionEventHost({
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
		extensionSessionHost = new GreenfieldImExtensionSessionHost(extensionEventHost, createExtensionEventHost);
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
		const branchNavigationHost = new CodingAgentGreenfieldBranchNavigationHost({
			withActiveSession: (operation) => activeSessionHost!.runActiveSessionMutation(operation),
			readRunner: () => extensionSessionHost!.readRunner(),
			settingsManager: bootstrap.settingsManager,
			clearExecutionContext: (targetSessionId) => runtime!.clearSessionExecutionContext(targetSessionId),
		});
		const resourceReloadHost = new CodingAgentGreenfieldResourceReloadHost({
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
		const extensionCommandActions: ExtensionCommandContextActions = {
			waitForIdle: () => activeSessionHost!.waitForIdle(),
			newSession: (newSessionOptions) => activeSessionHost!.newSession(newSessionOptions),
			fork: async (entryId) => {
				const result = await activeSessionHost!.fork(entryId);
				return { cancelled: result.cancelled };
			},
			navigateTree: (targetId, navigateOptions) => branchNavigationHost.navigateTree(targetId, navigateOptions),
			switchSession: (targetPath) => activeSessionHost!.switchSession(targetPath),
			reload: () => activeSessionHost!.runActiveSessionMutation(() => resourceReloadHost.reload()),
		};
		extensionSessionHost.bindCommandContext(extensionCommandActions);
		const adapter = new GreenfieldImRpcSessionAdapter({
			sessionHost: activeSessionHost,
			runtime,
			resourceLoader: bootstrap.resourceLoader,
			runtimeDecision,
			extensionCommandHost: extensionSessionHost,
		});
		dismissActiveSessionRollback();
		dismissRuntimeRollback();
		const dismissAdapterRollback = rollback.defer({ id: "rpc-adapter", rollback: () => adapter.dispose() });
		const capabilities = new GreenfieldImRuntimeHostCapabilities(adapter, managedMcpSource, extensionSessionHost);
		dismissAdapterRollback();
		dismissMcpRollback();
		dismissExtensionRollback();
		rollback.defer({ id: "runtime-capabilities", rollback: () => capabilities.dispose() });
		rollback.commit();
		return {
			kind: "greenfield",
			bootstrap,
			get session() {
				return activeSessionHost!.readSession();
			},
			runtime,
			capabilities,
			runtimeDecision,
		};
	} catch (error) {
		return rollback.rollback(error, "Greenfield IM Runtime startup and cleanup failed");
	}
}

export async function runGreenfieldImRuntimeHost(prepared: GreenfieldImRuntimeHostReady): Promise<never> {
	return runRpcModeWithCapabilities(prepared.capabilities, { enableHostBridge: true });
}

function assertGreenfieldImInvocation(bootstrap: CodingAgentHostBootstrap): void {
	const { parsed } = bootstrap;
	if (parsed.mode !== "rpc") throw new Error("Greenfield IM Runtime requires --mode rpc");
	if (!parsed.enableHostBridge) throw new Error("Greenfield IM Runtime requires --enable-host-bridge");
	if (parsed.resume) throw new Error("--resume is no longer supported; use --continue or --session");
	if (parsed.scenario && parsed.scenario !== "im-claw") {
		throw new Error(`Greenfield IM Runtime requires scenario im-claw, received ${parsed.scenario}`);
	}
}

function toRpcSessionMigration(
	migration: GreenfieldImLegacySessionMigration,
): NonNullable<RpcRuntimeDecision["sessionMigration"]> {
	return {
		status: migration.status,
		...(migration.kind === "legacy-fallback" && migration.errorCode ? { errorCode: migration.errorCode } : {}),
		...(migration.kind === "legacy-fallback" && migration.issueCode ? { issueCode: migration.issueCode } : {}),
		...(migration.kind === "legacy-fallback" && migration.issueCount ? { issueCount: migration.issueCount } : {}),
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

class GreenfieldImRuntimeHostCapabilities implements RpcSessionCapabilities {
	readonly profile;
	readonly turn;
	readonly state;
	readonly memory;
	readonly session;
	readonly commands;
	private readonly cleanup = new RetryableCleanup();

	constructor(
		private readonly adapter: GreenfieldImRpcSessionAdapter,
		private readonly mcpSource: ManagedMcpRuntimeToolSource,
		private readonly extensionSessionHost: GreenfieldImExtensionSessionHost,
	) {
		this.profile = adapter.profile;
		this.turn = adapter.turn;
		this.state = adapter.state;
		this.memory = adapter.memory;
		this.session = adapter.session;
		this.commands = adapter.commands;
		this.cleanup.add({
			id: "extension-session-host",
			phase: 0,
			cleanup: () => this.extensionSessionHost.dispose(),
		});
		this.cleanup.add({ id: "rpc-adapter", phase: 1, cleanup: () => this.adapter.dispose() });
		this.cleanup.add({ id: "mcp-source", phase: 1, cleanup: () => this.mcpSource.dispose() });
	}

	async initialize(input: Parameters<RpcSessionCapabilities["initialize"]>[0]): Promise<void> {
		await this.extensionSessionHost.initialize(input);
		await this.adapter.initialize(input);
	}

	subscribe(listener: (event: unknown) => void): () => void {
		return this.adapter.subscribe(listener);
	}

	async shutdown(): Promise<void> {
		await this.extensionSessionHost.shutdown();
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

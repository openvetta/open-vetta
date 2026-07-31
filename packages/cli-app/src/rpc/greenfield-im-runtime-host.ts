import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
	CODING_AGENT_GREENFIELD_EXTENSION_EVENTS,
	type CodingAgentExtensionCompatibilityAssessment,
	type CodingAgentHostBootstrap,
	type CodingAgentHostBootstrapOptions,
	createCodingAgentHostBootstrap,
	resolveCodingAgentGreenfieldExtensionCompatibility,
	resolveCodingAgentInitialModel,
} from "@vetta/coding-agent/bootstrap";
import {
	type RpcSessionCapabilities,
	type RpcSessionInitialization,
	runRpcModeWithCapabilities,
} from "@vetta/coding-agent/rpc";
import {
	CodingAgentGreenfieldExtensionEventHost,
	type CodingAgentPluginRuntimeSource,
	createCodingAgentMcpRuntimeToolSource,
	createCodingAgentPluginMcpRuntime,
} from "@vetta/coding-agent/runtime-host/greenfield";
import type { GreenfieldRuntimeSession, RuntimeSessionCatalog } from "@vetta/runtime-core";
import type { ManagedMcpRuntimeToolSource } from "@vetta/runtime-mcp";
import {
	FileConversationOwnershipManager,
	type FileConversationOwnershipManagerOptions,
} from "@vetta/runtime-storage/conversation";
import {
	CodingAgentGreenfieldActiveSessionHost,
	type CodingAgentGreenfieldPreparedSessionBinding,
	type CodingAgentGreenfieldSessionTransition,
	createGreenfieldRuntimeComposition,
	type GreenfieldCliSessionOptions,
	type GreenfieldRuntimeComposition,
} from "../greenfield-runtime-composition.js";
import { resolveGreenfieldSessionIdFromPath } from "./greenfield-conversation-path.js";
import { GreenfieldImRpcSessionAdapter } from "./greenfield-im-rpc-session-adapter.js";
import { resolveGreenfieldImSessionPath } from "./greenfield-im-session-selection.js";

export type GreenfieldImFallbackReason = "legacy-session" | "legacy-extension" | "unsupported-session-selection";

export interface GreenfieldImRuntimeHostFallback {
	readonly kind: "legacy-fallback";
	readonly reason: GreenfieldImFallbackReason;
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly sessionPath: string | undefined;
	readonly extensionCompatibility?: CodingAgentExtensionCompatibilityAssessment;
}

export interface GreenfieldImRuntimeHostReady {
	readonly kind: "greenfield";
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly session: GreenfieldRuntimeSession;
	readonly runtime: GreenfieldRuntimeComposition;
	readonly capabilities: RpcSessionCapabilities;
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

	if (parsed.resume) {
		return {
			kind: "legacy-fallback",
			reason: "unsupported-session-selection",
			bootstrap,
			sessionPath: parsed.session,
		};
	}
	const extensionCompatibility = resolveCodingAgentGreenfieldExtensionCompatibility(bootstrap.extensionCompatibility, {
		actions: true,
		events: CODING_AGENT_GREENFIELD_EXTENSION_EVENTS,
		tools: true,
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

	const sessionPath = await resolveGreenfieldImSessionPath({
		explicitSessionPath: parsed.session,
		continueSession: parsed.continue === true,
		cwd: bootstrap.cwd,
		sessionDir: options.conversationDir,
		sessionCatalog: options.sessionCatalog,
	});
	const sessionId = resolveSessionId(options.conversationDir, sessionPath, options.createSessionId ?? randomUUID);
	if (!sessionId) {
		return {
			kind: "legacy-fallback",
			reason: "legacy-session",
			bootstrap,
			sessionPath,
		};
	}

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

	let runtime: GreenfieldRuntimeComposition | undefined;
	let session: GreenfieldRuntimeSession | undefined;
	let extensionEventHost: CodingAgentGreenfieldExtensionEventHost | undefined;
	let activeSessionHost: CodingAgentGreenfieldActiveSessionHost | undefined;
	let extensionSessionHost: GreenfieldImExtensionSessionHost | undefined;
	try {
		runtime = await createGreenfieldRuntimeComposition({
			conversationDir: options.conversationDir,
			modelRegistry: bootstrap.modelRegistry,
			initialModel: initial.model,
			initialThinkingLevel: initial.thinkingLevel,
			cwd: bootstrap.cwd,
			agentDir: bootstrap.agentDir,
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
			createPluginRuntime: options.createPluginRuntime,
			extensionTools: bootstrap.extensionsResult.extensions,
			createPluginMcpRuntime: ({ agentDir }) => createCodingAgentPluginMcpRuntime({ agentDir, debug: mcpDebug }),
			conversationOwnershipManager: new FileConversationOwnershipManager(options.ownership),
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
		const createExtensionEventHost = (targetSession: GreenfieldRuntimeSession) =>
			new CodingAgentGreenfieldExtensionEventHost({
				extensions: bootstrap.extensionsResult.extensions,
				runtime: bootstrap.extensionsResult.runtime,
				cwd: bootstrap.cwd,
				session: targetSession,
				modelRegistry: bootstrap.modelRegistry,
				resourceLoader: bootstrap.resourceLoader,
				bindEvents: (runner) => runtime!.bindExtensionRunner(targetSession.sessionId, runner),
			});
		extensionEventHost = createExtensionEventHost(session);
		extensionSessionHost = new GreenfieldImExtensionSessionHost(extensionEventHost, createExtensionEventHost);
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
		const adapter = new GreenfieldImRpcSessionAdapter({
			sessionHost: activeSessionHost,
			runtime,
			resourceLoader: bootstrap.resourceLoader,
		});
		const capabilities = new GreenfieldImRuntimeHostCapabilities(adapter, managedMcpSource, extensionSessionHost);
		return {
			kind: "greenfield",
			bootstrap,
			get session() {
				return activeSessionHost!.readSession();
			},
			runtime,
			capabilities,
		};
	} catch (error) {
		const extensionCleanup = extensionSessionHost
			? await Promise.allSettled([extensionSessionHost.dispose()])
			: extensionEventHost
				? await Promise.allSettled([extensionEventHost.dispose()])
				: [];
		const cleanup = [
			...extensionCleanup,
			...(await Promise.allSettled([
				...(activeSessionHost ? [activeSessionHost.dispose()] : session ? [session.dispose()] : []),
				...(runtime ? [runtime.dispose()] : []),
				managedMcpSource.dispose(),
			])),
		];
		const cleanupErrors = cleanup
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map(({ reason }) => reason);
		if (cleanupErrors.length > 0) {
			throw new AggregateError([error, ...cleanupErrors], "Greenfield IM Runtime startup and cleanup failed");
		}
		throw error;
	}
}

export async function runGreenfieldImRuntimeHost(prepared: GreenfieldImRuntimeHostReady): Promise<never> {
	return runRpcModeWithCapabilities(prepared.capabilities, { enableHostBridge: true });
}

function assertGreenfieldImInvocation(bootstrap: CodingAgentHostBootstrap): void {
	const { parsed } = bootstrap;
	if (parsed.mode !== "rpc") throw new Error("Greenfield IM Runtime requires --mode rpc");
	if (!parsed.enableHostBridge) throw new Error("Greenfield IM Runtime requires --enable-host-bridge");
	if (parsed.scenario && parsed.scenario !== "im-claw") {
		throw new Error(`Greenfield IM Runtime requires scenario im-claw, received ${parsed.scenario}`);
	}
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
	private disposed = false;

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
		if (this.disposed) return;
		this.disposed = true;
		const extensionResults = await Promise.allSettled([this.extensionSessionHost.dispose()]);
		const results = [
			...extensionResults,
			...(await Promise.allSettled([this.adapter.dispose(), this.mcpSource.dispose()])),
		];
		const errors = results
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map(({ reason }) => reason);
		if (errors.length > 0) {
			throw new AggregateError(errors, "Failed to dispose Greenfield IM Runtime host");
		}
	}
}

type GreenfieldImExtensionEventHostFactory = (
	session: GreenfieldRuntimeSession,
) => CodingAgentGreenfieldExtensionEventHost;

class GreenfieldImExtensionSessionHost {
	private initialization: RpcSessionInitialization | undefined;
	private disposed = false;

	constructor(
		private current: CodingAgentGreenfieldExtensionEventHost,
		private readonly createHost: GreenfieldImExtensionEventHostFactory,
	) {}

	async initialize(input: RpcSessionInitialization): Promise<void> {
		this.initialization = input;
		await this.current.initialize({
			uiContext: input.uiContext,
			shutdownHandler: input.onShutdownRequested,
			onError: input.onExtensionError,
		});
	}

	async before(
		transition: CodingAgentGreenfieldSessionTransition,
	): Promise<{ readonly cancelled: boolean } | undefined> {
		if (transition.kind === "fork") {
			if (!transition.entryId || !this.current.runner.hasHandlers("session_before_fork")) return undefined;
			const result = await this.current.runner.emit({
				type: "session_before_fork",
				entryId: transition.entryId,
			});
			return { cancelled: result?.cancel === true };
		}
		if (!this.current.runner.hasHandlers("session_before_switch")) return undefined;
		const result = await this.current.runner.emit({
			type: "session_before_switch",
			reason: transition.kind,
			...(transition.targetSessionPath ? { targetSessionFile: transition.targetSessionPath } : {}),
		});
		return { cancelled: result?.cancel === true };
	}

	async prepare(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
	): Promise<CodingAgentGreenfieldPreparedSessionBinding> {
		const previous = this.current;
		const next = this.createHost(transition.next);
		try {
			if (this.initialization) {
				await next.initialize(
					{
						uiContext: this.initialization.uiContext,
						shutdownHandler: this.initialization.onShutdownRequested,
						onError: this.initialization.onExtensionError,
					},
					{ emitSessionStart: false },
				);
			}
		} catch (error) {
			previous.rebindRuntimeActions();
			await next.dispose({ emitSessionShutdown: false });
			throw error;
		}
		return {
			commit: async () => {
				this.current = next;
			},
			rollback: async () => {
				this.current = previous;
				previous.rebindRuntimeActions();
				await next.dispose({ emitSessionShutdown: false });
			},
			finalize: () => previous.dispose({ emitSessionShutdown: false }),
		};
	}

	async after(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
	): Promise<void> {
		if (transition.kind === "fork") {
			await this.current.runner.emit({
				type: "session_fork",
				previousSessionFile: transition.previousSessionPath,
			});
			return;
		}
		await this.current.runner.emit({
			type: "session_switch",
			reason: transition.kind,
			previousSessionFile: transition.previousSessionPath,
		});
	}

	shutdown(): Promise<void> {
		return this.current.shutdown();
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		await this.current.dispose();
	}
}

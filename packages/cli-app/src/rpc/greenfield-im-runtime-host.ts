import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
	type CodingAgentHostBootstrap,
	type CodingAgentHostBootstrapOptions,
	createCodingAgentHostBootstrap,
	type RpcSessionCapabilities,
	resolveCodingAgentInitialModel,
	runRpcModeWithCapabilities,
} from "@vetta/coding-agent";
import {
	type CodingAgentPluginRuntimeSource,
	createCodingAgentMcpRuntimeToolSource,
} from "@vetta/coding-agent/runtime-host/greenfield";
import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import type { ManagedMcpRuntimeToolSource } from "@vetta/runtime-mcp";
import {
	FileConversationOwnershipManager,
	type FileConversationOwnershipManagerOptions,
} from "@vetta/runtime-storage/conversation";
import {
	createGreenfieldRuntimeComposition,
	type GreenfieldCliSessionOptions,
	type GreenfieldRuntimeComposition,
} from "../greenfield-runtime-composition.js";
import { resolveGreenfieldSessionIdFromPath } from "./greenfield-conversation-path.js";
import { GreenfieldImRpcSessionAdapter } from "./greenfield-im-rpc-session-adapter.js";

export type GreenfieldImFallbackReason = "legacy-session" | "legacy-extension" | "unsupported-session-selection";

export interface GreenfieldImRuntimeHostFallback {
	readonly kind: "legacy-fallback";
	readonly reason: GreenfieldImFallbackReason;
	readonly bootstrap: CodingAgentHostBootstrap;
	readonly sessionPath: string | undefined;
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

	if (parsed.continue || parsed.resume) {
		return {
			kind: "legacy-fallback",
			reason: "unsupported-session-selection",
			bootstrap,
			sessionPath: parsed.session,
		};
	}
	if (bootstrap.extensionsResult.extensions.length > 0) {
		return {
			kind: "legacy-fallback",
			reason: "legacy-extension",
			bootstrap,
			sessionPath: parsed.session,
		};
	}

	const sessionId = resolveSessionId(options.conversationDir, parsed.session, options.createSessionId ?? randomUUID);
	if (!sessionId) {
		return {
			kind: "legacy-fallback",
			reason: "legacy-session",
			bootstrap,
			sessionPath: parsed.session,
		};
	}

	const initial = await resolveCodingAgentInitialModel(bootstrap);
	if (initial.warning) console.warn(initial.warning);
	if (initial.error) throw new Error(initial.error);
	if (!initial.model) throw new Error("No models available for Greenfield IM Runtime");
	if (parsed.apiKey) bootstrap.authStorage.setRuntimeApiKey(initial.model.provider, parsed.apiKey);

	const managedMcpSource = await createCodingAgentMcpRuntimeToolSource({
		projectRoot: bootstrap.cwd,
		agentDir: bootstrap.agentDir,
		debug: bootstrap.settingsManager.getMcpDebug(),
		enabled: true,
	});

	let runtime: GreenfieldRuntimeComposition | undefined;
	let session: GreenfieldRuntimeSession | undefined;
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
			mcpSource: managedMcpSource.source,
			promptResourceSource: bootstrap.resourceLoader,
			promptSettingsSource: bootstrap.settingsManager,
			createPluginRuntime: options.createPluginRuntime,
			conversationOwnershipManager: new FileConversationOwnershipManager(options.ownership),
		});
		const sessionOptions: GreenfieldCliSessionOptions = {
			sessionId,
			cwd: bootstrap.cwd,
			memoryMode: parsed.memoryMode || parsed.memoryFile !== undefined,
			memoryFile: parsed.memoryFile,
		};
		session = parsed.session
			? await runtime.backend.resume(sessionOptions)
			: await runtime.backend.create(sessionOptions);
		const adapter = new GreenfieldImRpcSessionAdapter({ session, runtime });
		const capabilities = new GreenfieldImRuntimeHostCapabilities(adapter, managedMcpSource);
		return { kind: "greenfield", bootstrap, session, runtime, capabilities };
	} catch (error) {
		const cleanup = await Promise.allSettled([
			...(session ? [session.dispose()] : []),
			...(runtime ? [runtime.dispose()] : []),
			managedMcpSource.dispose(),
		]);
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
	private disposed = false;

	constructor(
		private readonly adapter: GreenfieldImRpcSessionAdapter,
		private readonly mcpSource: ManagedMcpRuntimeToolSource,
	) {
		this.profile = adapter.profile;
		this.turn = adapter.turn;
		this.state = adapter.state;
		this.memory = adapter.memory;
	}

	initialize(input: Parameters<RpcSessionCapabilities["initialize"]>[0]): Promise<void> {
		return this.adapter.initialize(input);
	}

	subscribe(listener: (event: unknown) => void): () => void {
		return this.adapter.subscribe(listener);
	}

	shutdown(): Promise<void> {
		return this.adapter.shutdown();
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const results = await Promise.allSettled([this.adapter.dispose(), this.mcpSource.dispose()]);
		const errors = results
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map(({ reason }) => reason);
		if (errors.length > 0) {
			throw new AggregateError(errors, "Failed to dispose Greenfield IM Runtime host");
		}
	}
}

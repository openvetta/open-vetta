import { type GreenfieldRuntimeSession, InitializationRollbackScope, RetryableCleanup } from "@vetta/runtime-core";
import { CodingAgentGreenfieldSessionCapabilityHost } from "../adapters/runtime-core/greenfield-session-capability-host.js";
import type {
	GreenfieldSdkSession,
	GreenfieldSdkSessionCapabilityPort,
	GreenfieldSdkSessionRuntimePort,
} from "../public-api/sdk/index.js";
import { bindGreenfieldSdkSessionRuntime, GreenfieldSdkSessionAdapter } from "../public-api/sdk/index.js";
import { createGreenfieldRuntimeComposition } from "./greenfield-runtime-composition.js";
import type {
	GreenfieldRuntimeComposition,
	GreenfieldRuntimeCompositionOptions,
	GreenfieldRuntimeSessionOptions,
} from "./greenfield-runtime-composition-contract.js";
import {
	type GreenfieldSdkSessionStorageTarget,
	type ResolvedGreenfieldSdkSessionStorage,
	resolveGreenfieldSdkSessionStorage,
} from "./greenfield-sdk-session-storage.js";

type GreenfieldSdkCompositionOptions = Omit<
	GreenfieldRuntimeCompositionOptions,
	"conversationDir" | "createConversationPersistence"
>;

type GreenfieldSdkRuntimeSessionOptions = Omit<GreenfieldRuntimeSessionOptions, "sessionId">;

export interface GreenfieldSdkSessionFactoryOptions {
	readonly storage: GreenfieldSdkSessionStorageTarget;
	readonly composition: GreenfieldSdkCompositionOptions;
	readonly session?: GreenfieldSdkRuntimeSessionOptions;
	/** Composition 创建前已由产品宿主取得、并随 SDK Session 释放的资源。 */
	readonly ownedResources?: readonly GreenfieldSdkOwnedResource[];
	/** Runtime Session 创建后绑定 Extension 等 Session 级产品资源。 */
	readonly initializeSession?: GreenfieldSdkSessionInitializer;
	/** 将产品设置、模型范围和重试控制接入固定 Session 能力宿主。 */
	readonly createCapabilityHost?: GreenfieldSdkSessionCapabilityHostFactory;
}

export interface GreenfieldSdkOwnedResource {
	readonly id: string;
	dispose(): void | Promise<void>;
}

export interface GreenfieldSdkSessionInitializationContext {
	readonly session: GreenfieldRuntimeSession;
	readonly composition: GreenfieldRuntimeComposition;
}

export type GreenfieldSdkSessionInitializer = (
	context: GreenfieldSdkSessionInitializationContext,
) => Promise<GreenfieldSdkOwnedResource | undefined>;

export type GreenfieldSdkSessionCapabilityHostFactory = (
	context: GreenfieldSdkSessionInitializationContext,
) => GreenfieldSdkSessionCapabilityPort;

export interface GreenfieldSdkSessionFactoryResult {
	readonly session: GreenfieldSdkSession;
}

/**
 * Greenfield SDK 的内部 Composition Root。
 *
 * 公开 createAgentSession 尚未切换到这里；本工厂只接受已经完成产品资源解析的中立
 * Composition 参数，并显式处理存储目标、create/resume 路由与失败回滚。
 */
export async function createGreenfieldSdkSession(
	options: GreenfieldSdkSessionFactoryOptions,
): Promise<GreenfieldSdkSessionFactoryResult> {
	const rollback = new InitializationRollbackScope();
	for (const resource of options.ownedResources ?? []) {
		rollback.defer({ id: resource.id, rollback: () => resource.dispose() });
	}
	let storage: ResolvedGreenfieldSdkSessionStorage;
	try {
		storage = resolveGreenfieldSdkSessionStorage(options.storage);
	} catch (error) {
		return rollback.rollback(error, "Greenfield SDK storage resolution and rollback failed");
	}
	let composition: GreenfieldRuntimeComposition;
	try {
		composition = await createGreenfieldRuntimeComposition({
			...options.composition,
			conversationDir: storage.conversationDir ?? "memory://conversation",
			createConversationPersistence: storage.createConversationPersistence,
		});
	} catch (error) {
		return rollback.rollback(error, "Greenfield SDK composition initialization failed");
	}
	rollback.defer({ id: "runtime-composition", rollback: () => composition.dispose() });

	try {
		const sessionOptions = { ...options.session, sessionId: storage.sessionId };
		const runtimeSession = await composition.backend[storage.operation](sessionOptions);
		rollback.defer({ id: "runtime-session", rollback: () => runtimeSession.dispose() });
		const initializedResource = await options.initializeSession?.({ session: runtimeSession, composition });
		if (initializedResource) {
			rollback.defer({ id: initializedResource.id, rollback: () => initializedResource.dispose() });
		}
		const capabilityHost =
			options.createCapabilityHost?.({ session: runtimeSession, composition }) ??
			new CodingAgentGreenfieldSessionCapabilityHost({ readSession: () => runtimeSession });
		const runtime = bindCompositionOwnedRuntime(
			bindGreenfieldSdkSessionRuntime(runtimeSession, capabilityHost),
			composition,
			options.ownedResources ?? [],
			initializedResource,
		);
		const session = new GreenfieldSdkSessionAdapter(runtime);
		rollback.commit();
		return { session };
	} catch (error) {
		return rollback.rollback(error, "Greenfield SDK session initialization and rollback failed");
	}
}

function bindCompositionOwnedRuntime(
	runtime: GreenfieldSdkSessionRuntimePort,
	composition: GreenfieldRuntimeComposition,
	ownedResources: readonly GreenfieldSdkOwnedResource[],
	initializedResource: GreenfieldSdkOwnedResource | undefined,
): GreenfieldSdkSessionRuntimePort {
	const cleanup = new RetryableCleanup();
	if (initializedResource) {
		cleanup.add({ id: initializedResource.id, phase: 0, cleanup: () => initializedResource.dispose() });
	}
	cleanup.add({ id: "session-capability-host", phase: 0, cleanup: () => runtime.capabilities.abortRetry() });
	cleanup.add({ id: "runtime-session", phase: 1, cleanup: () => runtime.dispose() });
	cleanup.add({ id: "runtime-composition", phase: 2, cleanup: () => composition.dispose() });
	for (const resource of ownedResources) {
		cleanup.add({ id: resource.id, phase: 3, cleanup: () => resource.dispose() });
	}
	return {
		capabilities: runtime.capabilities,
		get sessionId() {
			return runtime.sessionId;
		},
		get sessionPath() {
			return runtime.sessionPath;
		},
		prompt: (request) => runtime.prompt(request),
		abort: (reason) => runtime.abort(reason),
		readState: () => runtime.readState(),
		readMessages: () => runtime.readMessages(),
		selectModel: (modelKey) => runtime.selectModel(modelKey),
		setThinkingLevel: (level) => runtime.setThinkingLevel(level),
		subscribeExecutionObservation: (handler) => runtime.subscribeExecutionObservation(handler),
		dispose: () => cleanup.run("Failed to dispose Greenfield SDK session resources"),
	};
}

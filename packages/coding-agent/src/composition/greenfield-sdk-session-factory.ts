import { InitializationRollbackScope, RetryableCleanup } from "@vetta/runtime-core";
import type { GreenfieldSdkSessionCore, GreenfieldSdkSessionRuntimePort } from "../public-api/sdk/index.js";
import { bindGreenfieldSdkSessionRuntime, GreenfieldSdkSessionAdapter } from "../public-api/sdk/index.js";
import { createGreenfieldRuntimeComposition } from "./greenfield-runtime-composition.js";
import type {
	GreenfieldRuntimeComposition,
	GreenfieldRuntimeCompositionOptions,
	GreenfieldRuntimeSessionOptions,
} from "./greenfield-runtime-composition-contract.js";
import {
	type GreenfieldSdkSessionStorageTarget,
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
}

export interface GreenfieldSdkSessionFactoryResult {
	readonly session: GreenfieldSdkSessionCore;
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
	const storage = resolveGreenfieldSdkSessionStorage(options.storage);
	const rollback = new InitializationRollbackScope();
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
		const runtime = bindCompositionOwnedRuntime(bindGreenfieldSdkSessionRuntime(runtimeSession), composition);
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
): GreenfieldSdkSessionRuntimePort {
	const cleanup = new RetryableCleanup();
	cleanup.add({ id: "runtime-session", phase: 0, cleanup: () => runtime.dispose() });
	cleanup.add({ id: "runtime-composition", phase: 1, cleanup: () => composition.dispose() });
	return {
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

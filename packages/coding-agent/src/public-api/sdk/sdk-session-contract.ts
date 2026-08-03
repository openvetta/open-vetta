import type { AgentMessage, ThinkingLevel } from "@vetta/agent-core";
import type { Api, Model } from "@vetta/ai";
import type { PromptRequest, RuntimeSessionExecutionObservation, RuntimeSessionState } from "@vetta/runtime-core";
import type { AgentSessionEventListener, PromptOptions } from "../../core/session/types.js";

export type GreenfieldSdkPromptOptions = PromptOptions;
export type GreenfieldSdkSessionEventListener = AgentSessionEventListener;

/**
 * Greenfield SDK 门面当前已经闭合的核心会话合同。
 *
 * 这是并行迁移合同，不替代公开 AgentSession；未进入本接口的外围能力必须继续
 * 由兼容清单跟踪，不能被静默忽略。
 */
export interface GreenfieldSdkSessionCore {
	readonly sessionId: string;
	readonly sessionFile: string | undefined;
	readonly state: RuntimeSessionState;
	readonly model: Model<Api> | undefined;
	readonly thinkingLevel: ThinkingLevel;
	readonly isStreaming: boolean;
	readonly messages: readonly AgentMessage[];
	prompt(text: string, options?: GreenfieldSdkPromptOptions): Promise<void>;
	steer(text: string, images?: GreenfieldSdkPromptOptions["images"]): Promise<void>;
	followUp(text: string, images?: GreenfieldSdkPromptOptions["images"]): Promise<void>;
	abort(): Promise<void>;
	setModel(model: Model<Api>): Promise<void>;
	setThinkingLevel(level: ThinkingLevel): void;
	subscribe(listener: GreenfieldSdkSessionEventListener): () => void;
	dispose(): void;
	close(): Promise<void>;
}

/** Greenfield SDK 门面依赖的最小 Runtime 能力，不绑定具体 Session 实现。 */
export interface GreenfieldSdkSessionRuntimePort {
	readonly sessionId: string;
	readonly sessionPath: string | undefined;
	prompt(request: PromptRequest): Promise<unknown>;
	abort(reason?: string): Promise<void>;
	readState(): RuntimeSessionState;
	readMessages(): readonly AgentMessage[];
	selectModel(modelKey: string): Promise<void>;
	setThinkingLevel(level: ThinkingLevel): void;
	subscribeExecutionObservation(
		handler: (observation: RuntimeSessionExecutionObservation) => Promise<void> | void,
	): () => void;
	dispose(): Promise<void>;
}

import type { ThinkingLevel } from "@vetta/agent-core";
import type { Message } from "@vetta/ai";
import type { HistoryEntry, PromptRequest, SessionEvent, SessionStateSnapshot } from "../contracts.js";

/** 会话身份与资源释放；不承载宿主 UI 绑定或业务外围能力。 */
export interface RuntimeSessionIdentityLifecycle {
	readonly sessionId: string;
	readonly sessionPath: string | undefined;
	dispose(): Promise<void>;
}

/** RuntimeHost 完成宿主预处理后交给 Turn 执行边界的输入。 */
export interface RuntimeTurnPrompt {
	readonly text: string;
	readonly promptRef?: PromptRequest["promptRef"];
	readonly attachments?: PromptRequest["attachments"];
	readonly images?: PromptRequest["images"];
	readonly streamingBehavior?: PromptRequest["streamingBehavior"];
	readonly metadata?: PromptRequest["metadata"];
}

/** 只负责启动、继续和中止 Turn。 */
export interface RuntimeSessionTurnControl {
	prompt(request: RuntimeTurnPrompt): Promise<void>;
	continue(): Promise<void>;
	abort(): Promise<void>;
}

/** 已适配为宿主稳定 SessionEvent 的会话事件流。 */
export interface RuntimeSessionEventStream {
	subscribe(handler: (event: SessionEvent) => void): () => void;
}

export type RuntimeSessionState = Pick<
	SessionStateSnapshot,
	| "model"
	| "thinkingLevel"
	| "isStreaming"
	| "messageCount"
	| "contextPercent"
	| "contextWindow"
	| "activeToolNames"
	| "parentSessionPath"
	| "parentEntryId"
>;

/** RuntimeHost 基础状态面只读视图；不包含历史分支、插件或后台任务。 */
export interface RuntimeSessionStateReader {
	readState(): RuntimeSessionState;
	readMessages(): readonly Message[];
}

/** 当前活动分支的宿主稳定历史投影，只读且不负责分支导航。 */
export interface RuntimeSessionHistoryReader {
	readHistory(): readonly HistoryEntry[];
}

/**
 * 会话历史和元数据的安全写命令；实现必须保留活动 Turn 互斥、分支持久化和
 * Agent 上下文同步语义。
 */
export interface RuntimeSessionHistoryController {
	navigateForEdit(entryId: string): Promise<{ text: string; cancelled: boolean }>;
	switchBranch(entryId: string): { leafId: string };
	deleteMessage(entryId: string): { leafId: string | null };
	replaceLastUserMessage(entryId: string): { leafId: string | null };
	forkSession(entryId: string): { path: string; text: string };
	setName(name: string): void;
}

export type RuntimeModelSelectionStrategy = "if-changed" | "always";

/** 模型与思考等级的写配置边界；不提供外围推理任务所需的模型只读视图。 */
export interface RuntimeSessionModelController {
	selectModel(modelKey: string, strategy: RuntimeModelSelectionStrategy): Promise<void>;
	setThinkingLevel(level: ThinkingLevel): void;
	refreshAuth(token: string | undefined): Promise<void>;
}

export interface RuntimeSessionCorePorts {
	readonly turnControl: RuntimeSessionTurnControl;
	readonly eventStream: RuntimeSessionEventStream;
	readonly stateReader: RuntimeSessionStateReader;
}

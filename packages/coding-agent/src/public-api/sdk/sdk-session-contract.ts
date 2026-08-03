import type { AgentMessage, ThinkingLevel } from "@vetta/agent-core";
import type { Api, ImageContent, Model, TextContent } from "@vetta/ai";
import type {
	PromptRequest,
	RuntimeContextCompactionResult,
	RuntimeSessionContextUsage,
	RuntimeSessionExecutionObservation,
	RuntimeSessionInputQueueMode,
	RuntimeSessionState,
	RuntimeSubagentSnapshot,
} from "@vetta/runtime-core";
import type {
	AgentSessionCustomToolDefinition,
	AgentSessionEventListener,
	PromptOptions,
} from "../../core/session/types.js";

export type GreenfieldSdkPromptOptions = PromptOptions;
export type GreenfieldSdkSessionEventListener = AgentSessionEventListener;
export type GreenfieldSdkCustomToolDefinition = AgentSessionCustomToolDefinition;

export interface GreenfieldSdkScopedModel {
	readonly model: Model<Api>;
	readonly thinkingLevel: ThinkingLevel;
}

export interface GreenfieldSdkModelCycleResult extends GreenfieldSdkScopedModel {
	readonly isScoped: boolean;
}

export interface GreenfieldSdkToolInfo {
	readonly name: string;
	readonly description: string;
	readonly parameters: unknown;
}

export interface GreenfieldSdkSessionStats {
	readonly sessionFile: string | undefined;
	readonly sessionId: string;
	readonly userMessages: number;
	readonly assistantMessages: number;
	readonly toolCalls: number;
	readonly toolResults: number;
	readonly totalMessages: number;
	readonly tokens: {
		readonly input: number;
		readonly output: number;
		readonly cacheRead: number;
		readonly cacheWrite: number;
		readonly total: number;
	};
	readonly cost: number;
}

export type GreenfieldSdkRetryEvent =
	| {
			readonly type: "auto_retry_start";
			readonly attempt: number;
			readonly maxAttempts: number;
			readonly delayMs: number;
			readonly errorMessage: string;
	  }
	| {
			readonly type: "auto_retry_end";
			readonly success: boolean;
			readonly attempt: number;
			readonly finalError?: string;
	  };

/** 不改变 Session 身份的操作能力；身份切换和 Legacy 具体对象不属于该边界。 */
export interface GreenfieldSdkSessionCapabilityPort {
	prompt(request: PromptRequest): Promise<unknown>;
	selectModel(provider: string, modelId: string): Promise<Model<Api> | undefined>;
	setThinkingLevel(level: ThinkingLevel): void;
	subscribeRetryEvents(handler: (event: GreenfieldSdkRetryEvent) => void): () => void;
	readRetryAttempt(): number;
	readActiveToolNames(): readonly string[];
	readAllTools(): readonly GreenfieldSdkToolInfo[];
	setActiveToolNames(toolNames: readonly string[]): void;
	reconfigureCustomTools(customTools: readonly GreenfieldSdkCustomToolDefinition[] | undefined): void;
	readAgentMode(): string | undefined;
	setAgentMode(mode: string | undefined): void;
	readIsCompacting(): boolean;
	readSteeringMode(): RuntimeSessionInputQueueMode;
	readFollowUpMode(): RuntimeSessionInputQueueMode;
	readSessionName(): string | undefined;
	readScopedModels(): readonly GreenfieldSdkScopedModel[];
	setScopedModels(scopedModels: readonly GreenfieldSdkScopedModel[]): void;
	clearQueue(): { readonly steering: readonly string[]; readonly followUp: readonly string[] };
	readPendingMessageCount(): number;
	readSteeringMessages(): readonly string[];
	readFollowUpMessages(): readonly string[];
	cycleModel(direction?: "forward" | "backward"): Promise<GreenfieldSdkModelCycleResult | undefined>;
	cycleThinkingLevel(): ThinkingLevel | undefined;
	readAvailableThinkingLevels(): readonly ThinkingLevel[];
	supportsXhighThinking(): boolean;
	supportsThinking(): boolean;
	setSteeringMode(mode: RuntimeSessionInputQueueMode): void;
	setFollowUpMode(mode: RuntimeSessionInputQueueMode): void;
	compact(customInstructions?: string, signal?: AbortSignal): Promise<RuntimeContextCompactionResult>;
	abortCompaction(): void;
	setAutoCompactionEnabled(enabled: boolean): void;
	readAutoCompactionEnabled(): boolean;
	abortRetry(): void;
	readIsRetrying(): boolean;
	readAutoRetryEnabled(): boolean;
	setAutoRetryEnabled(enabled: boolean): void;
	setSessionName(name: string): Promise<void>;
	readSessionStats(): GreenfieldSdkSessionStats;
	readContextUsage(): RuntimeSessionContextUsage | undefined;
	readLastAssistantText(): string | undefined;
	readSubagents(): readonly RuntimeSubagentSnapshot[];
	interruptSubagent(target: string): RuntimeSubagentSnapshot | undefined;
	clearFinishedSubagents(): number;
}

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

/** 叠加在稳定 Core 之上的固定 Session 操作面；不包含身份迁移。 */
export interface GreenfieldSdkSessionCapabilities {
	readonly retryAttempt: number;
	readonly agentMode: string | undefined;
	readonly isCompacting: boolean;
	readonly steeringMode: RuntimeSessionInputQueueMode;
	readonly followUpMode: RuntimeSessionInputQueueMode;
	readonly sessionName: string | undefined;
	readonly scopedModels: readonly GreenfieldSdkScopedModel[];
	readonly pendingMessageCount: number;
	readonly autoCompactionEnabled: boolean;
	readonly isRetrying: boolean;
	readonly autoRetryEnabled: boolean;
	getActiveToolNames(): readonly string[];
	getAllTools(): readonly GreenfieldSdkToolInfo[];
	setActiveToolsByName(toolNames: readonly string[]): void;
	reconfigureCustomTools(customTools: readonly GreenfieldSdkCustomToolDefinition[] | undefined): void;
	setAgentMode(mode: string | undefined): void;
	setScopedModels(scopedModels: readonly GreenfieldSdkScopedModel[]): void;
	clearQueue(): { readonly steering: readonly string[]; readonly followUp: readonly string[] };
	getSteeringMessages(): readonly string[];
	getFollowUpMessages(): readonly string[];
	cycleModel(direction?: "forward" | "backward"): Promise<GreenfieldSdkModelCycleResult | undefined>;
	cycleThinkingLevel(): ThinkingLevel | undefined;
	getAvailableThinkingLevels(): readonly ThinkingLevel[];
	supportsXhighThinking(): boolean;
	supportsThinking(): boolean;
	setSteeringMode(mode: RuntimeSessionInputQueueMode): void;
	setFollowUpMode(mode: RuntimeSessionInputQueueMode): void;
	compact(customInstructions?: string, signal?: AbortSignal): Promise<RuntimeContextCompactionResult>;
	abortCompaction(): void;
	setAutoCompactionEnabled(enabled: boolean): void;
	abortRetry(): void;
	setAutoRetryEnabled(enabled: boolean): void;
	setSessionName(name: string): Promise<void>;
	getSessionStats(): GreenfieldSdkSessionStats;
	getContextUsage(): RuntimeSessionContextUsage | undefined;
	getLastAssistantText(): string | undefined;
	listSubagents(): readonly RuntimeSubagentSnapshot[];
	interruptSubagent(target: string): RuntimeSubagentSnapshot | undefined;
	clearFinishedSubagents(): number;
}

export type GreenfieldSdkSession = GreenfieldSdkSessionCore & GreenfieldSdkSessionCapabilities;

export interface GreenfieldSdkSessionSetupPort {
	appendMessage(message: AgentMessage): string;
}

export interface GreenfieldSdkBashOperations {
	exec(
		command: string,
		cwd: string,
		options: {
			readonly onData: (data: Buffer) => void;
			readonly signal?: AbortSignal;
			readonly timeout?: number;
			readonly env?: NodeJS.ProcessEnv;
		},
	): Promise<{ readonly exitCode: number | null }>;
}

export interface GreenfieldSdkBashResult {
	readonly output: string;
	readonly exitCode: number | undefined;
	readonly cancelled: boolean;
	readonly truncated: boolean;
	readonly fullOutputPath?: string;
}

export interface GreenfieldSdkSessionBranchEntry {
	readonly id: string;
	readonly type: string;
	readonly parentId: string | null;
}

export interface GreenfieldSdkBranchSummaryEntry extends GreenfieldSdkSessionBranchEntry {
	readonly type: "branch_summary";
	readonly summary: string;
}

export interface GreenfieldSdkNewSessionOptions {
	readonly parentSession?: string;
	readonly setup?: (sessionManager: GreenfieldSdkSessionSetupPort) => Promise<void>;
}

export interface GreenfieldSdkTreeNavigationOptions {
	readonly summarize?: boolean;
	readonly customInstructions?: string;
	readonly replaceInstructions?: boolean;
	readonly label?: string;
}

export interface GreenfieldSdkTreeNavigationResult {
	readonly editorText?: string;
	readonly cancelled: boolean;
	readonly aborted?: boolean;
	readonly summaryEntry?: GreenfieldSdkBranchSummaryEntry;
}

/** 会改变当前会话身份或依赖活动会话所有权的 SDK 操作。 */
export interface GreenfieldSdkActiveSessionCapabilities {
	getSessionBranch(): readonly GreenfieldSdkSessionBranchEntry[];
	sendCustomMessage<T = unknown>(
		message: {
			readonly customType: string;
			readonly content: string | readonly (TextContent | ImageContent)[];
			readonly display: boolean;
			readonly details?: T;
		},
		options?: { readonly triggerTurn?: boolean; readonly deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void>;
	sendUserMessage(
		content: string | readonly (TextContent | ImageContent)[],
		options?: { readonly deliverAs?: "steer" | "followUp" },
	): Promise<void>;
	newSession(options?: GreenfieldSdkNewSessionOptions): Promise<boolean>;
	abortBranchSummary(): void;
	executeBash(
		command: string,
		onChunk?: (chunk: string) => void,
		options?: { readonly excludeFromContext?: boolean; readonly operations?: GreenfieldSdkBashOperations },
	): Promise<GreenfieldSdkBashResult>;
	abortBash(): void;
	readonly isBashRunning: boolean;
	readonly hasPendingBashMessages: boolean;
	switchSession(sessionPath: string): Promise<boolean>;
	fork(entryId: string): Promise<{ readonly selectedText: string; readonly cancelled: boolean }>;
	navigateTree(
		targetId: string,
		options?: GreenfieldSdkTreeNavigationOptions,
	): Promise<GreenfieldSdkTreeNavigationResult>;
	switchBranch(targetId: string): Promise<{ readonly leafId: string }>;
	appendBranchSummary(
		parentId: string | null,
		summary: string,
		details?: unknown,
		fromHook?: boolean,
	): Promise<{ readonly entryId: string }>;
	deleteMessage(entryId: string): Promise<{ readonly leafId: string | null }>;
	replaceLastUserMessage(entryId: string): Promise<{ readonly leafId: string | null }>;
	exportForkToNewFile(entryId: string): Promise<{ readonly path: string; readonly text: string }>;
	getUserMessagesForForking(): readonly { readonly entryId: string; readonly text: string }[];
}

export type GreenfieldSdkActiveSession = GreenfieldSdkSession & GreenfieldSdkActiveSessionCapabilities;

/** Active Session Adapter 依赖的身份事务和历史操作端口。 */
export interface GreenfieldSdkActiveSessionCapabilityPort extends GreenfieldSdkActiveSessionCapabilities {
	quiesceIdentity(): Promise<void>;
	dispose(): Promise<void>;
}

/** Greenfield SDK 门面依赖的最小 Runtime 能力，不绑定具体 Session 实现。 */
export interface GreenfieldSdkSessionRuntimePort {
	readonly sessionId: string;
	readonly sessionPath: string | undefined;
	readonly capabilities: GreenfieldSdkSessionCapabilityPort;
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

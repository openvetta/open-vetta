import type {
	Api,
	ImageContent,
	Message,
	Model,
	SimpleStreamOptions,
	StopReason,
	TextContent,
	UserMessage,
} from "@vetta/ai";
import type { RuntimeSessionObservationEvent } from "../session-observation.js";

export type AgentSessionState = "idle" | "running" | "cancelling" | "closing" | "closed";

/** 由宿主适配器贡献的持久化上下文；Kernel 不解释业务类型。 */
export interface SessionContextRecord {
	readonly type: string;
	readonly content: UserMessage["content"];
	readonly modelVisible: boolean;
	readonly display?: boolean;
	readonly metadata?: unknown;
}

export interface SessionInput {
	readonly message: UserMessage;
	readonly context?: readonly SessionContextRecord[];
}

export type SessionInputQueueMode = "all" | "one-at-a-time";

export type SessionStreamingBehavior = "steer" | "followUp";

export interface SessionSendOptions {
	readonly streamingBehavior?: SessionStreamingBehavior;
}

export interface QueuedSessionInputResult {
	readonly status: "queued";
	readonly behavior: SessionStreamingBehavior;
	readonly pendingCount: number;
}

export interface TurnInputQueue {
	takeSteering(): readonly UserMessage[];
	takeFollowUps(): readonly UserMessage[];
	enqueueFollowUps(messages: readonly UserMessage[]): void;
}

export interface InstructionBlock {
	readonly id: string;
	readonly content: string;
	readonly priority: number;
}

export interface CapabilityBinding {
	readonly sourceId: string;
	readonly capabilityId: string;
	readonly revision: string;
}

export interface RuntimeToolDefinition<TInput extends object = Readonly<Record<string, unknown>>> {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly inputSchema: Readonly<Record<string, unknown>>;
	execute(request: RuntimeToolExecutionRequest<TInput>): Promise<RuntimeToolResult>;
}

export interface RuntimeToolExecutionRequest<TInput extends object = Readonly<Record<string, unknown>>> {
	readonly sessionId: string;
	readonly turnId: string;
	readonly toolCallId: string;
	readonly input: Readonly<TInput>;
	/** 工具开始执行时的模型可见消息视图。 */
	readonly messages?: readonly Message[];
	readonly signal: AbortSignal;
	readonly onUpdate?: (result: RuntimeToolResult) => void;
	readonly reportPhase?: (label: string) => void;
}

export interface RuntimeToolResult {
	readonly content: readonly (TextContent | ImageContent)[];
	readonly details?: unknown;
}

export interface ToolPolicyRequest {
	readonly sessionId: string;
	readonly turnId: string;
	readonly toolName: string;
	readonly input: unknown;
}

export interface ToolPolicy {
	authorize(request: ToolPolicyRequest, signal: AbortSignal): Promise<boolean>;
}

export interface ContextProviderInput {
	readonly sessionId: string;
	readonly turnId: string;
	readonly conversation: StoredConversation;
	readonly input?: SessionInput;
}

export interface ContextProvider {
	readonly id: string;
	provide(input: ContextProviderInput, signal: AbortSignal): Promise<readonly Message[]>;
}

export interface CompactionRecord {
	readonly id: string;
	readonly sourceMessageCount: number;
	readonly resultMessageCount: number;
	readonly summary?: string;
}

export interface ContextPreparationInput {
	readonly messages: readonly Message[];
	readonly tokenBudget: number;
	readonly reservedOutputTokens: number;
}

export interface PreparedContext {
	readonly messages: readonly Message[];
	readonly estimatedTokens: number;
	readonly compaction?: CompactionRecord;
}

export interface ContextStrategy {
	prepare(input: ContextPreparationInput, signal: AbortSignal): Promise<PreparedContext>;
}

export interface ModelCallContributionContext {
	readonly sessionId: string;
	readonly turnId: string;
	readonly signal: AbortSignal;
	readonly input?: SessionInput;
	/** 当前模型调用已经积累的模型可见消息。 */
	readonly messages?: readonly Message[];
	/** 当前 Turn 的不可变模型绑定。 */
	readonly modelBinding?: RuntimeTurnModelBinding;
}

export interface ModelCallContribution {
	readonly instructions?: readonly InstructionBlock[];
	readonly tools?: readonly RuntimeToolDefinition[];
}

export interface ModelCallContributionProvider {
	readonly id: string;
	contribute(context: ModelCallContributionContext): Promise<ModelCallContribution>;
}

export interface ModelCallFrame {
	readonly instructions: readonly InstructionBlock[];
	readonly tools: ReadonlyMap<string, RuntimeToolDefinition>;
}

export interface ModelCallFrameCompositionContext {
	readonly sessionId: string;
	readonly turnId: string;
	readonly signal: AbortSignal;
	readonly input?: SessionInput;
	readonly messages: readonly Message[];
	readonly modelBinding?: RuntimeTurnModelBinding;
	/** 已汇总静态和动态 Feature 贡献的只读候选 Frame。 */
	readonly frame: ModelCallFrame;
}

/**
 * Profile 独占的模型调用最终编译器。
 *
 * 每个 Profile 最多一个 Composer；它不是可串联 Middleware，只负责把已经汇总的候选
 * Frame 编译成该产品最终交给模型的 Prompt 与工具集合。
 */
export interface ModelCallFrameComposer {
	compose(context: ModelCallFrameCompositionContext): Promise<ModelCallFrame>;
}

export interface ContinuationPolicyContext {
	readonly sessionId: string;
	readonly turnId: string;
	readonly signal: AbortSignal;
	readonly messages: readonly Message[];
	readonly modelBinding?: RuntimeTurnModelBinding;
}

/**
 * Profile 独占的自然停止续跑策略。
 *
 * Kernel 不解释 Todo、Plugin 或 Hook 等产品语义；策略只返回需要进入普通
 * follow-up 队列的用户消息。
 */
export interface ContinuationPolicy {
	collect(context: ContinuationPolicyContext): Promise<readonly UserMessage[]>;
}

export interface RuntimeSnapshot {
	readonly id: string;
	readonly instructions: readonly InstructionBlock[];
	readonly tools: ReadonlyMap<string, RuntimeToolDefinition>;
	readonly modelCallProviders?: readonly ModelCallContributionProvider[];
	readonly modelCallFrameComposer?: ModelCallFrameComposer;
	readonly continuationPolicy?: ContinuationPolicy;
	readonly contextProviders: readonly ContextProvider[];
	readonly contextStrategy: ContextStrategy;
	readonly toolPolicy: ToolPolicy;
	readonly tokenBudget: number;
	readonly reservedOutputTokens: number;
	readonly observers: readonly TurnObserver[];
}

export interface RuntimeSnapshotLease {
	readonly snapshot: RuntimeSnapshot;
	release(): Promise<void>;
}

export interface RuntimeSnapshotProvider {
	acquire(): Promise<RuntimeSnapshotLease>;
}

/** 单次 Turn 使用的不可变模型选择；运行时切模只影响后续 bind。 */
export interface RuntimeTurnModelBinding {
	readonly model: Model<Api>;
	readonly reasoning?: SimpleStreamOptions["reasoning"];
}

export interface RuntimeTurnModelBindingProvider {
	bind(): RuntimeTurnModelBinding;
}

export interface FeaturePrepareContext {
	readonly signal: AbortSignal;
}

export interface FeatureContributionContext {
	readonly profileId: string;
	readonly signal: AbortSignal;
}

export interface FeatureContribution {
	readonly instructions?: readonly InstructionBlock[];
	readonly tools?: readonly RuntimeToolDefinition[];
	readonly contextProviders?: readonly ContextProvider[];
	readonly observers?: readonly TurnObserver[];
	readonly modelCallProviders?: readonly ModelCallContributionProvider[];
}

export interface AgentFeature {
	contribute(context: FeatureContributionContext): Promise<FeatureContribution>;
	dispose(): Promise<void>;
}

export interface AgentFeatureDefinition {
	readonly id: string;
	readonly dependencies?: readonly string[];
	readonly conflicts?: readonly string[];
	prepare(context: FeaturePrepareContext): Promise<AgentFeature>;
}

export interface AgentProfile {
	readonly id: string;
	readonly instructions: readonly InstructionBlock[];
	readonly features: readonly AgentFeatureDefinition[];
	readonly modelCallFrameComposer?: ModelCallFrameComposer;
	readonly continuationPolicy?: ContinuationPolicy;
	readonly contextStrategy: ContextStrategy;
	readonly toolPolicy: ToolPolicy;
	readonly tokenBudget: number;
	readonly reservedOutputTokens: number;
}

export interface CompiledRuntimeSnapshot {
	readonly snapshot: RuntimeSnapshot;
	dispose(): Promise<void>;
}

export interface ConversationMetadata {
	readonly sessionId: string;
	readonly createdAt: number;
	readonly version: number;
}

export interface StoredConversation extends ConversationMetadata {
	readonly messages: readonly Message[];
	readonly events: readonly StoredSessionEvent[];
}

export interface CreateConversationInput {
	readonly sessionId: string;
	readonly createdAt: number;
}

export interface AppendResult {
	readonly version: number;
}

export interface ConversationRepository {
	create(input: CreateConversationInput): Promise<ConversationMetadata>;
	load(sessionId: string): Promise<StoredConversation>;
	append(sessionId: string, expectedVersion: number, events: readonly StoredSessionEvent[]): Promise<AppendResult>;
	saveSnapshot(sessionId: string, snapshot: ConversationSnapshot): Promise<void>;
	close(): Promise<void>;
}

export interface ConversationSnapshot {
	readonly sessionId: string;
	readonly version: number;
	readonly messages: readonly Message[];
	readonly createdAt: number;
}

export interface TurnStartedEvent {
	readonly type: "turn.started";
	readonly sessionId: string;
	readonly turnId: string;
	readonly snapshotId: string;
	readonly timestamp: number;
}

export interface MessageAppendedEvent {
	readonly type: "message.appended";
	readonly sessionId: string;
	readonly turnId: string;
	readonly message: Message;
	readonly timestamp: number;
}

export interface ContextAppendedEvent {
	readonly type: "context.appended";
	readonly sessionId: string;
	readonly turnId: string;
	readonly record: SessionContextRecord;
	readonly timestamp: number;
}

export interface ContextCompactedEvent {
	readonly type: "context.compacted";
	readonly sessionId: string;
	readonly turnId: string;
	readonly record: CompactionRecord;
	readonly timestamp: number;
}

export interface TurnCompletedEvent {
	readonly type: "turn.completed";
	readonly sessionId: string;
	readonly turnId: string;
	readonly stopReason: StopReason;
	readonly timestamp: number;
}

export interface TurnCancelledEvent {
	readonly type: "turn.cancelled";
	readonly sessionId: string;
	readonly turnId: string;
	readonly reason?: string;
	readonly timestamp: number;
}

export interface TurnFailedEvent {
	readonly type: "turn.failed";
	readonly sessionId: string;
	readonly turnId: string;
	readonly error: {
		readonly code: string;
		readonly message: string;
	};
	readonly timestamp: number;
}

export type StoredSessionEvent =
	| TurnStartedEvent
	| MessageAppendedEvent
	| ContextAppendedEvent
	| ContextCompactedEvent
	| TurnCompletedEvent
	| TurnCancelledEvent
	| TurnFailedEvent;

export type TurnPipelineStage =
	| "admission"
	| "snapshot_binding"
	| "conversation_loading"
	| "context_assembly"
	| "context_preparation"
	| "execution"
	| "finalization";

export interface TurnPipelineStageEvent {
	readonly type: "pipeline.stage";
	readonly sessionId: string;
	readonly turnId: string;
	readonly stage: TurnPipelineStage;
	readonly timestamp: number;
}

export interface ObserverFailedEvent {
	readonly type: "observer.failed";
	readonly sessionId: string;
	readonly turnId: string;
	readonly observerId: string;
	readonly error: string;
	readonly timestamp: number;
}

/** 瞬时会话观察事件；只发布给 EventSink，不进入 ConversationRepository。 */
export interface RuntimeSessionObservationEnvelope {
	readonly type: "session.observation";
	readonly sessionId: string;
	readonly turnId: string;
	readonly observation: RuntimeSessionObservationEvent;
	readonly timestamp: number;
}

export type KernelEvent =
	| StoredSessionEvent
	| TurnPipelineStageEvent
	| ObserverFailedEvent
	| RuntimeSessionObservationEnvelope;

export interface EventSink {
	publish(event: KernelEvent): Promise<void>;
}

export interface TurnObserver {
	readonly id: string;
	observe(event: StoredSessionEvent, signal: AbortSignal): Promise<void>;
}

export interface TurnEngineRequest {
	readonly sessionId: string;
	readonly turnId: string;
	readonly snapshot: RuntimeSnapshot;
	readonly modelBinding?: RuntimeTurnModelBinding;
	readonly messages: readonly Message[];
	readonly signal: AbortSignal;
	readonly inputQueue?: TurnInputQueue;
	readonly input?: SessionInput;
}

export type TurnEngineEvent =
	| {
			readonly type: "observation";
			readonly observation: RuntimeSessionObservationEvent;
	  }
	| {
			readonly type: "message";
			readonly message: Message;
	  }
	| {
			readonly type: "completed";
			readonly stopReason: StopReason;
	  };

export interface TurnEnginePort {
	execute(request: TurnEngineRequest): AsyncIterable<TurnEngineEvent>;
}

export interface Clock {
	now(): number;
}

export interface IdGenerator {
	next(scope: "snapshot" | "turn"): string;
}

export type TurnResult =
	| {
			readonly status: "completed";
			readonly turnId: string;
			readonly stopReason: StopReason;
			readonly messages: readonly Message[];
	  }
	| {
			readonly status: "cancelled";
			readonly turnId: string;
			readonly reason?: string;
			readonly messages: readonly Message[];
	  }
	| {
			readonly status: "failed";
			readonly turnId: string;
			readonly error: {
				readonly code: string;
				readonly message: string;
			};
			readonly messages: readonly Message[];
	  };

export type SessionSendResult = TurnResult | QueuedSessionInputResult;

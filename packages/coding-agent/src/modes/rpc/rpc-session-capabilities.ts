import type { AgentMessage, ThinkingLevel } from "@vetta/agent-core";
import type { Api, ImageContent, Model } from "@vetta/ai";
import type { BashResult } from "../../core/bash-executor.js";
import type { CompactionResult } from "../../core/compaction/index.js";
import type {
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
} from "../../core/extensions/index.js";
import type { SessionStats } from "../../core/session/session-stats.js";
import type { ImHostBridge } from "../../core/tools/im-send-attachment/index.js";
import type { RpcSessionState, RpcSlashCommand } from "./rpc-types.js";

export interface RpcSessionExtensionError {
	readonly extensionPath: string;
	readonly event: string;
	readonly error: string;
}

export interface RpcSessionInitialization {
	readonly uiContext: ExtensionUIContext;
	readonly hostBridge?: ImHostBridge;
	readonly onShutdownRequested: () => void;
	readonly onExtensionError: (error: RpcSessionExtensionError) => void;
}

export interface RpcTurnCapability {
	prompt(
		message: string,
		options: {
			readonly images?: ImageContent[];
			readonly streamingBehavior?: "steer" | "followUp";
			readonly source: "rpc";
		},
	): Promise<void>;
	steer(message: string, images?: ImageContent[]): Promise<void>;
	followUp(message: string, images?: ImageContent[]): Promise<void>;
	abort(): Promise<void>;
}

export interface RpcStateCapability {
	readState(): RpcSessionState;
	readMessages(): readonly AgentMessage[];
}

export interface RpcModelCapability {
	selectModel(provider: string, modelId: string): Promise<Model<Api> | undefined>;
	cycleModel(): Promise<{ model: Model<Api>; thinkingLevel: ThinkingLevel; isScoped: boolean } | undefined>;
	readAvailableModels(): Promise<readonly (Model<Api> & { readonly remote?: boolean })[]>;
	setThinkingLevel(level: ThinkingLevel): void;
	cycleThinkingLevel(): ThinkingLevel | undefined;
}

export interface RpcQueueCapability {
	setSteeringMode(mode: "all" | "one-at-a-time"): void;
	setFollowUpMode(mode: "all" | "one-at-a-time"): void;
}

export interface RpcContextCapability {
	compact(customInstructions?: string): Promise<CompactionResult>;
	setAutoCompactionEnabled(enabled: boolean): void;
}

export interface RpcMemoryCapability {
	flushMemory(): Promise<number>;
}

export interface RpcRetryCapability {
	setAutoRetryEnabled(enabled: boolean): void;
	abortRetry(): void;
}

export interface RpcBashCapability {
	execute(command: string): Promise<BashResult>;
	abort(): void;
}

export interface RpcSessionManagementCapability {
	newSession(parentSession?: string): Promise<boolean>;
	switchSession(sessionPath: string): Promise<boolean>;
	fork(entryId: string): Promise<{ text: string; cancelled: boolean }>;
	readForkMessages(): readonly { entryId: string; text: string }[];
	readLastAssistantText(): string | undefined;
	setName(name: string): void;
	readStats(): SessionStats;
	exportHtml(outputPath?: string): Promise<string>;
}

export interface RpcCommandDiscoveryCapability {
	readCommands(): readonly RpcSlashCommand[];
}

export interface RpcSessionCapabilities {
	readonly turn: RpcTurnCapability;
	readonly state: RpcStateCapability;
	readonly model: RpcModelCapability;
	readonly queue: RpcQueueCapability;
	readonly context: RpcContextCapability;
	readonly memory: RpcMemoryCapability;
	readonly retry: RpcRetryCapability;
	readonly bash: RpcBashCapability;
	readonly session: RpcSessionManagementCapability;
	readonly commands: RpcCommandDiscoveryCapability;
	initialize(input: RpcSessionInitialization): Promise<void>;
	subscribe(listener: (event: unknown) => void): () => void;
	shutdown(): Promise<void>;
}

export type { ExtensionUIContext, ExtensionUIDialogOptions, ExtensionWidgetOptions, ImHostBridge };

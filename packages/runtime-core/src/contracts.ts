import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Message, Model } from "@mariozechner/pi-ai";

export type RuntimeEventSource = "runtime-core" | "agent" | "tool" | "mcp";

export interface SessionEventBase {
	schemaVersion: 1;
	sessionId: string;
	eventId: string;
	timestamp: number;
	source: RuntimeEventSource;
}

export interface SessionLifecycleEvent extends SessionEventBase {
	type: "session.lifecycle";
	phase: "created" | "agent_start" | "turn_start" | "turn_end" | "agent_end" | "aborted";
}

export interface MessageDeltaEvent extends SessionEventBase {
	type: "message.delta";
	delta: string;
}

export interface ThinkingDeltaEvent extends SessionEventBase {
	type: "thinking.delta";
	delta: string;
}

export interface MessageFinalEvent extends SessionEventBase {
	type: "message.final";
	message: Message;
}

export interface ToolStartEvent extends SessionEventBase {
	type: "tool.start";
	toolCallId: string;
	toolName: string;
	args: unknown;
}

export interface ToolUpdateEvent extends SessionEventBase {
	type: "tool.update";
	toolCallId: string;
	toolName: string;
	partialResult: unknown;
}

export interface ToolEndEvent extends SessionEventBase {
	type: "tool.end";
	toolCallId: string;
	toolName: string;
	isError: boolean;
	result: unknown;
}

export interface McpStatusEvent extends SessionEventBase {
	type: "mcp.status";
	status: "connected" | "degraded" | "disconnected";
	details?: string;
}

export interface UsageUpdateEvent extends SessionEventBase {
	type: "usage.update";
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
}

export interface SessionError {
	code: string;
	message: string;
	retryable: boolean;
	origin: "runtime" | "provider" | "tool" | "mcp";
	details?: unknown;
}

export interface ErrorEvent extends SessionEventBase {
	type: "error";
	error: SessionError;
}

export type SessionEvent =
	| SessionLifecycleEvent
	| MessageDeltaEvent
	| ThinkingDeltaEvent
	| MessageFinalEvent
	| ToolStartEvent
	| ToolUpdateEvent
	| ToolEndEvent
	| McpStatusEvent
	| UsageUpdateEvent
	| ErrorEvent;

export interface SessionStateSnapshot {
	sessionId: string;
	model?: Model<any>;
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	messageCount: number;
}

export interface ProjectInfo {
	cwd: string;
	sessionCount: number;
}

export interface SessionHistoryInfo {
	id: string;
	path: string;
	cwd: string;
	name?: string;
	firstMessage: string;
	modifiedAt: number;
}

export interface SessionConfig {
	cwd?: string;
	agentDir?: string;
	sessionPath?: string;
	model?: Model<any>;
	thinkingLevel?: ThinkingLevel;
}

export interface PromptRequest {
	text: string;
	images?: Array<{ type: "image"; data: string; mimeType: string }>;
	streamingBehavior?: "steer" | "followUp";
}

export interface SettingsPatch {
	thinkingLevel?: ThinkingLevel;
	steeringMode?: "all" | "one-at-a-time";
	followUpMode?: "all" | "one-at-a-time";
}

export interface SessionFacade {
	createSession(config?: SessionConfig): Promise<{ sessionId: string }>;
	prompt(sessionId: string, request: PromptRequest): Promise<void>;
	continue(sessionId: string): Promise<void>;
	abort(sessionId: string): Promise<void>;
	subscribe(sessionId: string, handler: (event: SessionEvent) => void): () => void;
	updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void>;
	getState(sessionId: string): SessionStateSnapshot;
	getMessages(sessionId: string): Message[];
	listProjects(): Promise<ProjectInfo[]>;
	listSessions(cwd: string): Promise<SessionHistoryInfo[]>;
	disposeSession(sessionId: string): Promise<void>;
}

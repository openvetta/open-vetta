import type { AgentMessage, ToolPhase } from "@vetta/agent-core";
import type { ImageContent, TextContent } from "@vetta/ai";

export interface SessionEntryBase {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
}

export interface SessionMessageEntry extends SessionEntryBase {
	type: "message";
	message: AgentMessage;
}

export interface ThinkingLevelChangeEntry extends SessionEntryBase {
	type: "thinking_level_change";
	thinkingLevel: string;
}

export interface ModelChangeEntry extends SessionEntryBase {
	type: "model_change";
	provider: string;
	modelId: string;
}

export interface CompactionEntry<T = unknown> extends SessionEntryBase {
	type: "compaction";
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details?: T;
	fromHook?: boolean;
}

export interface BranchSummaryEntry<T = unknown> extends SessionEntryBase {
	type: "branch_summary";
	fromId: string;
	summary: string;
	details?: T;
	fromHook?: boolean;
}

export interface CustomEntry<T = unknown> extends SessionEntryBase {
	type: "custom";
	customType: string;
	data?: T;
}

export interface CustomMessageEntry<T = unknown> extends SessionEntryBase {
	type: "custom_message";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	details?: T;
	display: boolean;
}

export interface LabelEntry extends SessionEntryBase {
	type: "label";
	targetId: string;
	label: string | undefined;
}

export interface SessionInfoEntry extends SessionEntryBase {
	type: "session_info";
	name?: string;
}

export interface ToolTimingEntry extends SessionEntryBase {
	type: "tool_timing";
	toolCallId: string;
	toolName: string;
	startedAt: number;
	durationMs: number;
	phases: ToolPhase[];
}

export type SessionEntry =
	| SessionMessageEntry
	| ThinkingLevelChangeEntry
	| ModelChangeEntry
	| CompactionEntry
	| BranchSummaryEntry
	| CustomEntry
	| CustomMessageEntry
	| LabelEntry
	| SessionInfoEntry
	| ToolTimingEntry;

export interface SessionHeader {
	type: "session";
	version?: number;
	id: string;
	timestamp: string;
	cwd: string;
	parentSession?: string;
	parentEntryId?: string;
}

export interface SessionTreeNode {
	entry: SessionEntry;
	children: SessionTreeNode[];
	label?: string;
}

export interface SessionContext {
	messages: AgentMessage[];
	thinkingLevel: string;
	model: { provider: string; modelId: string } | null;
}

export interface ExtensionSessionView {
	getCwd(): string;
	getSessionDir(): string;
	getSessionId(): string;
	getSessionFile(): string | undefined;
	getLeafId(): string | null;
	getLeafEntry(): SessionEntry | undefined;
	getEntry(id: string): SessionEntry | undefined;
	getLabel(id: string): string | undefined;
	getBranch(fromId?: string): SessionEntry[];
	getHeader(): SessionHeader | null;
	getEntries(): SessionEntry[];
	getTree(): SessionTreeNode[];
	getSessionName(): string | undefined;
}

export interface ExtensionSessionWriter extends ExtensionSessionView {
	appendMessage(message: AgentMessage): string;
	appendThinkingLevelChange(thinkingLevel: string): string;
	appendToolTiming(
		toolCallId: string,
		toolName: string,
		startedAt: number,
		durationMs: number,
		phases: ToolPhase[],
	): string;
	appendModelChange(provider: string, modelId: string): string;
	appendCompaction<T = unknown>(
		summary: string,
		firstKeptEntryId: string,
		tokensBefore: number,
		details?: T,
		fromHook?: boolean,
	): string;
	appendCustomEntry(customType: string, data?: unknown): string;
	appendSessionInfo(name: string): string;
	appendCustomMessageEntry<T = unknown>(
		customType: string,
		content: string | (TextContent | ImageContent)[],
		display: boolean,
		details?: T,
	): string;
	branch(branchFromId: string): void;
	resetLeaf(): void;
	branchWithSummary(branchFromId: string | null, summary: string, details?: unknown, fromHook?: boolean): string;
	appendLabelChange(targetId: string, label: string | undefined): string;
}

/** Bivariant for source compatibility with callbacks previously typed with the concrete SessionManager. */
export type ExtensionSessionSetup = {
	setup(sessionManager: ExtensionSessionWriter): Promise<void>;
}["setup"];

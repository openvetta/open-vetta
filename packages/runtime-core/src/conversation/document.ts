import type { ToolPhase } from "@vetta/agent-core";
import type { StoredSessionEvent } from "../kernel/contracts.js";

export interface ConversationDocumentIdentity {
	readonly sessionId: string;
	readonly createdAt: number;
	readonly cwd?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
}

export interface ConversationDocumentEntryBase {
	readonly id: string;
	readonly parentId: string | null;
	readonly timestamp: string;
}

export interface ConversationDocumentMessageEntry extends ConversationDocumentEntryBase {
	readonly type: "message";
	/** Legacy sessions may contain extension-specific AgentMessage variants. */
	readonly message: unknown;
}

export interface ConversationDocumentCompactionEntry extends ConversationDocumentEntryBase {
	readonly type: "compaction";
	readonly summary: string;
	readonly firstKeptEntryId: string;
	readonly tokensBefore: number;
	readonly details?: unknown;
	readonly fromHook?: boolean;
}

export interface ConversationDocumentBranchSummaryEntry extends ConversationDocumentEntryBase {
	readonly type: "branch_summary";
	readonly fromId: string;
	readonly summary: string;
	readonly details?: unknown;
	readonly fromHook?: boolean;
}

export interface ConversationDocumentCustomEntry extends ConversationDocumentEntryBase {
	readonly type: "custom";
	readonly customType: string;
	readonly data?: unknown;
}

export interface ConversationDocumentCustomMessageEntry extends ConversationDocumentEntryBase {
	readonly type: "custom_message";
	readonly customType: string;
	readonly content: unknown;
	readonly details?: unknown;
	readonly display: boolean;
}

export interface ConversationDocumentThinkingLevelEntry extends ConversationDocumentEntryBase {
	readonly type: "thinking_level_change";
	readonly thinkingLevel: string;
}

export interface ConversationDocumentModelEntry extends ConversationDocumentEntryBase {
	readonly type: "model_change";
	readonly provider: string;
	readonly modelId: string;
}

export interface ConversationDocumentLabelEntry extends ConversationDocumentEntryBase {
	readonly type: "label";
	readonly targetId: string;
	readonly label?: string;
}

export interface ConversationDocumentSessionInfoEntry extends ConversationDocumentEntryBase {
	readonly type: "session_info";
	readonly name?: string;
}

export interface ConversationDocumentToolTimingEntry extends ConversationDocumentEntryBase {
	readonly type: "tool_timing";
	readonly toolCallId: string;
	readonly toolName: string;
	readonly startedAt: number;
	readonly durationMs: number;
	readonly phases: readonly ToolPhase[];
}

export type ConversationDocumentEntry =
	| ConversationDocumentMessageEntry
	| ConversationDocumentCompactionEntry
	| ConversationDocumentBranchSummaryEntry
	| ConversationDocumentCustomEntry
	| ConversationDocumentCustomMessageEntry
	| ConversationDocumentThinkingLevelEntry
	| ConversationDocumentModelEntry
	| ConversationDocumentLabelEntry
	| ConversationDocumentSessionInfoEntry
	| ConversationDocumentToolTimingEntry;

export interface ConversationDocument {
	readonly identity: ConversationDocumentIdentity;
	/** Native journal sequence or imported Legacy entry count used to advance the read model. */
	readonly revision: number;
	readonly entries: readonly ConversationDocumentEntry[];
	readonly activeLeafId: string | null;
}

export interface ConversationDocumentEntryReference {
	readonly id: string;
	readonly parentId: string | null;
	readonly timestamp: string;
}

export interface ConversationDocumentReader {
	readDocument(sessionId: string): Promise<ConversationDocument>;
}

export function createEmptyConversationDocument(identity: ConversationDocumentIdentity): ConversationDocument {
	return { identity, revision: 0, entries: [], activeLeafId: null };
}

export function nativeConversationEntryId(sequence: number): string {
	return `event-${sequence}`;
}

/** Apply one persisted Kernel event to the independent conversation read model. */
export function applyStoredEventToConversationDocument(
	document: ConversationDocument,
	event: StoredSessionEvent,
	sequence: number,
	reference?: ConversationDocumentEntryReference,
): ConversationDocument {
	if (event.sessionId !== document.identity.sessionId) {
		throw new Error(`Conversation document ${document.identity.sessionId} cannot apply event for ${event.sessionId}`);
	}
	if (sequence !== document.revision + 1) {
		throw new Error(`Conversation document sequence ${sequence} does not follow revision ${document.revision}`);
	}
	if (event.type !== "message.appended") {
		return { ...document, revision: sequence };
	}

	const entryReference =
		reference ??
		({
			id: nativeConversationEntryId(sequence),
			parentId: document.activeLeafId,
			timestamp: new Date(event.timestamp).toISOString(),
		} satisfies ConversationDocumentEntryReference);
	if (document.entries.some((entry) => entry.id === entryReference.id)) {
		throw new Error(`Conversation document entry already exists: ${entryReference.id}`);
	}
	if (entryReference.parentId && !document.entries.some((entry) => entry.id === entryReference.parentId)) {
		throw new Error(`Conversation document parent does not exist: ${entryReference.parentId}`);
	}
	return {
		...document,
		revision: sequence,
		entries: [
			...document.entries,
			{
				type: "message",
				...entryReference,
				message: event.message,
			},
		],
		activeLeafId: entryReference.id,
	};
}

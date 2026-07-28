import type { ConversationDocument } from "../conversation/index.js";
import type { StoredSessionEvent } from "../kernel/contracts.js";

export interface GreenfieldRuntimeCustomEntryInput {
	readonly entryId: string;
	readonly customType: string;
	readonly data?: unknown;
	readonly timestamp: string;
}

/** 产品状态与通用 Conversation Document 之间的 Session-local 协作边界。 */
export interface GreenfieldRuntimeDocumentParticipantContext {
	appendCustomEntry(entry: GreenfieldRuntimeCustomEntryInput): Promise<void>;
}

export interface GreenfieldRuntimeDocumentParticipant {
	initialize(
		document: ConversationDocument,
		context: GreenfieldRuntimeDocumentParticipantContext,
	): void | Promise<void>;
	onDocumentChanged(document: ConversationDocument): void | Promise<void>;
	onSessionEvent?(event: StoredSessionEvent): void | Promise<void>;
	dispose?(): void | Promise<void>;
}

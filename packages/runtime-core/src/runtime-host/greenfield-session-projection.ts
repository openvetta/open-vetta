import type { Message } from "@vetta/ai";
import type { HistoryEntry } from "../contracts.js";
import { applyConversationDocumentCommand, selectConversationDocumentMessages } from "../conversation/commands.js";
import { applyStoredEventToConversationDocument, type ConversationDocument } from "../conversation/document.js";
import { projectConversationDocumentHistory } from "../conversation/history-projection.js";
import type { StoredConversation, StoredSessionEvent } from "../kernel/contracts.js";
import type { RuntimeSessionState } from "./session-ports.js";

export interface GreenfieldRuntimeSessionIdentity {
	readonly cwd?: string;
	readonly sessionPath?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
}

export type GreenfieldRuntimeDynamicState = Pick<
	RuntimeSessionState,
	"contextPercent" | "contextWindow" | "activeToolNames"
>;

/** 由 Greenfield Composition Root 提供上下文和当前 Snapshot 的实时只读状态。 */
export interface GreenfieldRuntimeStateSource {
	read(): GreenfieldRuntimeDynamicState;
}

/**
 * 已持久化 Conversation 的同步消息投影。
 *
 * Repository 仍是事实来源；Backend 创建或恢复完成后先加载一次，随后只在
 * `message.appended` 已成功持久化并发布时更新投影，因此 RuntimeHost 无需把
 * 既有同步读取 API 改成异步，也不会在每次读取时重新访问文件。
 */
export class GreenfieldSessionProjection {
	private readonly sessionId: string;
	private readonly messages: Message[];
	private document: ConversationDocument;

	constructor(conversation: StoredConversation, document: ConversationDocument) {
		if (conversation.sessionId !== document.identity.sessionId) {
			throw new Error(
				`Conversation ${conversation.sessionId} does not match document ${document.identity.sessionId}`,
			);
		}
		if (conversation.version !== document.journalVersion) {
			throw new Error(
				`Conversation version ${conversation.version} does not match document journal ${document.journalVersion}`,
			);
		}
		this.sessionId = conversation.sessionId;
		this.messages = [...conversation.messages];
		this.document = document;
	}

	apply(event: StoredSessionEvent): void {
		if (event.sessionId !== this.sessionId) {
			throw new Error(`Projection ${this.sessionId} cannot apply event for ${event.sessionId}`);
		}
		if (event.type === "message.appended") {
			this.messages.push(event.message);
		}
		this.document = applyStoredEventToConversationDocument(this.document, event, this.document.journalVersion + 1);
	}

	replaceDocument(document: ConversationDocument): void {
		if (document.identity.sessionId !== this.sessionId) {
			throw new Error(`Projection ${this.sessionId} cannot use document for ${document.identity.sessionId}`);
		}
		if (document.journalVersion !== this.document.journalVersion) {
			throw new Error(
				`Document journal ${document.journalVersion} does not match projection ${this.document.journalVersion}`,
			);
		}
		this.document = document;
		this.messages.splice(0, this.messages.length, ...selectConversationDocumentMessages(document));
	}

	/** Apply the persisted commutative name command without replacing concurrently projected events. */
	applyPersistedName(name: string): void {
		this.document = applyConversationDocumentCommand(this.document, {
			type: "session.name.set",
			name,
		}).document;
	}

	readMessages(): readonly Message[] {
		return [...this.messages];
	}

	readMessageCount(): number {
		return this.messages.length;
	}

	readHistory(): readonly HistoryEntry[] {
		return projectConversationDocumentHistory(this.document);
	}

	readDocument(): ConversationDocument {
		return this.document;
	}
}

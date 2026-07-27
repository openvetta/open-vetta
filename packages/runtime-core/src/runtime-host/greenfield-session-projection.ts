import type { Message } from "@vetta/ai";
import type { HistoryEntry } from "../contracts.js";
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
	"model" | "thinkingLevel" | "contextPercent" | "contextWindow" | "activeToolNames"
>;

/** 由 Greenfield Composition Root 提供模型、上下文和当前 Snapshot 的实时只读状态。 */
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
		if (conversation.version !== document.revision) {
			throw new Error(
				`Conversation version ${conversation.version} does not match document revision ${document.revision}`,
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
		this.document = applyStoredEventToConversationDocument(this.document, event, this.document.revision + 1);
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
}

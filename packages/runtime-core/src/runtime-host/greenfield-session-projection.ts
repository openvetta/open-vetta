import type { Message } from "@vetta/ai";
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

	constructor(conversation: StoredConversation) {
		this.sessionId = conversation.sessionId;
		this.messages = [...conversation.messages];
	}

	apply(event: StoredSessionEvent): void {
		if (event.sessionId !== this.sessionId) {
			throw new Error(`Projection ${this.sessionId} cannot apply event for ${event.sessionId}`);
		}
		if (event.type === "message.appended") {
			this.messages.push(event.message);
		}
	}

	readMessages(): readonly Message[] {
		return [...this.messages];
	}

	readMessageCount(): number {
		return this.messages.length;
	}
}

import type { StoredConversation } from "./contracts.js";
import { turnProtocolError } from "./errors.js";

export type ConversationRecoveryPlan =
	| { readonly status: "ready" }
	| { readonly status: "interrupt"; readonly turnId: string };

/** 决定已有 Conversation 在重新暴露为可执行 Session 前应如何收敛。 */
export interface ConversationRecoveryPolicy {
	plan(conversation: StoredConversation): ConversationRecoveryPlan;
}

/**
 * 将唯一未闭合 Turn 标记为中断；不重放模型、工具或进程内输入队列。
 * 非法生命周期拒绝恢复，避免在损坏历史上继续追加事件。
 */
export class FailInterruptedTurnRecoveryPolicy implements ConversationRecoveryPolicy {
	plan(conversation: StoredConversation): ConversationRecoveryPlan {
		let activeTurnId: string | undefined;

		for (const event of conversation.events) {
			if (event.sessionId !== conversation.sessionId) {
				throw turnProtocolError(
					`Conversation ${conversation.sessionId} contains an event for session ${event.sessionId}`,
				);
			}

			switch (event.type) {
				case "turn.started":
					if (activeTurnId) {
						throw turnProtocolError(
							`Conversation ${conversation.sessionId} starts turn ${event.turnId} before turn ${activeTurnId} terminates`,
						);
					}
					activeTurnId = event.turnId;
					break;
				case "message.appended":
				case "context.compacted":
					assertActiveTurn(conversation.sessionId, activeTurnId, event.turnId, event.type);
					break;
				case "turn.completed":
				case "turn.cancelled":
				case "turn.failed":
					assertActiveTurn(conversation.sessionId, activeTurnId, event.turnId, event.type);
					activeTurnId = undefined;
					break;
			}
		}

		return activeTurnId ? { status: "interrupt", turnId: activeTurnId } : { status: "ready" };
	}
}

function assertActiveTurn(
	sessionId: string,
	activeTurnId: string | undefined,
	eventTurnId: string,
	eventType: string,
): asserts activeTurnId is string {
	if (!activeTurnId) {
		throw turnProtocolError(
			`Conversation ${sessionId} contains ${eventType} for turn ${eventTurnId} without an active turn`,
		);
	}
	if (activeTurnId !== eventTurnId) {
		throw turnProtocolError(
			`Conversation ${sessionId} contains ${eventType} for turn ${eventTurnId} while turn ${activeTurnId} is active`,
		);
	}
}

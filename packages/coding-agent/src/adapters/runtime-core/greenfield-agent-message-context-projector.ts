import type { AgentMessage } from "@vetta/agent-core";
import type { Message } from "@vetta/ai";
import type { ConversationDocument, RuntimeMessageEnvelope } from "@vetta/runtime-core";
import type { ConversationContextProjector } from "@vetta/runtime-core/kernel";
import { convertToLlm } from "../../core/messages.js";
import {
	buildSessionContextProjection,
	type CustomMessageEntry,
	type SessionEntry,
} from "../../core/session-manager/index.js";

/** 将持久化活动分支恢复为旧 Coding Agent 的完整 AgentMessage 身份。 */
export class CodingAgentGreenfieldAgentMessageContextProjector implements ConversationContextProjector {
	project(document: ConversationDocument): readonly RuntimeMessageEnvelope[] {
		const entries = document.entries.map(toSessionEntry);
		const projection = buildSessionContextProjection(
			entries,
			document.activeLeafId,
			new Map(entries.map((entry) => [entry.id, entry])),
		);
		const documentEntries = new Map(document.entries.map((entry) => [entry.id, entry]));
		return projection.items.map(({ message, entry }) => {
			if (isRuntimeMessage(message)) return { kind: "message", message };
			const source = documentEntries.get(entry.id);
			const modelMessage =
				source?.type === "custom_message" && source.modelVisible === false ? undefined : convertToLlm([message])[0];
			return {
				kind: "opaque",
				identity: message,
				...(modelMessage ? { modelMessage } : {}),
				timestamp: message.timestamp,
			};
		});
	}
}

function toSessionEntry(entry: ConversationDocument["entries"][number]): SessionEntry {
	switch (entry.type) {
		case "message":
			return { ...entry, message: readAgentMessage(entry.message) };
		case "custom_message":
			return { ...entry, content: readCustomMessageContent(entry.content) };
		case "tool_timing":
			return { ...entry, phases: [...entry.phases] };
		case "label":
			return { ...entry, label: entry.label };
		case "compaction": {
			const { reason: _reason, summaryMessage: _summaryMessage, ...legacyEntry } = entry;
			return legacyEntry;
		}
		default:
			return { ...entry };
	}
}

function readAgentMessage(value: unknown): AgentMessage {
	if (!value || typeof value !== "object" || !("role" in value) || typeof value.role !== "string") {
		throw new Error("Conversation message entry is not an AgentMessage");
	}
	if (!AGENT_MESSAGE_ROLES.has(value.role)) {
		throw new Error(`Unsupported conversation message role: ${value.role}`);
	}
	return value as AgentMessage;
}

function readCustomMessageContent(value: unknown): CustomMessageEntry["content"] {
	if (typeof value === "string") return value;
	if (!Array.isArray(value) || !value.every(isContentBlock)) {
		throw new Error("Conversation custom message has invalid content");
	}
	return value;
}

function isContentBlock(
	value: unknown,
): value is CustomMessageEntry["content"] extends readonly (infer T)[] ? T : never {
	if (!value || typeof value !== "object" || !("type" in value)) return false;
	if (value.type === "text") return "text" in value && typeof value.text === "string";
	return (
		value.type === "image" &&
		"data" in value &&
		typeof value.data === "string" &&
		"mimeType" in value &&
		typeof value.mimeType === "string"
	);
}

function isRuntimeMessage(message: AgentMessage): message is Message {
	return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
}

const AGENT_MESSAGE_ROLES = new Set([
	"user",
	"assistant",
	"toolResult",
	"bashExecution",
	"custom",
	"branchSummary",
	"compactionSummary",
]);

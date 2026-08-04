import type { AgentMessage } from "@vetta/agent-core";
import type { Message } from "@vetta/ai";
import type { ConversationDocument, RuntimeMessageEnvelope } from "@vetta/runtime-core";
import type { ConversationContextProjector } from "@vetta/runtime-core/kernel";
import {
	buildSessionContextProjection,
	type CustomMessageEntry,
	type SessionEntry,
} from "../../core/session-manager/index.js";
import { convertToLlm } from "../../model-context/index.js";
import { restoreCodingAgentLegacyAgentMessageEntry } from "./legacy-session-import-normalizer.js";

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
		const envelopes: RuntimeMessageEnvelope[] = [];
		for (const { message, entry } of projection.items) {
			const source = documentEntries.get(entry.id);
			const modelMessage =
				source?.type === "compaction" && source.summaryMessage
					? source.summaryMessage
					: source?.type === "custom_message" && source.modelVisible === false
						? undefined
						: convertToLlm([message])[0];
			if (!modelMessage) {
				envelopes.push({ kind: "opaque", identity: message, timestamp: message.timestamp });
				continue;
			}
			if (isRuntimeMessage(message)) {
				envelopes.push({ kind: "message", message });
				continue;
			}
			envelopes.push({
				kind: "opaque",
				identity: message,
				modelMessage,
				timestamp: message.timestamp,
			});
		}
		return envelopes;
	}
}

/** Restore the active Greenfield branch to the product-level AgentMessage identities used by RPC. */
export function projectCodingAgentGreenfieldMessages(document: ConversationDocument): readonly AgentMessage[] {
	return new CodingAgentGreenfieldAgentMessageContextProjector().project(document).map((envelope) => {
		if (envelope.kind === "message") return envelope.message;
		if (envelope.kind === "opaque") return readAgentMessage(envelope.identity);
		throw new Error("Coding Agent conversation projector returned a context-only envelope");
	});
}

function toSessionEntry(entry: ConversationDocument["entries"][number]): SessionEntry {
	switch (entry.type) {
		case "message":
			return { ...entry, message: readAgentMessage(entry.message) };
		case "custom_message":
			return (
				restoreCodingAgentLegacyAgentMessageEntry(entry) ?? {
					...entry,
					content: readCustomMessageContent(entry.content),
				}
			);
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

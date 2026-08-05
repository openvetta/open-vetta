import type { AgentMessage } from "@vetta/agent-core";
import type { ConversationDocumentEntry } from "@vetta/runtime-core/conversation";
import {
	COMPACTION_SUMMARY_PREFIX,
	COMPACTION_SUMMARY_SUFFIX,
	convertToLlm,
	PROMPT_ATTACHMENT_REFERENCE_TYPE,
	PROMPT_RESOURCE_REFERENCE_TYPE,
} from "../../model-context/index.js";
import type { CodingAgentSessionEntry, CodingAgentSessionMessageEntry } from "../contracts/session-entry.js";

export const CODING_AGENT_EXTENDED_MESSAGE_CONTEXT_TYPE = "vetta.legacy_agent_message";

/** Projects the extension-facing Session entry union into the native Conversation document union. */
export function projectCodingAgentSessionDocumentEntry(entry: CodingAgentSessionEntry): ConversationDocumentEntry {
	switch (entry.type) {
		case "message":
			return projectMessageEntry(entry);
		case "compaction": {
			const timestamp = new Date(entry.timestamp).getTime();
			if (!Number.isFinite(timestamp)) throw new Error(`Invalid Session entry timestamp: ${entry.timestamp}`);
			return {
				...entry,
				summaryMessage: {
					role: "user",
					content: [
						{
							type: "text",
							text: COMPACTION_SUMMARY_PREFIX + entry.summary + COMPACTION_SUMMARY_SUFFIX,
						},
					],
					timestamp,
				},
			};
		}
		case "custom_message":
			return {
				...entry,
				modelVisible:
					entry.customType !== PROMPT_RESOURCE_REFERENCE_TYPE &&
					entry.customType !== PROMPT_ATTACHMENT_REFERENCE_TYPE,
			};
		case "tool_timing":
			return { ...entry, phases: [...entry.phases] };
		case "thinking_level_change":
		case "model_change":
		case "branch_summary":
		case "custom":
		case "label":
		case "session_info":
			return entry;
	}
}

function projectMessageEntry(entry: CodingAgentSessionMessageEntry): ConversationDocumentEntry {
	if (isNativeMessage(entry.message)) return entry;
	const projected = convertToLlm([entry.message])[0];
	return {
		type: "custom_message",
		id: entry.id,
		parentId: entry.parentId,
		timestamp: entry.timestamp,
		customType: CODING_AGENT_EXTENDED_MESSAGE_CONTEXT_TYPE,
		content: projected?.content ?? "",
		details: { agentMessage: entry.message },
		display: entry.message.role === "custom" ? entry.message.display : true,
		modelVisible: projected !== undefined,
	};
}

function isNativeMessage(message: AgentMessage): boolean {
	return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
}

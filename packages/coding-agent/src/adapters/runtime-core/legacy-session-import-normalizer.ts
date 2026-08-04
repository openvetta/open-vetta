import { isDeepStrictEqual } from "node:util";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { AgentMessage } from "@vetta/agent-core";
import type { ConversationDocumentCustomMessageEntry } from "@vetta/runtime-core/conversation";
import {
	COMPACTION_SUMMARY_PREFIX,
	COMPACTION_SUMMARY_SUFFIX,
	convertToLlm,
	PROMPT_ATTACHMENT_REFERENCE_TYPE,
	PROMPT_RESOURCE_REFERENCE_TYPE,
} from "../../model-context/index.js";
import type { CodingAgentSessionMessageEntry as SessionMessageEntry } from "../../sessions/index.js";

export const CODING_AGENT_LEGACY_AGENT_MESSAGE_CONTEXT_TYPE = "vetta.legacy_agent_message";

const TextContentSchema = Type.Object(
	{
		type: Type.Literal("text"),
		text: Type.String(),
		textSignature: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const ImageContentSchema = Type.Object(
	{
		type: Type.Literal("image"),
		data: Type.String(),
		mimeType: Type.String(),
	},
	{ additionalProperties: false },
);

const CustomContentSchema = Type.Union([
	Type.String(),
	Type.Array(Type.Union([TextContentSchema, ImageContentSchema])),
]);

const LegacyExtendedAgentMessageSchema = Type.Union([
	Type.Object(
		{
			role: Type.Literal("bashExecution"),
			command: Type.String(),
			output: Type.String(),
			exitCode: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
			cancelled: Type.Boolean(),
			truncated: Type.Boolean(),
			fullOutputPath: Type.Optional(Type.String()),
			timestamp: Type.Number(),
			excludeFromContext: Type.Optional(Type.Boolean()),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			role: Type.Literal("custom"),
			customType: Type.String({ minLength: 1 }),
			content: CustomContentSchema,
			display: Type.Boolean(),
			details: Type.Optional(Type.Unknown()),
			timestamp: Type.Number(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			role: Type.Literal("branchSummary"),
			summary: Type.String(),
			fromId: Type.String({ minLength: 1 }),
			timestamp: Type.Number(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			role: Type.Literal("compactionSummary"),
			summary: Type.String(),
			tokensBefore: Type.Number({ minimum: 0 }),
			timestamp: Type.Number(),
		},
		{ additionalProperties: false },
	),
]);

const ImportedAgentMessageDetailsSchema = Type.Object(
	{ agentMessage: LegacyExtendedAgentMessageSchema },
	{ additionalProperties: false },
);

/** Coding Agent-owned normalization policy for official JSONL v1-v3 entry variants. */
export function normalizeCodingAgentLegacySessionEntry(
	entry: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	if (entry.type === "message" && Value.Check(LegacyExtendedAgentMessageSchema, entry.message)) {
		return importedAgentMessageEntry(entry, entry.message as AgentMessage);
	}
	if (
		entry.type === "custom_message" &&
		typeof entry.customType === "string" &&
		typeof entry.modelVisible !== "boolean"
	) {
		return {
			...entry,
			modelVisible: !isLegacyModelInvisibleCustomType(entry.customType),
		};
	}
	if (entry.type === "compaction" && typeof entry.summary === "string" && entry.summaryMessage === undefined) {
		const timestamp = new Date(String(entry.timestamp)).getTime();
		if (!Number.isFinite(timestamp)) return entry;
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
	return entry;
}

/** Restore the original Coding Agent identity stored by the import normalizer. */
export function restoreCodingAgentLegacyAgentMessageEntry(
	entry: ConversationDocumentCustomMessageEntry,
): SessionMessageEntry | undefined {
	if (
		entry.customType !== CODING_AGENT_LEGACY_AGENT_MESSAGE_CONTEXT_TYPE ||
		!Value.Check(ImportedAgentMessageDetailsSchema, entry.details)
	) {
		return undefined;
	}
	const message = entry.details.agentMessage as AgentMessage;
	const projected = convertToLlm([message])[0];
	if (
		entry.modelVisible !== (projected !== undefined) ||
		!isDeepStrictEqual(entry.content, projected?.content ?? "")
	) {
		return undefined;
	}
	return {
		type: "message",
		id: entry.id,
		parentId: entry.parentId,
		timestamp: entry.timestamp,
		message,
	};
}

function importedAgentMessageEntry(
	entry: Readonly<Record<string, unknown>>,
	message: AgentMessage,
): Readonly<Record<string, unknown>> {
	const projected = convertToLlm([message])[0];
	const { message: _message, ...entryBase } = entry;
	return {
		...entryBase,
		type: "custom_message",
		customType: CODING_AGENT_LEGACY_AGENT_MESSAGE_CONTEXT_TYPE,
		content: projected?.content ?? "",
		details: { agentMessage: message },
		display: message.role === "custom" ? message.display : true,
		modelVisible: projected !== undefined,
	};
}

function isLegacyModelInvisibleCustomType(customType: string): boolean {
	return customType === PROMPT_RESOURCE_REFERENCE_TYPE || customType === PROMPT_ATTACHMENT_REFERENCE_TYPE;
}

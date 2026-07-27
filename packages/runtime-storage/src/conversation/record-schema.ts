import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const LEGACY_CONVERSATION_SCHEMA_VERSION = 1;
export const CONVERSATION_SCHEMA_VERSION = 2;

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

const ThinkingContentSchema = Type.Object(
	{
		type: Type.Literal("thinking"),
		thinking: Type.String(),
		thinkingSignature: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const ToolCallSchema = Type.Object(
	{
		type: Type.Literal("toolCall"),
		id: Type.String(),
		name: Type.String(),
		arguments: Type.Record(Type.String(), Type.Unknown()),
		thoughtSignature: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const CostSchema = Type.Object(
	{
		input: Type.Number(),
		output: Type.Number(),
		cacheRead: Type.Number(),
		cacheWrite: Type.Number(),
		total: Type.Number(),
	},
	{ additionalProperties: false },
);

const UsageSchema = Type.Object(
	{
		input: Type.Number(),
		output: Type.Number(),
		cacheRead: Type.Number(),
		cacheWrite: Type.Number(),
		totalTokens: Type.Number(),
		cost: CostSchema,
	},
	{ additionalProperties: false },
);

const StopReasonSchema = Type.Union([
	Type.Literal("stop"),
	Type.Literal("length"),
	Type.Literal("toolUse"),
	Type.Literal("error"),
	Type.Literal("aborted"),
]);

const UserMessageSchema = Type.Object(
	{
		role: Type.Literal("user"),
		content: Type.Union([Type.String(), Type.Array(Type.Union([TextContentSchema, ImageContentSchema]))]),
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

const AssistantMessageSchema = Type.Object(
	{
		role: Type.Literal("assistant"),
		content: Type.Array(Type.Union([TextContentSchema, ThinkingContentSchema, ToolCallSchema])),
		api: Type.String(),
		provider: Type.String(),
		model: Type.String(),
		usage: UsageSchema,
		stopReason: StopReasonSchema,
		errorMessage: Type.Optional(Type.String()),
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

const ToolResultMessageSchema = Type.Object(
	{
		role: Type.Literal("toolResult"),
		toolCallId: Type.String(),
		toolName: Type.String(),
		content: Type.Array(Type.Union([TextContentSchema, ImageContentSchema])),
		details: Type.Optional(Type.Unknown()),
		isError: Type.Boolean(),
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

export const ConversationMessageSchema = Type.Union([
	UserMessageSchema,
	AssistantMessageSchema,
	ToolResultMessageSchema,
]);

const CompactionRecordSchema = Type.Object(
	{
		id: Type.String(),
		sourceMessageCount: Type.Integer({ minimum: 0 }),
		resultMessageCount: Type.Integer({ minimum: 0 }),
		summary: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const TurnStartedEventSchema = Type.Object(
	{
		type: Type.Literal("turn.started"),
		sessionId: Type.String(),
		turnId: Type.String(),
		snapshotId: Type.String(),
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

const MessageAppendedEventSchema = Type.Object(
	{
		type: Type.Literal("message.appended"),
		sessionId: Type.String(),
		turnId: Type.String(),
		message: ConversationMessageSchema,
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

const ContextCompactedEventSchema = Type.Object(
	{
		type: Type.Literal("context.compacted"),
		sessionId: Type.String(),
		turnId: Type.String(),
		record: CompactionRecordSchema,
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

const TurnCompletedEventSchema = Type.Object(
	{
		type: Type.Literal("turn.completed"),
		sessionId: Type.String(),
		turnId: Type.String(),
		stopReason: StopReasonSchema,
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

const TurnCancelledEventSchema = Type.Object(
	{
		type: Type.Literal("turn.cancelled"),
		sessionId: Type.String(),
		turnId: Type.String(),
		reason: Type.Optional(Type.String()),
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

const TurnFailedEventSchema = Type.Object(
	{
		type: Type.Literal("turn.failed"),
		sessionId: Type.String(),
		turnId: Type.String(),
		error: Type.Object(
			{
				code: Type.String(),
				message: Type.String(),
			},
			{ additionalProperties: false },
		),
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);

export const StoredSessionEventSchema = Type.Union([
	TurnStartedEventSchema,
	MessageAppendedEventSchema,
	ContextCompactedEventSchema,
	TurnCompletedEventSchema,
	TurnCancelledEventSchema,
	TurnFailedEventSchema,
]);

const ConversationFileHeaderSchemaV1 = Type.Object(
	{
		recordType: Type.Literal("conversation.header"),
		schemaVersion: Type.Literal(LEGACY_CONVERSATION_SCHEMA_VERSION),
		sessionId: Type.String(),
		createdAt: Type.Number(),
	},
	{ additionalProperties: false },
);

export const CurrentConversationFileHeaderSchema = Type.Object(
	{
		recordType: Type.Literal("conversation.header"),
		schemaVersion: Type.Literal(CONVERSATION_SCHEMA_VERSION),
		sessionId: Type.String(),
		createdAt: Type.Number(),
		cwd: Type.Optional(Type.String()),
		parentSessionPath: Type.Optional(Type.String()),
		parentEntryId: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const ConversationFileHeaderSchema = Type.Union([
	ConversationFileHeaderSchemaV1,
	CurrentConversationFileHeaderSchema,
]);

const ConversationEventRecordSchemaV1 = Type.Object(
	{
		recordType: Type.Literal("conversation.event"),
		schemaVersion: Type.Literal(LEGACY_CONVERSATION_SCHEMA_VERSION),
		sequence: Type.Integer({ minimum: 1 }),
		event: StoredSessionEventSchema,
	},
	{ additionalProperties: false },
);

export const ConversationDocumentEntryReferenceSchema = Type.Object(
	{
		id: Type.String(),
		parentId: Type.Union([Type.String(), Type.Null()]),
		timestamp: Type.String(),
	},
	{ additionalProperties: false },
);

export const CurrentConversationEventRecordSchema = Type.Object(
	{
		recordType: Type.Literal("conversation.event"),
		schemaVersion: Type.Literal(CONVERSATION_SCHEMA_VERSION),
		sequence: Type.Integer({ minimum: 1 }),
		event: StoredSessionEventSchema,
		documentEntry: Type.Union([ConversationDocumentEntryReferenceSchema, Type.Null()]),
	},
	{ additionalProperties: false },
);

export const ConversationEventRecordSchema = Type.Union([
	ConversationEventRecordSchemaV1,
	CurrentConversationEventRecordSchema,
]);

export const ConversationDocumentCommandSchema = Type.Union([
	Type.Object(
		{
			type: Type.Literal("active_leaf.set"),
			entryId: Type.Union([Type.String(), Type.Null()]),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			type: Type.Literal("branch.select"),
			entryId: Type.String(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			type: Type.Literal("message.delete"),
			entryId: Type.String(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			type: Type.Literal("user_turn.replace"),
			entryId: Type.String(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			type: Type.Literal("session.name.set"),
			name: Type.String(),
		},
		{ additionalProperties: false },
	),
]);

export const ConversationDocumentOperationRecordSchema = Type.Object(
	{
		recordType: Type.Literal("conversation.document.operation"),
		schemaVersion: Type.Literal(CONVERSATION_SCHEMA_VERSION),
		revision: Type.Integer({ minimum: 1 }),
		command: ConversationDocumentCommandSchema,
	},
	{ additionalProperties: false },
);

export const ConversationSnapshotSchema = Type.Object(
	{
		sessionId: Type.String(),
		version: Type.Integer({ minimum: 0 }),
		messages: Type.Array(ConversationMessageSchema),
		createdAt: Type.Number(),
	},
	{ additionalProperties: false },
);

export const ConversationSnapshotRecordSchema = Type.Object(
	{
		recordType: Type.Literal("conversation.snapshot"),
		schemaVersion: Type.Literal(CONVERSATION_SCHEMA_VERSION),
		snapshot: ConversationSnapshotSchema,
	},
	{ additionalProperties: false },
);

export type ConversationFileHeader = Static<typeof CurrentConversationFileHeaderSchema>;
export type ReadConversationFileHeader = Static<typeof ConversationFileHeaderSchema>;
export type ConversationEventRecord = Static<typeof CurrentConversationEventRecordSchema>;
export type ReadConversationEventRecord = Static<typeof ConversationEventRecordSchema>;
export type ConversationDocumentOperationRecord = Static<typeof ConversationDocumentOperationRecordSchema>;
export type ConversationSnapshotRecord = Static<typeof ConversationSnapshotRecordSchema>;

export function isConversationFileHeader(value: unknown): value is ReadConversationFileHeader {
	return Value.Check(ConversationFileHeaderSchema, value);
}

export function isConversationEventRecord(value: unknown): value is ReadConversationEventRecord {
	return Value.Check(ConversationEventRecordSchema, value);
}

export function isConversationDocumentOperationRecord(value: unknown): value is ConversationDocumentOperationRecord {
	return Value.Check(ConversationDocumentOperationRecordSchema, value);
}

export function isConversationDocumentCommand(
	value: unknown,
): value is Static<typeof ConversationDocumentCommandSchema> {
	return Value.Check(ConversationDocumentCommandSchema, value);
}

export function isConversationSnapshot(value: unknown): value is Static<typeof ConversationSnapshotSchema> {
	return Value.Check(ConversationSnapshotSchema, value);
}

export function isStoredSessionEvent(value: unknown): value is Static<typeof StoredSessionEventSchema> {
	return Value.Check(StoredSessionEventSchema, value);
}

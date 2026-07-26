export const CONVERSATION_STORAGE_ERROR_CODES = {
	ALREADY_EXISTS: "conversation_already_exists",
	CLOSED: "conversation_repository_closed",
	CORRUPT: "conversation_corrupt",
	INVALID_EVENT: "conversation_invalid_event",
	NOT_FOUND: "conversation_not_found",
	VERSION_CONFLICT: "conversation_version_conflict",
} as const;

export type ConversationStorageErrorCode =
	(typeof CONVERSATION_STORAGE_ERROR_CODES)[keyof typeof CONVERSATION_STORAGE_ERROR_CODES];

export class ConversationStorageError extends Error {
	readonly code: ConversationStorageErrorCode;

	constructor(code: ConversationStorageErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ConversationStorageError";
		this.code = code;
	}
}

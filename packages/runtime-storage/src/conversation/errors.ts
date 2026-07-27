export const CONVERSATION_STORAGE_ERROR_CODES = {
	ALREADY_EXISTS: "conversation_already_exists",
	CLOSED: "conversation_repository_closed",
	CORRUPT: "conversation_corrupt",
	DOCUMENT_VERSION_CONFLICT: "conversation_document_version_conflict",
	INVALID_COMMAND: "conversation_invalid_command",
	INVALID_EVENT: "conversation_invalid_event",
	NOT_FOUND: "conversation_not_found",
	READ_ONLY: "conversation_read_only",
	VERSION_CONFLICT: "conversation_version_conflict",
	WRITE_LOCK_TIMEOUT: "conversation_write_lock_timeout",
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

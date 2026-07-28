import {
	applyConversationDocumentCommand,
	applyStoredEventToConversationDocument,
	type ConversationDocument,
	type ConversationDocumentEntryReference,
	createEmptyConversationDocument,
	nativeConversationEntryId,
	selectConversationDocumentModelMessages,
} from "@vetta/runtime-core/conversation";
import type { StoredConversation, StoredSessionEvent } from "@vetta/runtime-core/kernel";
import { CONVERSATION_STORAGE_ERROR_CODES, ConversationStorageError } from "./errors.js";
import {
	CONVERSATION_SCHEMA_VERSION,
	type ConversationDocumentOperationRecord,
	type ConversationEventRecord,
	type ConversationFileHeader,
	isConversationDocumentOperationRecord,
	isConversationEventRecord,
	isConversationFileHeader,
	isStoredSessionEvent,
	type ReadConversationEventRecord,
	type ReadConversationFileHeader,
} from "./record-schema.js";

type ConversationBodyRecord = ReadConversationEventRecord | ConversationDocumentOperationRecord;

export interface ParsedConversationFile {
	readonly header: ReadConversationFileHeader;
	readonly records: readonly ConversationBodyRecord[];
	readonly eventRecords: readonly ReadConversationEventRecord[];
}

export function parseConversationFile(text: string, sessionId: string): ParsedConversationFile {
	const records = parseRecords(text, sessionId);
	const [header, ...body] = records;
	if (!isConversationFileHeader(header) || header.sessionId !== sessionId) {
		throw corruptConversation(sessionId, "missing or mismatched header");
	}

	const eventRecords: ReadConversationEventRecord[] = [];
	const conversationRecords: ConversationBodyRecord[] = [];
	const documentEntryIds = new Set<string>();
	let expectedEventSequence = 1;
	for (let index = 0; index < body.length; index += 1) {
		const record = body[index];
		if (isConversationDocumentOperationRecord(record)) {
			if (header.schemaVersion !== CONVERSATION_SCHEMA_VERSION) {
				throw corruptConversation(sessionId, `document operation is not supported at line ${index + 2}`);
			}
			if (record.command.type === "custom.append") {
				if (documentEntryIds.has(record.command.entryId)) {
					throw corruptConversation(sessionId, `duplicate document entry at line ${index + 2}`);
				}
				documentEntryIds.add(record.command.entryId);
			}
			conversationRecords.push(record);
			continue;
		}
		if (!isConversationEventRecord(record)) {
			throw corruptConversation(sessionId, `invalid conversation record at line ${index + 2}`);
		}
		if (record.schemaVersion !== header.schemaVersion) {
			throw corruptConversation(sessionId, `event schema version does not match header at line ${index + 2}`);
		}
		if (record.sequence !== expectedEventSequence) {
			throw corruptConversation(
				sessionId,
				`event sequence ${record.sequence} does not match expected ${expectedEventSequence}`,
			);
		}
		expectedEventSequence += 1;
		validateConversationEvent(sessionId, record.event);
		if (record.schemaVersion === CONVERSATION_SCHEMA_VERSION) {
			const hasDocumentEntry = record.documentEntry !== null;
			if (hasDocumentEntry !== isConversationDocumentEntryEvent(record.event)) {
				throw corruptConversation(sessionId, `event has inconsistent document entry at line ${index + 2}`);
			}
			if (record.documentEntry) {
				if (documentEntryIds.has(record.documentEntry.id)) {
					throw corruptConversation(sessionId, `duplicate document entry at line ${index + 2}`);
				}
				if (record.documentEntry.parentId && !documentEntryIds.has(record.documentEntry.parentId)) {
					throw corruptConversation(sessionId, `unknown document parent at line ${index + 2}`);
				}
				documentEntryIds.add(record.documentEntry.id);
			}
		}
		eventRecords.push(record);
		conversationRecords.push(record);
	}

	return { header, records: conversationRecords, eventRecords };
}

export function validateConversationEvent(sessionId: string, event: StoredSessionEvent): void {
	if (!isStoredSessionEvent(event)) {
		throw new ConversationStorageError(
			CONVERSATION_STORAGE_ERROR_CODES.INVALID_EVENT,
			`Event for ${sessionId} does not match the stored session event schema`,
		);
	}
	if (event.sessionId !== sessionId) {
		throw new ConversationStorageError(
			CONVERSATION_STORAGE_ERROR_CODES.INVALID_EVENT,
			`Event session ${event.sessionId} does not match ${sessionId}`,
		);
	}
}

export function encodeConversationSessionId(sessionId: string): string {
	return Buffer.from(sessionId, "utf8").toString("base64url");
}

export function serializeConversationLine(
	value:
		| ConversationFileHeader
		| ConversationEventRecord
		| ReadConversationEventRecord
		| ConversationDocumentOperationRecord,
): string {
	return `${JSON.stringify(value)}\n`;
}

export function conversationFromFile(sessionId: string, file: ParsedConversationFile): StoredConversation {
	const events = file.eventRecords.map((record) => record.event);
	const document = documentFromFile(sessionId, file);
	return {
		sessionId,
		createdAt: file.header.createdAt,
		version: events.length,
		messages: selectConversationDocumentModelMessages(document),
		events,
	};
}

export function documentFromFile(sessionId: string, file: ParsedConversationFile): ConversationDocument {
	let document = createEmptyConversationDocument({
		sessionId,
		createdAt: file.header.createdAt,
		...(file.header.schemaVersion === CONVERSATION_SCHEMA_VERSION
			? {
					cwd: file.header.cwd,
					parentSessionPath: file.header.parentSessionPath,
					parentEntryId: file.header.parentEntryId,
				}
			: {}),
	});
	try {
		for (const record of file.records) {
			if (record.recordType === "conversation.event") {
				const reference = record.schemaVersion === CONVERSATION_SCHEMA_VERSION ? record.documentEntry : undefined;
				document = applyStoredEventToConversationDocument(
					document,
					record.event,
					record.sequence,
					reference ?? undefined,
				);
				continue;
			}
			const result = applyConversationDocumentCommand(document, record.command, record.revision);
			if (!result.changed) throw new Error(`Document operation ${record.revision} is a persisted no-op`);
			document = result.document;
		}
		return document;
	} catch (error) {
		throw corruptConversation(sessionId, "invalid conversation document projection", error);
	}
}

export function createDocumentEntryReference(
	event: StoredSessionEvent,
	sequence: number,
	parentId: string | null,
): ConversationDocumentEntryReference | null {
	if (!isConversationDocumentEntryEvent(event)) return null;
	return {
		id: nativeConversationEntryId(sequence),
		parentId,
		timestamp: new Date(event.timestamp).toISOString(),
	};
}

function isConversationDocumentEntryEvent(event: StoredSessionEvent): boolean {
	return (
		event.type === "message.appended" ||
		event.type === "context.appended" ||
		(event.type === "context.compacted" && "firstKeptEntryId" in event.record)
	);
}

function parseRecords(text: string, sessionId: string): unknown[] {
	if (!text.endsWith("\n")) {
		throw corruptConversation(sessionId, "file does not end with a complete record");
	}
	const lines = text.slice(0, -1).split(/\r?\n/);
	if (lines.some((line) => line.length === 0)) {
		throw corruptConversation(sessionId, "file contains an empty record");
	}
	return lines.map((line, index) => {
		try {
			const parsed: unknown = JSON.parse(line);
			return parsed;
		} catch (error) {
			throw corruptConversation(sessionId, `invalid JSON at line ${index + 1}`, error);
		}
	});
}

function corruptConversation(sessionId: string, details: string, cause?: unknown): ConversationStorageError {
	return new ConversationStorageError(
		CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
		`Conversation ${sessionId} is corrupt: ${details}`,
		cause === undefined ? undefined : { cause },
	);
}

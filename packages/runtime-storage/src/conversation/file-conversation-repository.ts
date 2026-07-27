import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	applyStoredEventToConversationDocument,
	type ConversationDocument,
	type ConversationDocumentEntryReference,
	type ConversationDocumentReader,
	createEmptyConversationDocument,
	nativeConversationEntryId,
} from "@vetta/runtime-core/conversation";
import type {
	AppendResult,
	ConversationMetadata,
	ConversationRepository,
	ConversationSnapshot,
	CreateConversationInput,
	StoredConversation,
	StoredSessionEvent,
} from "@vetta/runtime-core/kernel";
import { CONVERSATION_STORAGE_ERROR_CODES, ConversationStorageError } from "./errors.js";
import {
	CONVERSATION_SCHEMA_VERSION,
	type ConversationEventRecord,
	type ConversationFileHeader,
	type ConversationSnapshotRecord,
	isConversationEventRecord,
	isConversationFileHeader,
	isConversationSnapshot,
	isStoredSessionEvent,
	type ReadConversationEventRecord,
	type ReadConversationFileHeader,
} from "./record-schema.js";

export interface FileConversationRepositoryOptions {
	readonly rootDir: string;
}

export class FileConversationRepository implements ConversationRepository, ConversationDocumentReader {
	private readonly rootDir: string;
	private readonly queues = new Map<string, Promise<void>>();
	private closed = false;

	constructor(options: FileConversationRepositoryOptions) {
		this.rootDir = resolve(options.rootDir);
	}

	/** Stable absolute path used by a composition root as the session identity path. */
	resolveConversationPath(sessionId: string): string {
		return this.conversationPath(sessionId);
	}

	async create(input: CreateConversationInput): Promise<ConversationMetadata> {
		this.assertOpen();
		return this.exclusive(input.sessionId, async () => {
			await this.ensureRoot();
			const header: ConversationFileHeader = {
				recordType: "conversation.header",
				schemaVersion: CONVERSATION_SCHEMA_VERSION,
				sessionId: input.sessionId,
				createdAt: input.createdAt,
			};
			const path = this.conversationPath(input.sessionId);
			let handle: FileHandle | undefined;
			try {
				handle = await open(path, "wx");
				await handle.writeFile(serializeLine(header), "utf8");
			} catch (error) {
				if (nodeErrorCode(error) === "EEXIST") {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.ALREADY_EXISTS,
						`Conversation already exists: ${input.sessionId}`,
						{ cause: error },
					);
				}
				throw error;
			} finally {
				await handle?.close();
			}
			return {
				sessionId: input.sessionId,
				createdAt: input.createdAt,
				version: 0,
			};
		});
	}

	async load(sessionId: string): Promise<StoredConversation> {
		this.assertOpen();
		return this.exclusive(sessionId, () => this.readConversation(sessionId));
	}

	async readDocument(sessionId: string): Promise<ConversationDocument> {
		this.assertOpen();
		return this.exclusive(sessionId, async () => {
			const { header, eventRecords } = await this.readConversationFile(sessionId);
			let document = createEmptyConversationDocument({
				sessionId,
				createdAt: header.createdAt,
				...(header.schemaVersion === CONVERSATION_SCHEMA_VERSION
					? {
							cwd: header.cwd,
							parentSessionPath: header.parentSessionPath,
							parentEntryId: header.parentEntryId,
						}
					: {}),
			});
			for (const record of eventRecords) {
				const reference = record.schemaVersion === CONVERSATION_SCHEMA_VERSION ? record.documentEntry : undefined;
				document = applyStoredEventToConversationDocument(
					document,
					record.event,
					record.sequence,
					reference ?? undefined,
				);
			}
			return document;
		});
	}

	async append(
		sessionId: string,
		expectedVersion: number,
		events: readonly StoredSessionEvent[],
	): Promise<AppendResult> {
		this.assertOpen();
		return this.exclusive(sessionId, async () => {
			const file = await this.readConversationFile(sessionId);
			const conversation = conversationFromFile(sessionId, file);
			if (conversation.version !== expectedVersion) {
				throw new ConversationStorageError(
					CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
					`Conversation ${sessionId} is at version ${conversation.version}, expected ${expectedVersion}`,
				);
			}
			for (const event of events) validateEvent(sessionId, event);
			if (events.length === 0) return { version: expectedVersion };

			let parentId = lastNativeDocumentEntryId(file.eventRecords);
			const records = events.map((event, index) => {
				const sequence = expectedVersion + index + 1;
				if (file.header.schemaVersion !== CONVERSATION_SCHEMA_VERSION) {
					return {
						recordType: "conversation.event" as const,
						schemaVersion: file.header.schemaVersion,
						sequence,
						event,
					};
				}
				const documentEntry = createDocumentEntryReference(event, sequence, parentId);
				if (documentEntry) parentId = documentEntry.id;
				return {
					recordType: "conversation.event" as const,
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					sequence,
					event,
					documentEntry,
				} satisfies ConversationEventRecord;
			});
			await appendFile(this.conversationPath(sessionId), records.map(serializeLine).join(""), "utf8");
			return {
				version: expectedVersion + events.length,
			};
		});
	}

	async saveSnapshot(sessionId: string, snapshot: ConversationSnapshot): Promise<void> {
		this.assertOpen();
		await this.exclusive(sessionId, async () => {
			if (!isConversationSnapshot(snapshot)) {
				throw new ConversationStorageError(
					CONVERSATION_STORAGE_ERROR_CODES.INVALID_EVENT,
					`Snapshot for ${sessionId} does not match the conversation snapshot schema`,
				);
			}
			if (snapshot.sessionId !== sessionId) {
				throw new ConversationStorageError(
					CONVERSATION_STORAGE_ERROR_CODES.INVALID_EVENT,
					`Snapshot session ${snapshot.sessionId} does not match ${sessionId}`,
				);
			}
			const conversation = await this.readConversation(sessionId);
			if (snapshot.version !== conversation.version) {
				throw new ConversationStorageError(
					CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
					`Snapshot version ${snapshot.version} does not match conversation version ${conversation.version}`,
				);
			}
			await this.ensureRoot();
			const record: ConversationSnapshotRecord = {
				recordType: "conversation.snapshot",
				schemaVersion: CONVERSATION_SCHEMA_VERSION,
				snapshot,
			};
			const target = this.snapshotPath(sessionId);
			const temporary = `${target}.${randomUUID()}.tmp`;
			try {
				await writeFile(temporary, `${JSON.stringify(record)}\n`, {
					encoding: "utf8",
					flag: "wx",
				});
				await rename(temporary, target);
			} catch (error) {
				await rm(temporary, { force: true });
				throw error;
			}
		});
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		await Promise.all(this.queues.values());
	}

	private async readConversation(sessionId: string): Promise<StoredConversation> {
		return conversationFromFile(sessionId, await this.readConversationFile(sessionId));
	}

	private async readConversationFile(sessionId: string): Promise<ParsedConversationFile> {
		let text: string;
		try {
			text = await readFile(this.conversationPath(sessionId), "utf8");
		} catch (error) {
			if (nodeErrorCode(error) === "ENOENT") {
				throw new ConversationStorageError(
					CONVERSATION_STORAGE_ERROR_CODES.NOT_FOUND,
					`Conversation not found: ${sessionId}`,
					{ cause: error },
				);
			}
			throw error;
		}

		const records = parseRecords(text, sessionId);
		const [header, ...events] = records;
		if (!isConversationFileHeader(header) || header.sessionId !== sessionId) {
			throw corruptConversation(sessionId, "missing or mismatched header");
		}

		const eventRecords: ReadConversationEventRecord[] = [];
		const documentEntryIds = new Set<string>();
		for (let index = 0; index < events.length; index += 1) {
			const record = events[index];
			if (!isConversationEventRecord(record)) {
				throw corruptConversation(sessionId, `invalid event record at line ${index + 2}`);
			}
			if (record.schemaVersion !== header.schemaVersion) {
				throw corruptConversation(sessionId, `event schema version does not match header at line ${index + 2}`);
			}
			const expectedSequence = index + 1;
			if (record.sequence !== expectedSequence) {
				throw corruptConversation(
					sessionId,
					`event sequence ${record.sequence} does not match expected ${expectedSequence}`,
				);
			}
			validateEvent(sessionId, record.event);
			if (record.schemaVersion === CONVERSATION_SCHEMA_VERSION) {
				const hasDocumentEntry = record.documentEntry !== null;
				if (hasDocumentEntry !== (record.event.type === "message.appended")) {
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
		}

		return { header, eventRecords };
	}

	private async ensureRoot(): Promise<void> {
		await mkdir(this.rootDir, { recursive: true });
	}

	private conversationPath(sessionId: string): string {
		return join(this.rootDir, `${encodeSessionId(sessionId)}.conversation.jsonl`);
	}

	private snapshotPath(sessionId: string): string {
		return join(this.rootDir, `${encodeSessionId(sessionId)}.snapshot.json`);
	}

	private assertOpen(): void {
		if (this.closed) {
			throw new ConversationStorageError(
				CONVERSATION_STORAGE_ERROR_CODES.CLOSED,
				"Conversation repository is closed",
			);
		}
	}

	private async exclusive<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(sessionId) ?? Promise.resolve();
		let release = () => {};
		const gate = new Promise<void>((resolveGate) => {
			release = resolveGate;
		});
		const queued = previous.then(() => gate);
		this.queues.set(sessionId, queued);
		await previous;
		try {
			return await operation();
		} finally {
			release();
			if (this.queues.get(sessionId) === queued) {
				this.queues.delete(sessionId);
			}
		}
	}
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

function validateEvent(sessionId: string, event: StoredSessionEvent): void {
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

function encodeSessionId(sessionId: string): string {
	return Buffer.from(sessionId, "utf8").toString("base64url");
}

function serializeLine(value: ConversationFileHeader | ConversationEventRecord | ReadConversationEventRecord): string {
	return `${JSON.stringify(value)}\n`;
}

interface ParsedConversationFile {
	readonly header: ReadConversationFileHeader;
	readonly eventRecords: readonly ReadConversationEventRecord[];
}

function conversationFromFile(sessionId: string, file: ParsedConversationFile): StoredConversation {
	const events = file.eventRecords.map((record) => record.event);
	return {
		sessionId,
		createdAt: file.header.createdAt,
		version: events.length,
		messages: events.flatMap((event) => (event.type === "message.appended" ? [event.message] : [])),
		events,
	};
}

function lastNativeDocumentEntryId(records: readonly ReadConversationEventRecord[]): string | null {
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (!record || record.event.type !== "message.appended") continue;
		if (record.schemaVersion === CONVERSATION_SCHEMA_VERSION) return record.documentEntry?.id ?? null;
		return nativeConversationEntryId(record.sequence);
	}
	return null;
}

function createDocumentEntryReference(
	event: StoredSessionEvent,
	sequence: number,
	parentId: string | null,
): ConversationDocumentEntryReference | null {
	if (event.type !== "message.appended") return null;
	return {
		id: nativeConversationEntryId(sequence),
		parentId,
		timestamp: new Date(event.timestamp).toISOString(),
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function nodeErrorCode(error: unknown): string | undefined {
	if (!isObject(error)) return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}

function corruptConversation(sessionId: string, details: string, cause?: unknown): ConversationStorageError {
	return new ConversationStorageError(
		CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
		`Conversation ${sessionId} is corrupt: ${details}`,
		cause === undefined ? undefined : { cause },
	);
}

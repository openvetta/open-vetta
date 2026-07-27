import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	applyConversationDocumentCommand,
	applyStoredEventToConversationDocument,
	type ConversationDocument,
	type ConversationDocumentCommand,
	type ConversationDocumentCommandResult,
	type ConversationDocumentForkResult,
	type ConversationDocumentStore,
	conversationDocumentEntry,
	extractConversationEntryText,
	resolveConversationUserTurnTip,
	selectConversationDocumentEntries,
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
import {
	conversationFromFile,
	createDocumentEntryReference,
	documentFromFile,
	encodeConversationSessionId,
	type ParsedConversationFile,
	parseConversationFile,
	serializeConversationLine,
	validateConversationEvent,
} from "./conversation-file-codec.js";
import { acquireConversationFileLock } from "./conversation-file-lock.js";
import { CONVERSATION_STORAGE_ERROR_CODES, ConversationStorageError } from "./errors.js";
import { nodeErrorCode } from "./node-error-code.js";
import {
	CONVERSATION_SCHEMA_VERSION,
	type ConversationDocumentOperationRecord,
	type ConversationEventRecord,
	type ConversationFileHeader,
	type ConversationSnapshotRecord,
	isConversationDocumentCommand,
	isConversationSnapshot,
} from "./record-schema.js";

export interface FileConversationRepositoryOptions {
	readonly rootDir: string;
}

export class FileConversationRepository implements ConversationRepository, ConversationDocumentStore {
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
				await handle.writeFile(serializeConversationLine(header), "utf8");
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
		return this.exclusive(sessionId, () => this.withFileLock(sessionId, () => this.readConversation(sessionId)));
	}

	async readDocument(sessionId: string): Promise<ConversationDocument> {
		this.assertOpen();
		return this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () =>
				documentFromFile(sessionId, await this.readConversationFile(sessionId)),
			),
		);
	}

	async execute(
		sessionId: string,
		expectedRevision: number | null,
		command: ConversationDocumentCommand,
	): Promise<ConversationDocumentCommandResult> {
		this.assertOpen();
		if (!isConversationDocumentCommand(command)) {
			throw new ConversationStorageError(
				CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND,
				`Command for ${sessionId} does not match the conversation document command schema`,
			);
		}
		if (expectedRevision === null && command.type !== "session.name.set") {
			throw new ConversationStorageError(
				CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND,
				`Command ${command.type} requires an expected conversation document revision`,
			);
		}
		return this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
				const file = await this.readConversationFile(sessionId);
				if (file.header.schemaVersion !== CONVERSATION_SCHEMA_VERSION) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.READ_ONLY,
						`Conversation ${sessionId} uses read-only schema version ${file.header.schemaVersion}`,
					);
				}
				const document = documentFromFile(sessionId, file);
				if (expectedRevision !== null && document.revision !== expectedRevision) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.DOCUMENT_VERSION_CONFLICT,
						`Conversation document ${sessionId} is at revision ${document.revision}, expected ${expectedRevision}`,
					);
				}
				const result = applyConversationDocumentCommand(document, command);
				if (!result.changed) return result;
				const record: ConversationDocumentOperationRecord = {
					recordType: "conversation.document.operation",
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					revision: result.document.revision,
					command,
				};
				await appendFile(this.conversationPath(sessionId), serializeConversationLine(record), "utf8");
				return result;
			}),
		);
	}

	async fork(sessionId: string, entryId: string): Promise<ConversationDocumentForkResult> {
		this.assertOpen();
		return this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
				const file = await this.readConversationFile(sessionId);
				if (file.header.schemaVersion !== CONVERSATION_SCHEMA_VERSION) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.READ_ONLY,
						`Conversation ${sessionId} uses read-only schema version ${file.header.schemaVersion}`,
					);
				}
				return this.writeFork(sessionId, entryId, file);
			}),
		);
	}

	async append(
		sessionId: string,
		expectedVersion: number,
		events: readonly StoredSessionEvent[],
	): Promise<AppendResult> {
		this.assertOpen();
		return this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
				const file = await this.readConversationFile(sessionId);
				const conversation = conversationFromFile(sessionId, file);
				if (conversation.version !== expectedVersion) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
						`Conversation ${sessionId} is at version ${conversation.version}, expected ${expectedVersion}`,
					);
				}
				for (const event of events) validateConversationEvent(sessionId, event);
				if (events.length === 0) return { version: expectedVersion };

				let document = documentFromFile(sessionId, file);
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
					const documentEntry = createDocumentEntryReference(event, sequence, document.activeLeafId);
					const record = {
						recordType: "conversation.event" as const,
						schemaVersion: CONVERSATION_SCHEMA_VERSION,
						sequence,
						event,
						documentEntry,
					} satisfies ConversationEventRecord;
					document = applyStoredEventToConversationDocument(document, event, sequence, documentEntry ?? undefined);
					return record;
				});
				await appendFile(this.conversationPath(sessionId), records.map(serializeConversationLine).join(""), "utf8");
				return {
					version: expectedVersion + events.length,
				};
			}),
		);
	}

	async saveSnapshot(sessionId: string, snapshot: ConversationSnapshot): Promise<void> {
		this.assertOpen();
		await this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
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
			}),
		);
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

		return parseConversationFile(text, sessionId);
	}

	private async writeFork(
		sessionId: string,
		entryId: string,
		file: ParsedConversationFile,
	): Promise<ConversationDocumentForkResult> {
		const document = documentFromFile(sessionId, file);
		const selectedEntry = conversationDocumentEntry(document, entryId);
		const text = extractConversationEntryText(selectedEntry);
		if (
			selectedEntry.type !== "message" ||
			!isObject(selectedEntry.message) ||
			selectedEntry.message.role !== "user"
		) {
			throw new Error("Invalid entry ID for forking");
		}
		const tipId = resolveConversationUserTurnTip(document, entryId);
		const branch = selectConversationDocumentEntries(document, tipId);
		const selectedEntryIds = new Set(branch.map((entry) => entry.id));
		const selectedTurnIds = new Set(
			file.eventRecords.flatMap((record) => {
				if (
					record.schemaVersion === CONVERSATION_SCHEMA_VERSION &&
					record.documentEntry &&
					selectedEntryIds.has(record.documentEntry.id)
				) {
					return [record.event.turnId];
				}
				return [];
			}),
		);
		const newSessionId = randomUUID();
		const newPath = this.conversationPath(newSessionId);
		const header: ConversationFileHeader = {
			recordType: "conversation.header",
			schemaVersion: CONVERSATION_SCHEMA_VERSION,
			sessionId: newSessionId,
			createdAt: Date.now(),
			cwd: file.header.schemaVersion === CONVERSATION_SCHEMA_VERSION ? file.header.cwd : undefined,
			parentSessionPath: this.conversationPath(sessionId),
			parentEntryId: entryId,
		};
		const finalEntries = new Map(branch.map((entry) => [entry.id, entry]));
		const records: ConversationEventRecord[] = [];
		for (const source of file.eventRecords) {
			if (!selectedTurnIds.has(source.event.turnId)) continue;
			const sourceReference = source.schemaVersion === CONVERSATION_SCHEMA_VERSION ? source.documentEntry : null;
			if (source.event.type === "message.appended" && !sourceReference) continue;
			if (sourceReference && !selectedEntryIds.has(sourceReference.id)) continue;
			const entry = sourceReference ? finalEntries.get(sourceReference.id) : undefined;
			records.push({
				recordType: "conversation.event",
				schemaVersion: CONVERSATION_SCHEMA_VERSION,
				sequence: records.length + 1,
				event: { ...source.event, sessionId: newSessionId },
				documentEntry: entry ? { id: entry.id, parentId: entry.parentId, timestamp: entry.timestamp } : null,
			});
		}
		await this.ensureRoot();
		let handle: FileHandle | undefined;
		try {
			handle = await open(newPath, "wx");
			await handle.writeFile(
				[serializeConversationLine(header), ...records.map(serializeConversationLine)].join(""),
				"utf8",
			);
		} finally {
			await handle?.close();
		}
		return { sessionId: newSessionId, path: newPath, text };
	}

	private async withFileLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
		await this.ensureRoot();
		const release = await acquireConversationFileLock(this.lockPath(sessionId), sessionId);
		try {
			return await operation();
		} finally {
			await release();
		}
	}

	private async ensureRoot(): Promise<void> {
		await mkdir(this.rootDir, { recursive: true });
	}

	private conversationPath(sessionId: string): string {
		return join(this.rootDir, `${encodeConversationSessionId(sessionId)}.conversation.jsonl`);
	}

	private snapshotPath(sessionId: string): string {
		return join(this.rootDir, `${encodeConversationSessionId(sessionId)}.snapshot.json`);
	}

	private lockPath(sessionId: string): string {
		return `${this.conversationPath(sessionId)}.lock`;
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

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ConversationDocument } from "@vetta/runtime-core/conversation";
import {
	documentFromFile,
	encodeConversationSessionId,
	parseConversationFile,
	serializeConversationLine,
} from "./conversation-file-codec.js";
import { CONVERSATION_STORAGE_ERROR_CODES, ConversationStorageError } from "./errors.js";
import { analyzeLegacySessionImport, LegacySessionImportError } from "./legacy-session-import-analyzer.js";
import { nodeErrorCode } from "./node-error-code.js";
import {
	CONVERSATION_SCHEMA_VERSION,
	type ConversationFileHeader,
	type ConversationImportSeedRecord,
	isConversationImportSeedRecord,
} from "./record-schema.js";

export interface LegacySessionMigrationOptions {
	readonly sourcePath: string;
	readonly targetRootDir: string;
	readonly targetSessionId?: string;
	/** Reuse an existing target only when its complete serialized content is identical. */
	readonly reuseIdenticalTarget?: boolean;
}

export interface LegacySessionMigrationResult {
	readonly sourcePath: string;
	readonly sourceSessionId: string;
	readonly sourceVersion: number;
	readonly targetPath: string;
	readonly targetSessionId: string;
	readonly document: ConversationDocument;
	readonly created: boolean;
}

/**
 * Explicitly imports one coding-agent JSONL v1-v3 session into a new V2 conversation.
 *
 * The source is read-only. The fully validated target is published atomically under a new path.
 */
export async function migrateLegacySessionToV2(
	options: LegacySessionMigrationOptions,
): Promise<LegacySessionMigrationResult> {
	const sourcePath = resolve(options.sourcePath);
	const targetRootDir = resolve(options.targetRootDir);
	const targetSessionId = options.targetSessionId ?? randomUUID();
	const targetPath = join(targetRootDir, `${encodeConversationSessionId(targetSessionId)}.conversation.jsonl`);
	if (sourcePath === targetPath) {
		throw new ConversationStorageError(
			CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND,
			"Legacy session migration source and target paths must differ",
		);
	}

	const analysis = analyzeLegacySessionImport(await readFile(sourcePath, "utf8"));
	if (analysis.status === "not-representable") throw new LegacySessionImportError(analysis);
	const source = analysis.source;
	const header: ConversationFileHeader = {
		recordType: "conversation.header",
		schemaVersion: CONVERSATION_SCHEMA_VERSION,
		sessionId: targetSessionId,
		createdAt: source.document.identity.createdAt,
		...(source.document.identity.cwd ? { cwd: source.document.identity.cwd } : {}),
	};
	const seedCandidate: unknown = {
		recordType: "conversation.import.seed",
		schemaVersion: CONVERSATION_SCHEMA_VERSION,
		source: {
			format: "coding-agent-jsonl",
			path: sourcePath,
			sessionId: source.document.identity.sessionId,
			version: source.formatVersion,
		},
		entries: source.document.entries,
		activeLeafId: source.document.activeLeafId,
		...(source.document.name !== undefined ? { name: source.document.name } : {}),
	};
	if (!isConversationImportSeedRecord(seedCandidate)) {
		throw new ConversationStorageError(
			CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
			`Legacy session ${source.document.identity.sessionId} cannot be represented by the V2 conversation schema`,
		);
	}
	const seed: ConversationImportSeedRecord = seedCandidate;
	const content = [serializeConversationLine(header), serializeConversationLine(seed)].join("");
	const document = documentFromFile(targetSessionId, parseConversationFile(content, targetSessionId));

	await mkdir(targetRootDir, { recursive: true });
	const temporaryPath = `${targetPath}.${randomUUID()}.import.tmp`;
	let created = true;
	try {
		await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
		try {
			await link(temporaryPath, targetPath);
		} catch (error) {
			if (nodeErrorCode(error) === "EEXIST") {
				if (options.reuseIdenticalTarget && (await readFile(targetPath, "utf8")) === content) {
					created = false;
				} else {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.ALREADY_EXISTS,
						`Conversation already exists: ${targetSessionId}`,
						{ cause: error },
					);
				}
			} else {
				throw error;
			}
		}
	} finally {
		await rm(temporaryPath, { force: true });
	}

	return {
		sourcePath,
		sourceSessionId: source.document.identity.sessionId,
		sourceVersion: source.formatVersion,
		targetPath,
		targetSessionId,
		document,
		created,
	};
}

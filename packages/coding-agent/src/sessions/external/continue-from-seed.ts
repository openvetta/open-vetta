import type { UserMessage } from "@vetta/ai";
import type { SessionHistoryImportSource } from "@vetta/runtime-core";
import type { ConversationDocumentEntry } from "@vetta/runtime-core/conversation";

/** Must match runtime-core `EXTERNAL_IMPORT_SOURCE_MARKER_TYPE`. */
const IMPORT_SOURCE_CUSTOM_TYPE = "external_import_source";

export interface ExternalSessionContinueSeedDocument {
	readonly entries: readonly ConversationDocumentEntry[];
	readonly activeLeafId: string;
	readonly name?: string;
	readonly importedFrom: SessionHistoryImportSource;
}

export function buildExternalSessionContinueSeed(input: {
	readonly briefing: string;
	readonly importedFrom: SessionHistoryImportSource;
	readonly name?: string;
	readonly now: number;
	readonly createEntryId: () => string;
}): ExternalSessionContinueSeedDocument {
	const compactionId = input.createEntryId();
	const importSourceId = input.createEntryId();
	const timestamp = new Date(input.now).toISOString();
	const summaryMessage: UserMessage = {
		role: "user",
		content: input.briefing,
		timestamp: input.now,
	};
	const entries: ConversationDocumentEntry[] = [
		{
			type: "compaction",
			id: compactionId,
			parentId: null,
			timestamp,
			summary: input.briefing,
			firstKeptEntryId: importSourceId,
			tokensBefore: 0,
			reason: "manual",
			summaryMessage,
		},
		{
			type: "custom",
			id: importSourceId,
			parentId: compactionId,
			timestamp,
			customType: IMPORT_SOURCE_CUSTOM_TYPE,
			data: input.importedFrom,
		},
	];
	return {
		entries,
		activeLeafId: importSourceId,
		...(input.name !== undefined ? { name: input.name } : {}),
		importedFrom: input.importedFrom,
	};
}

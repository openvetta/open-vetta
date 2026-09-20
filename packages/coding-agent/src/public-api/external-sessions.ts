import type { RuntimeSessionCatalog, RuntimeSessionFileHistoryReader } from "@vetta/runtime-core";
import {
	ExternalRuntimeSessionCatalog,
	type ExternalRuntimeSessionCatalogOptions,
} from "../sessions/external/catalog.js";
import { ExternalRuntimeSessionFileHistoryReader } from "../sessions/external/history-reader.js";
import type { ExternalSessionFileHost } from "../sessions/external/host-contracts.js";

export type {
	ExistingImportedExternalSession,
	ExternalSessionBriefingCache,
	ExternalSessionContinuePersistInput,
	ExternalSessionContinuePorts,
	ExternalSessionContinueRequest,
	ExternalSessionContinueResult,
	ExternalSessionOriginSnapshot,
} from "../sessions/external/continue-from.js";
export {
	createCodingAgentExternalSessionContinueFrom,
	pickLatestImportedSession,
} from "../sessions/external/continue-from.js";
export {
	type ResolveGrokSessionsDirectoryInput,
	resolveGrokSessionsDirectory,
} from "../sessions/external/grok-session-directory.js";
export type {
	ExternalSessionDirectoryEntry,
	ExternalSessionFileHost,
	ExternalSessionRoot,
} from "../sessions/external/host-contracts.js";
export {
	EXTERNAL_ORIGIN_MARKER_TYPE,
	EXTERNAL_READONLY_SESSION_ACCESS,
	EXTERNAL_SESSION_ACTIVITY_WINDOW_MS,
	EXTERNAL_SESSION_HISTORY_UNAVAILABLE,
	type ExternalRuntimeSessionCatalogOptions,
	type ExternalSessionUnavailableReason,
	GROK_CONVERSATION_BODY_NAME,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_SUPPORTED_CHAT_FORMAT_VERSION,
	GROK_TOOL_ID,
	MAX_UNAVAILABLE_EXTERNAL_SESSIONS,
	OMITTED_REASONING_MARKER_TYPE,
	SKIPPED_TRUNCATED_LINES_MARKER_TYPE,
} from "../sessions/external/index.js";
export {
	type ResolveExternalSessionDirectoryInput,
	resolveExternalSessionDirectory,
} from "../sessions/external/session-directories.js";
export {
	CLAUDE_CODE_TOOL_ID,
	CODEX_TOOL_ID,
	CURSOR_AGENT_TOOL_ID,
	EXTERNAL_SESSION_TOOL_IDS,
	type ExternalSessionToolId,
	OMP_TOOL_ID,
	PI_TOOL_ID,
} from "../sessions/external/tool-ids.js";

export function createCodingAgentExternalSessionCatalog(
	host: ExternalSessionFileHost,
	options?: ExternalRuntimeSessionCatalogOptions,
): RuntimeSessionCatalog {
	return new ExternalRuntimeSessionCatalog(host, options);
}

export function createCodingAgentExternalSessionFileHistoryReader(
	host: ExternalSessionFileHost,
): RuntimeSessionFileHistoryReader {
	return new ExternalRuntimeSessionFileHistoryReader(host);
}

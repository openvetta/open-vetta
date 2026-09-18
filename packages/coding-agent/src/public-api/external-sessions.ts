import type { RuntimeSessionCatalog } from "@vetta/runtime-core";
import {
	ExternalRuntimeSessionCatalog,
	type ExternalRuntimeSessionCatalogOptions,
} from "../sessions/external/catalog.js";
import type { ExternalSessionFileHost } from "../sessions/external/host-contracts.js";

export {
	type ResolveGrokSessionsDirectoryInput,
	resolveGrokSessionsDirectory,
} from "../sessions/external/grok-session-directory.js";
export type { ExternalSessionDirectoryEntry, ExternalSessionFileHost } from "../sessions/external/host-contracts.js";
export {
	EXTERNAL_READONLY_SESSION_ACCESS,
	EXTERNAL_SESSION_ACTIVITY_WINDOW_MS,
	type ExternalRuntimeSessionCatalogOptions,
	type ExternalSessionUnavailableReason,
	GROK_CONVERSATION_BODY_NAME,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_SUPPORTED_CHAT_FORMAT_VERSION,
	GROK_TOOL_ID,
	MAX_UNAVAILABLE_EXTERNAL_SESSIONS,
} from "../sessions/external/index.js";

export function createCodingAgentExternalSessionCatalog(
	host: ExternalSessionFileHost,
	options?: ExternalRuntimeSessionCatalogOptions,
): RuntimeSessionCatalog {
	return new ExternalRuntimeSessionCatalog(host, options);
}

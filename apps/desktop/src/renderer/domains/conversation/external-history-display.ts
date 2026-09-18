/**
 * Display-side wire values emitted by the external session history reader.
 * Renderer must not import `@vetta/coding-agent/external-sessions`.
 */
export const EXTERNAL_ORIGIN_MARKER_TYPE = "external_origin";
export const OMITTED_REASONING_MARKER_TYPE = "omitted_reasoning";
export const GROK_TOOL_ID = "grok";

export const EXTERNAL_SESSION_HISTORY_UNAVAILABLE = {
	corrupted_header: "EXTERNAL_SESSION_CORRUPTED_HEADER",
	unsupported_version: "EXTERNAL_SESSION_UNSUPPORTED_VERSION",
} as const;

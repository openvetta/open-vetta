export const GROK_TOOL_ID = "grok";
export const CLAUDE_CODE_TOOL_ID = "claude-code";
export const CODEX_TOOL_ID = "codex";
export const CURSOR_AGENT_TOOL_ID = "cursor-agent";
export const PI_TOOL_ID = "pi";
export const OMP_TOOL_ID = "omp";

export const EXTERNAL_SESSION_TOOL_IDS = [
	GROK_TOOL_ID,
	CLAUDE_CODE_TOOL_ID,
	CODEX_TOOL_ID,
	CURSOR_AGENT_TOOL_ID,
	PI_TOOL_ID,
	OMP_TOOL_ID,
] as const;

export type ExternalSessionToolId = (typeof EXTERNAL_SESSION_TOOL_IDS)[number];

export function isExternalSessionToolId(value: string): value is ExternalSessionToolId {
	return (EXTERNAL_SESSION_TOOL_IDS as readonly string[]).includes(value);
}

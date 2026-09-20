import { claudeCodeFormat } from "./claude-code-format.js";
import { codexFormat } from "./codex-format.js";
import { ompFormat, piFormat } from "./coding-agent-jsonl-format.js";
import { cursorAgentFormat } from "./cursor-agent-format.js";
import type { ExternalSessionFormat } from "./format.js";
import { grokFormat } from "./grok-format.js";
import { GROK_CONVERSATION_BODY_NAME, GROK_SUMMARY_SIDECAR_NAME } from "./grok-summary.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";

export const EXTERNAL_SESSION_FORMATS: readonly ExternalSessionFormat[] = [
	grokFormat,
	claudeCodeFormat,
	codexFormat,
	cursorAgentFormat,
	ompFormat,
	piFormat,
];

export function formatForTool(tool: string): ExternalSessionFormat | undefined {
	return EXTERNAL_SESSION_FORMATS.find((format) => format.id === tool);
}

export function identifyExternalSessionFormat(
	path: string,
	host: ExternalSessionFileHost,
): ExternalSessionFormat | undefined {
	if (!host.exists(path)) return undefined;
	const name = host.basename(path);
	if (name === GROK_SUMMARY_SIDECAR_NAME || name === GROK_CONVERSATION_BODY_NAME) {
		return grokFormat.canRead(path, host) ? grokFormat : undefined;
	}
	return EXTERNAL_SESSION_FORMATS.find((format) => format.id !== "grok" && format.canRead(path, host));
}

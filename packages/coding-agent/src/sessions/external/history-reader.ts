import type { HistoryEntry, RuntimeSessionFileHistoryReader } from "@vetta/runtime-core";
import { EXTERNAL_SESSION_HISTORY_UNAVAILABLE, projectGrokConversationDisplay } from "./grok-conversation.js";
import {
	findGrokSummaryHeader,
	GROK_CONVERSATION_BODY_NAME,
	GROK_HEADER_SCAN_LINES,
	GROK_SUMMARY_SIDECAR_NAME,
} from "./grok-summary.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";

/** 只读投影 Grok 会话目录；身份是摘要侧车，内容是对话主体，不加锁、不写回。 */
export class ExternalRuntimeSessionFileHistoryReader implements RuntimeSessionFileHistoryReader {
	constructor(private readonly host: ExternalSessionFileHost) {}

	canRead(sessionPath: string): boolean {
		if (this.host.basename(sessionPath) !== GROK_SUMMARY_SIDECAR_NAME) return false;
		try {
			return (
				findGrokSummaryHeader(this.host.readPrefixLines(sessionPath, GROK_HEADER_SCAN_LINES)).kind !== "unrelated"
			);
		} catch {
			return false;
		}
	}

	read(sessionPath: string): { history: HistoryEntry[] } {
		const header = findGrokSummaryHeader(this.host.readPrefixLines(sessionPath, GROK_HEADER_SCAN_LINES));
		if (header.kind === "corrupted_header" || header.kind === "unrelated") {
			throw new Error(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.corrupted_header);
		}
		if (header.kind === "unsupported_version") {
			throw new Error(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.unsupported_version);
		}
		const bodyPath = this.host.join(this.host.join(sessionPath, ".."), GROK_CONVERSATION_BODY_NAME);
		if (!this.host.exists(bodyPath)) return { history: projectGrokConversationDisplay("") };
		return { history: projectGrokConversationDisplay(this.host.readText(bodyPath)) };
	}
}

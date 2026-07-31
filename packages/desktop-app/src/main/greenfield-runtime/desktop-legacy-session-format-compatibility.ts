import { LegacyRuntimeSessionCatalog, LegacyRuntimeSessionFileHistoryReader } from "@vetta/coding-agent/runtime-host";
import type { RuntimeSessionCatalog, RuntimeSessionFileHistoryReader } from "../../../../runtime-core/src/index.js";

export interface DesktopLegacySessionFormatCompatibility {
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly sessionFileHistoryReader: RuntimeSessionFileHistoryReader;
}

/** 旧 JSONL 的发现、读取和文件生命周期兼容；不创建或持有 AgentSession。 */
export function createDesktopLegacySessionFormatCompatibility(): DesktopLegacySessionFormatCompatibility {
	return {
		sessionCatalog: new LegacyRuntimeSessionCatalog(),
		sessionFileHistoryReader: new LegacyRuntimeSessionFileHistoryReader(),
	};
}

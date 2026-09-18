import {
	createCodingAgentExternalSessionCatalog,
	createCodingAgentExternalSessionFileHistoryReader,
	type ExternalRuntimeSessionCatalogOptions,
} from "@vetta/coding-agent/external-sessions";
import type { RuntimeSessionCatalog, RuntimeSessionFileHistoryReader } from "@vetta/runtime-core";
import { createDesktopExternalSessionHost } from "./external-session-host.js";

export interface DesktopExternalSessionFormat {
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly sessionFileHistoryReader: RuntimeSessionFileHistoryReader;
}

export interface DesktopExternalSessionFormatOptions extends ExternalRuntimeSessionCatalogOptions {
	readonly resolveSessionsDirectory: () => string | undefined;
}

export function createDesktopExternalSessionFormat(
	options: DesktopExternalSessionFormatOptions,
): DesktopExternalSessionFormat {
	const host = createDesktopExternalSessionHost({ resolveSessionsDirectory: options.resolveSessionsDirectory });
	return {
		sessionCatalog: createCodingAgentExternalSessionCatalog(host, {
			now: options.now,
			activityWindowMs: options.activityWindowMs,
			maxUnavailable: options.maxUnavailable,
		}),
		sessionFileHistoryReader: createCodingAgentExternalSessionFileHistoryReader(host),
	};
}

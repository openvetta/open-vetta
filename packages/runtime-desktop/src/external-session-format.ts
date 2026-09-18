import {
	createCodingAgentExternalSessionCatalog,
	type ExternalRuntimeSessionCatalogOptions,
} from "@vetta/coding-agent/external-sessions";
import type { RuntimeSessionCatalog } from "@vetta/runtime-core";
import { createDesktopExternalSessionHost } from "./external-session-host.js";

export interface DesktopExternalSessionFormat {
	readonly sessionCatalog: RuntimeSessionCatalog;
}

export interface DesktopExternalSessionFormatOptions extends ExternalRuntimeSessionCatalogOptions {
	readonly resolveSessionsDirectory: () => string | undefined;
}

export function createDesktopExternalSessionFormat(
	options: DesktopExternalSessionFormatOptions,
): DesktopExternalSessionFormat {
	return {
		sessionCatalog: createCodingAgentExternalSessionCatalog(
			createDesktopExternalSessionHost({ resolveSessionsDirectory: options.resolveSessionsDirectory }),
			{ now: options.now, activityWindowMs: options.activityWindowMs, maxUnavailable: options.maxUnavailable },
		),
	};
}

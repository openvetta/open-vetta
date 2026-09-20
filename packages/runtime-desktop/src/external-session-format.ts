import {
	createCodingAgentExternalSessionCatalog,
	createCodingAgentExternalSessionFileHistoryReader,
	type ExternalRuntimeSessionCatalogOptions,
	type ExternalSessionFileHost,
	type ExternalSessionRoot,
} from "@vetta/coding-agent/external-sessions";
import type { RuntimeSessionCatalog, RuntimeSessionFileHistoryReader } from "@vetta/runtime-core";
import { createDesktopExternalSessionHost } from "./external-session-host.js";

export interface DesktopExternalSessionFormat {
	readonly host: ExternalSessionFileHost;
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly sessionFileHistoryReader: RuntimeSessionFileHistoryReader;
}

export interface DesktopExternalSessionFormatOptions extends ExternalRuntimeSessionCatalogOptions {
	readonly resolveSessionRoots?: () => readonly ExternalSessionRoot[];
	readonly resolveSessionsDirectory?: () => string | undefined;
}

export function createDesktopExternalSessionFormat(
	options: DesktopExternalSessionFormatOptions,
): DesktopExternalSessionFormat {
	const host = createDesktopExternalSessionHost({
		...(options.resolveSessionRoots ? { resolveSessionRoots: options.resolveSessionRoots } : {}),
		...(options.resolveSessionsDirectory ? { resolveSessionsDirectory: options.resolveSessionsDirectory } : {}),
	});
	return {
		host,
		sessionCatalog: createCodingAgentExternalSessionCatalog(host, {
			now: options.now,
			activityWindowMs: options.activityWindowMs,
			maxUnavailable: options.maxUnavailable,
		}),
		sessionFileHistoryReader: createCodingAgentExternalSessionFileHistoryReader(host),
	};
}

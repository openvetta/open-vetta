import type { RpcSessionMigrationStatus } from "@vetta/coding-agent/rpc";
import type { GreenfieldRpcFallbackReason } from "./greenfield-im-runtime-host.js";

interface LegacyExtensionFallbackEvidence {
	readonly requiresLegacyRuntime: boolean;
	readonly unsupportedEvents: readonly string[];
	readonly unmetRuntimeCapabilities: readonly string[];
}

interface LegacySessionMigrationFallbackEvidence {
	readonly status: RpcSessionMigrationStatus;
}

export interface AutomaticLegacyRuntimeFallbackEvidence {
	readonly reason: GreenfieldRpcFallbackReason;
	readonly extensionCompatibility?: LegacyExtensionFallbackEvidence;
	readonly sessionMigration?: LegacySessionMigrationFallbackEvidence;
}

/**
 * Keep automatic Legacy execution fail-closed: every fallback must carry one
 * of the compatibility gaps explicitly preserved by the CLI composition root.
 */
export function assertAllowedAutomaticLegacyRuntimeFallback(evidence: AutomaticLegacyRuntimeFallbackEvidence): void {
	switch (evidence.reason) {
		case "legacy-extension":
			assertExtensionFallback(evidence.extensionCompatibility);
			return;
		case "legacy-session":
			assertSessionFallback(evidence.sessionMigration);
			return;
		default:
			assertNever(evidence.reason);
	}
}

function assertExtensionFallback(evidence: LegacyExtensionFallbackEvidence | undefined): void {
	if (
		!evidence?.requiresLegacyRuntime ||
		(evidence.unsupportedEvents.length === 0 && evidence.unmetRuntimeCapabilities.length === 0)
	) {
		throw new Error("Legacy Extension fallback requires an explicit unsupported event or runtime capability gap");
	}
}

function assertSessionFallback(evidence: LegacySessionMigrationFallbackEvidence | undefined): void {
	if (!evidence) throw new Error("Legacy Session fallback requires migration evidence");
	switch (evidence.status) {
		case "not-representable":
			return;
		case "locked":
		case "failed":
		case "migrated":
		case "reused":
			throw new Error(`Legacy Session fallback is not allowed after migration status ${evidence.status}`);
		default:
			assertNever(evidence.status);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unsupported automatic Legacy fallback evidence: ${String(value)}`);
}

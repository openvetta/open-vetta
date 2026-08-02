import type { RpcSessionMigrationStatus } from "@vetta/coding-agent/rpc";

interface LegacySessionMigrationFallbackEvidence {
	readonly status: RpcSessionMigrationStatus;
}

export interface AutomaticLegacyRuntimeFallbackEvidence {
	readonly reason: "legacy-session";
	readonly sessionMigration?: LegacySessionMigrationFallbackEvidence;
}

/**
 * Keep automatic Legacy execution fail-closed: the remaining fallback must
 * carry an unrepresentable Session migration result.
 */
export function assertAllowedAutomaticLegacyRuntimeFallback(evidence: AutomaticLegacyRuntimeFallbackEvidence): void {
	assertSessionFallback(evidence.sessionMigration);
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

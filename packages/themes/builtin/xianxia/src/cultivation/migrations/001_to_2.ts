import type { ConfigRecord, VersionedConfigMigration } from "@vetta/toolkit/versioned-config";

/**
 * Legacy v1 → v2: best-effort field preservation.
 * Early snapshots were loosely shaped; keep known keys and drop nothing critical.
 */
export const cultivationMigration001To2: VersionedConfigMigration = {
	fromVersion: 1,
	toVersion: 2,
	migrate(config) {
		return { ...config } satisfies ConfigRecord;
	},
};

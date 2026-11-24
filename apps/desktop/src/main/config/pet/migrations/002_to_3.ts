import type { VersionedConfigMigration } from "@vetta/toolkit/versioned-config";

export const petConfigMigration002To3: VersionedConfigMigration = {
	fromVersion: 2,
	toVersion: 3,
	migrate(config) {
		return {
			...config,
			bubbleStyleId: config.bubbleStyleId ?? "plain",
		};
	},
};

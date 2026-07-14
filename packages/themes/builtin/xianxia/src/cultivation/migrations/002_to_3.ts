import type { ConfigRecord, VersionedConfigMigration } from "@vetta/toolkit/versioned-config";

/**
 * v2 → v3: sanctum-ready shape (growth + dailyScores required for UI).
 */
export const cultivationMigration002To3: VersionedConfigMigration = {
	fromVersion: 2,
	toVersion: 3,
	migrate(config) {
		const growth =
			typeof config.growth === "object" && config.growth !== null && !Array.isArray(config.growth)
				? (config.growth as ConfigRecord)
				: {};

		return {
			...config,
			dailyScores: Array.isArray(config.dailyScores) ? config.dailyScores : [],
			growth: {
				today: typeof growth.today === "number" ? growth.today : 0,
				thisWeek: typeof growth.thisWeek === "number" ? growth.thisWeek : 0,
				last30Days: typeof growth.last30Days === "number" ? growth.last30Days : 0,
			},
		};
	},
};

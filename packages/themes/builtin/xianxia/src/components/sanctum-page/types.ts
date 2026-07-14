import type { ThemeUsageStats } from "@vetta/theme-sdk";
import type { SanctumAchievement } from "./achievements";
import type { CultivationDailyMetrics, CultivationScoreBreakdown } from "../../cultivation";

export interface RealmRequirement {
	readonly current: number;
	readonly icon: string;
	readonly label: string;
	readonly target: number;
}

export interface SanctumCultivationView {
	readonly achievedRealmIds: readonly string[];
	readonly currentPower: number;
	/**
	 * Theme-stored daily cumulative metrics samples (end-of-day / last sync).
	 * Used by 修行履历 for month/week period deltas.
	 */
	readonly dailyMetrics: readonly CultivationDailyMetrics[];
	readonly englishName: string;
	readonly growth: readonly {
		readonly label: string;
		readonly value: number;
	}[];
	readonly level: number;
	readonly maxPower: number;
	/** Latest host totals (lifetime), not score-weighted breakdown. */
	readonly metrics: ThemeUsageStats;
	readonly name: string;
	readonly nextRealmId: string | null;
	readonly progressPercent: string;
	/** 0..1 progress toward the next realm. */
	readonly progressToNext: number;
	readonly realmId: string;
	readonly score: number;
	readonly scoreBreakdown: CultivationScoreBreakdown;
	readonly trend: readonly {
		readonly date: string;
		readonly label: string;
		readonly power: number;
		readonly score: number;
	}[];
}

export interface RealmDetailView {
	readonly achieved: boolean;
	readonly achievement: SanctumAchievement;
	readonly definition: string;
	readonly nextRealmName: string | null;
	readonly previousRealmName: string | null;
	readonly requirements: readonly RealmRequirement[];
}

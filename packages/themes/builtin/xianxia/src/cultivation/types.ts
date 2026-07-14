import type { ThemeUsageStats } from "@vetta/theme-sdk";

export const CULTIVATION_STORAGE_KEY = "cultivation";
/** v3: sanctum-ready score display, growth, and compact daily history. */
export const CULTIVATION_SNAPSHOT_VERSION = 3;

export interface CultivationRealmDefinition {
	readonly id: string;
	readonly level: number;
	readonly name: string;
	readonly englishName: string;
	/** Minimum cultivation score (from app-monitor) to enter this realm. */
	readonly targetScore: number;
}

/** Point breakdown derived from app-monitor aggregates. */
export interface CultivationScoreBreakdown {
	readonly activeTime: number;
	readonly messages: number;
	readonly turns: number;
	readonly tools: number;
	readonly sessions: number;
	readonly tokens: number;
	readonly streak: number;
	readonly batch: number;
	readonly automation: number;
	readonly knowledge: number;
	readonly projects: number;
	readonly depth: number;
}

export interface CultivationGrowth {
	readonly today: number;
	readonly thisWeek: number;
	readonly last30Days: number;
}

export interface CultivationDailyScore {
	readonly date: string;
	readonly score: number;
}

/**
 * End-of-day (last sync that day) cumulative host metrics.
 * Theme owns this history; host only supplies the latest totals.
 * Period deltas = sample(end) − sample(before period start).
 */
export interface CultivationDailyMetrics {
	readonly date: string;
	readonly automationRuns: number;
	readonly batchRuns: number;
	readonly interactiveSessions: number;
	readonly knowledgeBaseCount: number;
	readonly knowledgeBaseFileOperations: number;
	readonly messages: number;
	readonly projectsCreated: number;
	readonly toolsCompleted: number;
}

/**
 * Theme-owned cultivation snapshot persisted via theme storage.
 * Derived only from app-monitor aggregates; never stores raw user content.
 */
export interface CultivationSnapshot {
	readonly version: typeof CULTIVATION_SNAPSHOT_VERSION;
	readonly updatedAt: number;
	readonly realmId: string;
	readonly level: number;
	readonly name: string;
	readonly englishName: string;
	/** Total cultivation score from app-monitor. */
	readonly score: number;
	/** Current realm's entry score. */
	readonly realmStartScore: number;
	/** Current progress inside the active realm. */
	readonly cultivationPower: number;
	/** Required progress inside the active realm; equals 0 at max realm. */
	readonly cultivationPowerTarget: number;
	readonly scoreBreakdown: CultivationScoreBreakdown;
	readonly growth: CultivationGrowth;
	readonly dailyScores: readonly CultivationDailyScore[];
	/**
	 * Daily cumulative metrics samples for period reports.
	 * Optional for older v3 blobs; treated as [] when missing.
	 */
	readonly dailyMetrics: readonly CultivationDailyMetrics[];
	/** 0..1 progress toward the next realm; 1 when max realm. */
	readonly progressToNext: number;
	readonly nextRealmId: string | null;
	readonly nextRealmTargetScore: number | null;
	readonly achievedRealmIds: readonly string[];
	/** Raw app-monitor snapshot used for this computation. */
	readonly metrics: ThemeUsageStats;
}

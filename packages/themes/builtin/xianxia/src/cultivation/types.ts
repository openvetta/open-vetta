import type { ThemeUsageStats } from "@vetta/theme-sdk";

export const CULTIVATION_STORAGE_KEY = "cultivation";
/** v2: score from app-monitor aggregates (not fanren/activeMs-only ladder). */
export const CULTIVATION_SNAPSHOT_VERSION = 2;

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
	readonly scoreBreakdown: CultivationScoreBreakdown;
	/** 0..1 progress toward the next realm; 1 when max realm. */
	readonly progressToNext: number;
	readonly nextRealmId: string | null;
	readonly nextRealmTargetScore: number | null;
	readonly achievedRealmIds: readonly string[];
	/** Raw app-monitor snapshot used for this computation. */
	readonly metrics: ThemeUsageStats;
}

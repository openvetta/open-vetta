import { z } from "zod";
import { CULTIVATION_SNAPSHOT_VERSION, type CultivationSnapshot } from "./types";

/** Finite number; invalid / missing → fallback (default 0). */
const num = (fallback = 0) => z.number().finite().catch(fallback);

const scoreBreakdownSchema = z.object({
	activeTime: num(),
	messages: num(),
	turns: num(),
	tools: num(),
	sessions: num(),
	tokens: num(),
	streak: num(),
	batch: num(),
	automation: num(),
	knowledge: num(),
	projects: num(),
	depth: num(),
});

const growthSchema = z.object({
	today: num(),
	thisWeek: num(),
	last30Days: num(),
});

const dailyScoreSchema = z.object({
	date: z.string(),
	score: z.number().finite(),
});

const dailyMetricsSchema = z.object({
	date: z.string(),
	automationRuns: num(),
	batchRuns: num(),
	interactiveSessions: num(),
	knowledgeBaseCount: num(),
	knowledgeBaseFileOperations: num(),
	messages: num(),
	projectsCreated: num(),
	toolsCompleted: num(),
});

const metricsSchema = z.object({
	activeDayStreak: num(),
	automationRuns: num(),
	batchRuns: num(),
	foregroundActiveMs: num(),
	interactiveSessions: num(),
	knowledgeBaseCount: num(),
	knowledgeBaseFileOperations: num(),
	longestConversationMessages: num(),
	longestConversationTurns: num(),
	messages: num(),
	projectsCreated: num(),
	todayActiveMs: num(),
	todayMessages: num(),
	toolsCompleted: num(),
	totalTokens: num(),
	turns: num(),
});

/**
 * Loose parse of a migrated cultivation blob.
 * Required identity / progress fields must be present; optional blocks default safely.
 */
export const cultivationSnapshotInputSchema = z.object({
	// Accept toolkit field or legacy `version` (preprocessed before parse).
	schemaVersion: z.literal(CULTIVATION_SNAPSHOT_VERSION),
	updatedAt: num(Date.now()),
	realmId: z.string(),
	level: z.number().finite(),
	name: z.string(),
	englishName: z.string(),
	score: num(),
	realmStartScore: num(),
	cultivationPower: z.number().finite(),
	cultivationPowerTarget: z.number().finite(),
	scoreBreakdown: scoreBreakdownSchema.catch({
		activeTime: 0,
		messages: 0,
		turns: 0,
		tools: 0,
		sessions: 0,
		tokens: 0,
		streak: 0,
		batch: 0,
		automation: 0,
		knowledge: 0,
		projects: 0,
		depth: 0,
	}),
	growth: growthSchema,
	dailyScores: z.array(dailyScoreSchema).catch([]),
	dailyMetrics: z.array(dailyMetricsSchema).catch([]),
	progressToNext: z.number().finite(),
	nextRealmId: z.string().nullable().catch(null),
	nextRealmTargetScore: z.number().finite().nullable().catch(null),
	achievedRealmIds: z.array(z.string()),
	metrics: metricsSchema.catch({
		activeDayStreak: 0,
		automationRuns: 0,
		batchRuns: 0,
		foregroundActiveMs: 0,
		interactiveSessions: 0,
		knowledgeBaseCount: 0,
		knowledgeBaseFileOperations: 0,
		longestConversationMessages: 0,
		longestConversationTurns: 0,
		messages: 0,
		projectsCreated: 0,
		todayActiveMs: 0,
		todayMessages: 0,
		toolsCompleted: 0,
		totalTokens: 0,
		turns: 0,
	}),
});

export type CultivationSnapshotInput = z.infer<typeof cultivationSnapshotInputSchema>;

/** Map parsed storage shape → runtime CultivationSnapshot (`version` field). */
export function toCultivationSnapshot(parsed: CultivationSnapshotInput): CultivationSnapshot {
	return {
		version: CULTIVATION_SNAPSHOT_VERSION,
		updatedAt: parsed.updatedAt,
		realmId: parsed.realmId,
		level: parsed.level,
		name: parsed.name,
		englishName: parsed.englishName,
		score: parsed.score,
		realmStartScore: parsed.realmStartScore,
		cultivationPower: parsed.cultivationPower,
		cultivationPowerTarget: parsed.cultivationPowerTarget,
		scoreBreakdown: parsed.scoreBreakdown,
		growth: parsed.growth,
		dailyScores: parsed.dailyScores,
		dailyMetrics: parsed.dailyMetrics,
		progressToNext: parsed.progressToNext,
		nextRealmId: parsed.nextRealmId,
		nextRealmTargetScore: parsed.nextRealmTargetScore,
		achievedRealmIds: parsed.achievedRealmIds,
		metrics: parsed.metrics,
	};
}

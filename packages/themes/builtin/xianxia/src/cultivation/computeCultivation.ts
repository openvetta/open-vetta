import type { ThemeUsageStats } from "@vetta/theme-sdk";
import { CULTIVATION_REALMS } from "./realms";
import { computeCultivationScore } from "./score";
import { CULTIVATION_SNAPSHOT_VERSION, type CultivationSnapshot } from "./types";

function clamp01(value: number): number {
	if (value <= 0) return 0;
	if (value >= 1) return 1;
	return value;
}

/**
 * Map app-monitor usage aggregates → xianxia cultivation snapshot.
 * Score is multi-metric; realm gates use theme-owned targetScore thresholds.
 */
export function computeCultivation(stats: ThemeUsageStats, now = Date.now()): CultivationSnapshot {
	const { score, breakdown } = computeCultivationScore(stats);

	let currentIndex = 0;
	for (let i = 0; i < CULTIVATION_REALMS.length; i++) {
		if (score >= CULTIVATION_REALMS[i].targetScore) {
			currentIndex = i;
		} else {
			break;
		}
	}

	const current = CULTIVATION_REALMS[currentIndex];
	const next = CULTIVATION_REALMS[currentIndex + 1] ?? null;
	const achievedRealmIds = CULTIVATION_REALMS.slice(0, currentIndex + 1).map((realm) => realm.id);

	let progressToNext = 1;
	if (next) {
		const span = next.targetScore - current.targetScore;
		progressToNext = span <= 0 ? 1 : clamp01((score - current.targetScore) / span);
	}

	return {
		version: CULTIVATION_SNAPSHOT_VERSION,
		updatedAt: now,
		realmId: current.id,
		level: current.level,
		name: current.name,
		englishName: current.englishName,
		score,
		scoreBreakdown: breakdown,
		progressToNext,
		nextRealmId: next?.id ?? null,
		nextRealmTargetScore: next?.targetScore ?? null,
		achievedRealmIds,
		metrics: {
			activeDayStreak: stats.activeDayStreak,
			automationRuns: stats.automationRuns,
			batchRuns: stats.batchRuns,
			foregroundActiveMs: stats.foregroundActiveMs,
			interactiveSessions: stats.interactiveSessions,
			knowledgeBaseCount: stats.knowledgeBaseCount,
			knowledgeBaseFileOperations: stats.knowledgeBaseFileOperations,
			longestConversationMessages: stats.longestConversationMessages,
			longestConversationTurns: stats.longestConversationTurns,
			messages: stats.messages,
			projectsCreated: stats.projectsCreated,
			todayActiveMs: stats.todayActiveMs,
			todayMessages: stats.todayMessages,
			toolsCompleted: stats.toolsCompleted,
			totalTokens: stats.totalTokens,
			turns: stats.turns,
		},
	};
}

/** Compare cultivation payloads ignoring volatile `updatedAt`. */
export function isSameCultivationSnapshot(
	left: CultivationSnapshot | null | undefined,
	right: CultivationSnapshot,
): boolean {
	if (!left) return false;
	return (
		left.version === right.version &&
		left.realmId === right.realmId &&
		left.level === right.level &&
		left.score === right.score &&
		left.progressToNext === right.progressToNext &&
		left.nextRealmId === right.nextRealmId &&
		left.nextRealmTargetScore === right.nextRealmTargetScore &&
		left.metrics.foregroundActiveMs === right.metrics.foregroundActiveMs &&
		left.metrics.messages === right.metrics.messages &&
		left.metrics.turns === right.metrics.turns &&
		left.metrics.toolsCompleted === right.metrics.toolsCompleted &&
		left.metrics.totalTokens === right.metrics.totalTokens &&
		left.metrics.activeDayStreak === right.metrics.activeDayStreak &&
		left.metrics.interactiveSessions === right.metrics.interactiveSessions &&
		left.metrics.batchRuns === right.metrics.batchRuns &&
		left.metrics.automationRuns === right.metrics.automationRuns &&
		left.metrics.knowledgeBaseFileOperations === right.metrics.knowledgeBaseFileOperations &&
		left.achievedRealmIds.length === right.achievedRealmIds.length &&
		left.achievedRealmIds.every((id, index) => id === right.achievedRealmIds[index])
	);
}

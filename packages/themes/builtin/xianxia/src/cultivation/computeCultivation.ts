import type { ThemeUsageStats } from "@vetta/theme-sdk";
import { CULTIVATION_REALMS } from "./realms";
import { computeCultivationScore } from "./score";
import {
	CULTIVATION_SNAPSHOT_VERSION,
	type CultivationDailyScore,
	type CultivationGrowth,
	type CultivationSnapshot,
} from "./types";

const HISTORY_RETENTION_DAYS = 31;
const MS_PER_DAY = 86_400_000;

function clamp01(value: number): number {
	if (value <= 0) return 0;
	if (value >= 1) return 1;
	return value;
}

function getLocalDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getDateKeyDaysAgo(timestamp: number, days: number): string {
	return getLocalDateKey(timestamp - days * MS_PER_DAY);
}

function normalizeDailyScores(
	dailyScores: readonly CultivationDailyScore[] | undefined,
	score: number,
	now: number,
): readonly CultivationDailyScore[] {
	const today = getLocalDateKey(now);
	const cutoff = getDateKeyDaysAgo(now, HISTORY_RETENTION_DAYS);
	const byDate = new Map<string, number>();

	for (const entry of dailyScores ?? []) {
		if (entry.date < cutoff) continue;
		byDate.set(entry.date, entry.score);
	}
	byDate.set(today, score);

	return [...byDate.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([date, entryScore]) => ({ date, score: entryScore }));
}

function findScoreBefore(dailyScores: readonly CultivationDailyScore[], date: string): number | null {
	for (let index = dailyScores.length - 1; index >= 0; index--) {
		const entry = dailyScores[index];
		if (entry.date < date) return entry.score;
	}
	return null;
}

function computeGrowth(score: number, dailyScores: readonly CultivationDailyScore[], now: number): CultivationGrowth {
	const today = getLocalDateKey(now);
	const weekStart = getDateKeyDaysAgo(now, 7);
	const monthStart = getDateKeyDaysAgo(now, 30);
	const todayBase = findScoreBefore(dailyScores, today);
	const weekBase = findScoreBefore(dailyScores, weekStart);
	const monthBase = findScoreBefore(dailyScores, monthStart);

	return {
		today: round2(Math.max(0, score - (todayBase ?? score))),
		thisWeek: round2(Math.max(0, score - (weekBase ?? score))),
		last30Days: round2(Math.max(0, score - (monthBase ?? score))),
	};
}

/**
 * Map app-monitor usage aggregates → xianxia cultivation snapshot.
 * Score is multi-metric; realm gates use theme-owned targetScore thresholds.
 */
export function computeCultivation(
	stats: ThemeUsageStats,
	now = Date.now(),
	previous?: CultivationSnapshot | null,
): CultivationSnapshot {
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
	const dailyScores = normalizeDailyScores(previous?.dailyScores, score, now);
	const realmSpan = next ? next.targetScore - current.targetScore : 0;
	const cultivationPower = round2(Math.max(0, score - current.targetScore));
	const cultivationPowerTarget = round2(Math.max(0, realmSpan));

	let progressToNext = 1;
	if (next) {
		progressToNext = realmSpan <= 0 ? 1 : clamp01(cultivationPower / realmSpan);
	}

	return {
		version: CULTIVATION_SNAPSHOT_VERSION,
		updatedAt: now,
		realmId: current.id,
		level: current.level,
		name: current.name,
		englishName: current.englishName,
		score,
		realmStartScore: current.targetScore,
		cultivationPower,
		cultivationPowerTarget,
		scoreBreakdown: breakdown,
		growth: computeGrowth(score, dailyScores, now),
		dailyScores,
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
		left.realmStartScore === right.realmStartScore &&
		left.cultivationPower === right.cultivationPower &&
		left.cultivationPowerTarget === right.cultivationPowerTarget &&
		left.progressToNext === right.progressToNext &&
		left.nextRealmId === right.nextRealmId &&
		left.nextRealmTargetScore === right.nextRealmTargetScore &&
		left.growth.today === right.growth.today &&
		left.growth.thisWeek === right.growth.thisWeek &&
		left.growth.last30Days === right.growth.last30Days &&
		left.dailyScores.length === right.dailyScores.length &&
		left.dailyScores.every(
			(entry, index) =>
				entry.date === right.dailyScores[index]?.date &&
				entry.score === right.dailyScores[index]?.score,
		) &&
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

function round2(value: number): number {
	return Math.floor(value * 100) / 100;
}

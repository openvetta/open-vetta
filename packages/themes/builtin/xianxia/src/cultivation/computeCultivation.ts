import type { ThemeUsageStats } from "@vetta/theme-sdk";
import { CULTIVATION_REALMS } from "./realms";
import { computeCultivationScore } from "./score";
import {
	CULTIVATION_SNAPSHOT_VERSION,
	type CultivationDailyMetrics,
	type CultivationDailyScore,
	type CultivationGrowth,
	type CultivationSnapshot,
} from "./types";

/** Keep ~3 months of daily scores so 修行履历 can page month/week views. */
const HISTORY_RETENTION_DAYS = 93;
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
	// Always refresh today's end-of-day score to the latest total.
	byDate.set(today, score);

	return [...byDate.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([date, entryScore]) => ({ date, score: entryScore }));
}

function snapshotMetricsForDay(date: string, stats: ThemeUsageStats): CultivationDailyMetrics {
	return {
		automationRuns: Math.max(0, stats.automationRuns),
		batchRuns: Math.max(0, stats.batchRuns),
		date,
		interactiveSessions: Math.max(0, stats.interactiveSessions),
		knowledgeBaseCount: Math.max(0, stats.knowledgeBaseCount),
		knowledgeBaseFileOperations: Math.max(0, stats.knowledgeBaseFileOperations),
		messages: Math.max(0, stats.messages),
		projectsCreated: Math.max(0, stats.projectsCreated),
		toolsCompleted: Math.max(0, stats.toolsCompleted),
	};
}

/**
 * Persist cumulative host metrics once per calendar day (last write wins for that day).
 * Period reports compute deltas between samples — host stays period-agnostic.
 */
function normalizeDailyMetrics(
	dailyMetrics: readonly CultivationDailyMetrics[] | undefined,
	stats: ThemeUsageStats,
	now: number,
): readonly CultivationDailyMetrics[] {
	const today = getLocalDateKey(now);
	const cutoff = getDateKeyDaysAgo(now, HISTORY_RETENTION_DAYS);
	const byDate = new Map<string, CultivationDailyMetrics>();

	for (const entry of dailyMetrics ?? []) {
		if (entry.date < cutoff) continue;
		byDate.set(entry.date, entry);
	}
	byDate.set(today, snapshotMetricsForDay(today, stats));

	return [...byDate.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, entry]) => entry);
}

function findScoreAtOrBefore(dailyScores: readonly CultivationDailyScore[], date: string): number | null {
	for (let index = dailyScores.length - 1; index >= 0; index--) {
		const entry = dailyScores[index];
		if (entry.date <= date) return entry.score;
	}
	return null;
}

/** Latest score strictly before `date` (excludes same-day sample). */
function findScoreBefore(dailyScores: readonly CultivationDailyScore[], date: string): number | null {
	for (let index = dailyScores.length - 1; index >= 0; index--) {
		const entry = dailyScores[index];
		if (entry.date < date) return entry.score;
	}
	return null;
}

/**
 * Growth deltas vs historical baselines.
 * - today: current score − last score strictly before today
 *   (must NOT use today's dailyScores entry — it is refreshed to current score every sync)
 * - week / 30d: current score − sample on/before the window start day
 *   (do NOT fall back to today's baseline — that collapses week/month into "today")
 *
 * If history is shorter than the window (no sample on/before start), baseline is 0:
 * the value may equal "today" only when there is no prior-day sample at all.
 */
function computeGrowth(score: number, dailyScores: readonly CultivationDailyScore[], now: number): CultivationGrowth {
	const today = getLocalDateKey(now);
	const weekStart = getDateKeyDaysAgo(now, 7);
	const monthStart = getDateKeyDaysAgo(now, 30);
	const todayBase = findScoreBefore(dailyScores, today);
	const weekBase = findScoreAtOrBefore(dailyScores, weekStart);
	const monthBase = findScoreAtOrBefore(dailyScores, monthStart);

	return {
		today: round2(Math.max(0, score - (todayBase ?? 0))),
		thisWeek: round2(Math.max(0, score - (weekBase ?? 0))),
		last30Days: round2(Math.max(0, score - (monthBase ?? 0))),
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
	const dailyMetrics = normalizeDailyMetrics(previous?.dailyMetrics, stats, now);
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
		dailyMetrics,
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
		(left.dailyMetrics?.length ?? 0) === (right.dailyMetrics?.length ?? 0) &&
		(left.dailyMetrics ?? []).every(
			(entry, index) =>
				entry.date === right.dailyMetrics?.[index]?.date &&
				entry.toolsCompleted === right.dailyMetrics?.[index]?.toolsCompleted &&
				entry.messages === right.dailyMetrics?.[index]?.messages &&
				entry.automationRuns === right.dailyMetrics?.[index]?.automationRuns &&
				entry.batchRuns === right.dailyMetrics?.[index]?.batchRuns,
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

import { useThemeStorage } from "@vetta/theme-sdk";
import { useSyncExternalStore } from "react";
import {
	CULTIVATION_REALMS,
	CULTIVATION_STORAGE_KEY,
	loadCultivationSnapshot,
	type CultivationSnapshot,
} from "../../cultivation";
import type { SanctumCultivationView } from "./types";

const fallbackRealm = CULTIVATION_REALMS[0];

const emptyMetrics = {
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
} as const;

const fallbackCultivationView: SanctumCultivationView = {
	achievedRealmIds: [fallbackRealm.id],
	currentPower: 0,
	dailyMetrics: [],
	englishName: fallbackRealm.englishName,
	growth: [
		{ label: "今日", value: 0 },
		{ label: "本周", value: 0 },
		{ label: "近30天", value: 0 },
	],
	level: fallbackRealm.level,
	maxPower: CULTIVATION_REALMS[1]?.targetScore ?? 0,
	metrics: emptyMetrics,
	name: fallbackRealm.name,
	nextRealmId: CULTIVATION_REALMS[1]?.id ?? null,
	progressPercent: "0%",
	progressToNext: 0,
	realmId: fallbackRealm.id,
	score: 0,
	scoreBreakdown: {
		activeTime: 0,
		automation: 0,
		batch: 0,
		depth: 0,
		knowledge: 0,
		messages: 0,
		projects: 0,
		sessions: 0,
		streak: 0,
		tokens: 0,
		tools: 0,
		turns: 0,
	},
	trend: [
		{
			date: getLocalDateKey(Date.now()),
			label: "今日",
			power: 0,
			score: 0,
		},
	],
};

function getLocalDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatTrendLabel(dateKey: string): string {
	const [, month, day] = dateKey.split("-");
	return `${Number(month)}/${Number(day)}`;
}

function toTrendPoints(snapshot: CultivationSnapshot): SanctumCultivationView["trend"] {
	const today = getLocalDateKey(snapshot.updatedAt);
	const byDate = new Map(snapshot.dailyScores.map((entry) => [entry.date, entry.score]));
	byDate.set(today, snapshot.score);

	return [...byDate.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		// Align with cultivation daily retention (~3 months) for period navigation.
		.slice(-93)
		.map(([date, score]) => ({
			date,
			label: formatTrendLabel(date),
			power: Math.max(0, Math.floor(score)),
			score,
		}));
}

function useCultivationSnapshot(): CultivationSnapshot | null {
	const storage = useThemeStorage();

	useSyncExternalStore(
		storage.subscribe,
		() => `${storage.status}:${JSON.stringify(storage.get(CULTIVATION_STORAGE_KEY))}`,
		() => "loading:",
	);

	if (storage.status !== "ready") return null;
	return loadCultivationSnapshot(storage.get(CULTIVATION_STORAGE_KEY)).snapshot;
}

function toCultivationView(snapshot: CultivationSnapshot | null): SanctumCultivationView {
	if (!snapshot) return fallbackCultivationView;
	const maxPower =
		snapshot.cultivationPowerTarget > 0
			? snapshot.cultivationPowerTarget
			: Math.max(snapshot.cultivationPower, 1);

	return {
		achievedRealmIds: snapshot.achievedRealmIds,
		currentPower: snapshot.cultivationPower,
		dailyMetrics: snapshot.dailyMetrics ?? [],
		englishName: snapshot.englishName,
		growth: [
			{ label: "今日", value: snapshot.growth.today },
			{ label: "本周", value: snapshot.growth.thisWeek },
			{ label: "近30天", value: snapshot.growth.last30Days },
		],
		level: snapshot.level,
		maxPower,
		metrics: snapshot.metrics ?? emptyMetrics,
		name: snapshot.name,
		nextRealmId: snapshot.nextRealmId,
		progressPercent: `${Math.round(snapshot.progressToNext * 100)}%`,
		progressToNext: snapshot.progressToNext,
		realmId: snapshot.realmId,
		score: snapshot.score,
		scoreBreakdown: snapshot.scoreBreakdown,
		trend: toTrendPoints(snapshot),
	};
}

export function useSanctumCultivationView(): SanctumCultivationView {
	return toCultivationView(useCultivationSnapshot());
}

export function formatCultivationNumber(value: number): string {
	return Math.floor(value).toLocaleString("en-US");
}

export function formatRealmTitle(name: string): string {
	return name.split("").join(" ");
}

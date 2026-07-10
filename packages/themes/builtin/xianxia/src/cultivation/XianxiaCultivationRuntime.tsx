import {
	useThemeStorage,
	useThemeUsageStats,
	type ThemeStorageValue,
} from "@vetta/theme-sdk";
import { useEffect, useRef } from "react";
import { computeCultivation, isSameCultivationSnapshot } from "./computeCultivation";
import { CULTIVATION_STORAGE_KEY, type CultivationSnapshot } from "./types";

const SYNC_INTERVAL_MS = 30_000;

function readStoredSnapshot(value: unknown): CultivationSnapshot | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	const snapshot = value as CultivationSnapshot;
	// Drop legacy v1 (fanren/activeMs ladder) snapshots so they recompute under v2.
	if (snapshot.version !== 2) return null;
	return snapshot;
}

function toStorageValue(snapshot: CultivationSnapshot): ThemeStorageValue {
	return {
		version: snapshot.version,
		updatedAt: snapshot.updatedAt,
		realmId: snapshot.realmId,
		level: snapshot.level,
		name: snapshot.name,
		englishName: snapshot.englishName,
		score: snapshot.score,
		scoreBreakdown: { ...snapshot.scoreBreakdown },
		progressToNext: snapshot.progressToNext,
		nextRealmId: snapshot.nextRealmId,
		nextRealmTargetScore: snapshot.nextRealmTargetScore,
		achievedRealmIds: [...snapshot.achievedRealmIds],
		metrics: { ...snapshot.metrics },
	};
}

/**
 * Headless runtime: app-monitor aggregates → theme cultivation storage.
 * Verify via console `[xianxia-cultivation]` and
 * `~/.vetta/desktop-app/themes/xianxia/data.json`.
 */
export function XianxiaCultivationRuntime(): null {
	const storage = useThemeStorage();
	const usage = useThemeUsageStats();
	const lastSyncedKeyRef = useRef<string>("");

	useEffect(() => {
		void usage.refresh();
		const timer = window.setInterval(() => {
			void usage.refresh();
		}, SYNC_INTERVAL_MS);

		const onFocus = (): void => {
			void usage.refresh();
		};
		window.addEventListener("focus", onFocus);

		return () => {
			window.clearInterval(timer);
			window.removeEventListener("focus", onFocus);
		};
	}, [usage.refresh]);

	useEffect(() => {
		if (usage.status !== "ready" || !usage.stats) return;
		if (storage.status !== "ready") return;

		const snapshot = computeCultivation(usage.stats);
		const previous = readStoredSnapshot(storage.get(CULTIVATION_STORAGE_KEY));
		if (isSameCultivationSnapshot(previous, snapshot)) return;

		const dedupeKey = `${snapshot.realmId}:${snapshot.score}:${snapshot.metrics.messages}:${snapshot.metrics.toolsCompleted}`;
		if (lastSyncedKeyRef.current === dedupeKey) return;
		lastSyncedKeyRef.current = dedupeKey;

		storage.set(CULTIVATION_STORAGE_KEY, toStorageValue(snapshot));
		console.info(
			`[xianxia-cultivation] synced realm=${snapshot.realmId} level=${snapshot.level} ` +
				`score=${snapshot.score} progress=${snapshot.progressToNext.toFixed(3)} ` +
				`messages=${snapshot.metrics.messages} turns=${snapshot.metrics.turns} ` +
				`tools=${snapshot.metrics.toolsCompleted} activeMs=${snapshot.metrics.foregroundActiveMs}`,
		);
	}, [storage, usage.stats, usage.status]);

	return null;
}

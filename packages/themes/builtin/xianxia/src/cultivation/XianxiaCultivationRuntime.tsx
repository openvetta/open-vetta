import { useThemeStorage, useThemeUsageStats } from "@vetta/theme-sdk";
import { useEffect, useRef } from "react";
import { computeCultivation, isSameCultivationSnapshot } from "./computeCultivation";
import { loadCultivationSnapshot, toCultivationStorageValue } from "./migrate-config";
import { CULTIVATION_STORAGE_KEY } from "./types";

const SYNC_INTERVAL_MS = 30_000;

/**
 * Headless runtime: app-monitor aggregates → theme cultivation storage.
 * Versioning uses @vetta/toolkit migrate; persistence stays on theme storage.
 * Verify via console `[xianxia-cultivation]` and
 * `~/.vetta/desktop-app/themes/xianxia/cultivation.json`.
 */
export function XianxiaCultivationRuntime(): null {
	const storage = useThemeStorage();
	const usage = useThemeUsageStats();
	const storageStatus = storage.status;
	const usageStatus = usage.status;
	const lastSyncedKeyRef = useRef<string>("");
	const didWriteMigrationRef = useRef(false);

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

	// One-shot: persist schema migration even when usage stats are unchanged.
	useEffect(() => {
		if (storageStatus !== "ready" || didWriteMigrationRef.current) return;
		const loaded = loadCultivationSnapshot(storage.get(CULTIVATION_STORAGE_KEY));
		if (!loaded.migrated || !loaded.snapshot) return;
		didWriteMigrationRef.current = true;
		storage.set(CULTIVATION_STORAGE_KEY, toCultivationStorageValue(loaded.snapshot));
		console.info(`[xianxia-cultivation] migrated storage schema to v${loaded.snapshot.version}`);
	}, [storage, storageStatus]);

	useEffect(() => {
		if (usageStatus !== "ready" || !usage.stats) return;
		if (storageStatus !== "ready") return;

		const loaded = loadCultivationSnapshot(storage.get(CULTIVATION_STORAGE_KEY));
		const previous = loaded.snapshot;
		const snapshot = computeCultivation(usage.stats, Date.now(), previous);
		if (!loaded.migrated && isSameCultivationSnapshot(previous, snapshot)) return;

		const dedupeKey = `${snapshot.realmId}:${snapshot.score}:${snapshot.metrics.messages}:${snapshot.metrics.toolsCompleted}`;
		if (!loaded.migrated && lastSyncedKeyRef.current === dedupeKey) return;
		lastSyncedKeyRef.current = dedupeKey;
		didWriteMigrationRef.current = true;

		// Storage remains theme host KV — only the value is version-migrated.
		storage.set(CULTIVATION_STORAGE_KEY, toCultivationStorageValue(snapshot));
		console.info(
			`[xianxia-cultivation] synced realm=${snapshot.realmId} level=${snapshot.level} ` +
				`score=${snapshot.score} progress=${snapshot.progressToNext.toFixed(3)} ` +
				`messages=${snapshot.metrics.messages} turns=${snapshot.metrics.turns} ` +
				`tools=${snapshot.metrics.toolsCompleted} activeMs=${snapshot.metrics.foregroundActiveMs}`,
		);
	}, [storage, storageStatus, usage.stats, usageStatus]);

	return null;
}

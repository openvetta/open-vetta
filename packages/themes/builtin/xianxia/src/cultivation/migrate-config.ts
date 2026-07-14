import type { ThemeStorageValue } from "@vetta/theme-sdk";
import { migrateVersionedConfig, type VersionedConfigMigrationResult } from "@vetta/toolkit/versioned-config";
import { z } from "zod";
import {
	cultivationSnapshotInputSchema,
	toCultivationSnapshot,
} from "./cultivation-snapshot.schema";
import { cultivationMigration001To2 } from "./migrations/001_to_2";
import { cultivationMigration002To3 } from "./migrations/002_to_3";
import { CULTIVATION_SNAPSHOT_VERSION, type CultivationSnapshot } from "./types";

const CULTIVATION_MIGRATIONS = [cultivationMigration001To2, cultivationMigration002To3] as const;

const legacyVersionPrepSchema = z
	.record(z.string(), z.unknown())
	.transform((record) => {
		if (typeof record.schemaVersion === "number") return record;
		if (typeof record.version === "number") {
			return { ...record, schemaVersion: record.version };
		}
		return record;
	});

/**
 * Legacy blobs used `version`; toolkit migrate uses `schemaVersion`.
 */
function prepareLegacyVersionField(value: unknown): unknown {
	const parsed = legacyVersionPrepSchema.safeParse(value);
	return parsed.success ? parsed.data : value;
}

/**
 * Migrate a raw theme-storage value for the cultivation key.
 * Storage I/O stays with the caller (useThemeStorage / host).
 */
export function migrateCultivationConfig(value: unknown): VersionedConfigMigrationResult {
	return migrateVersionedConfig(prepareLegacyVersionField(value), {
		currentVersion: CULTIVATION_SNAPSHOT_VERSION,
		initialVersion: 1,
		migrations: CULTIVATION_MIGRATIONS,
	});
}

/**
 * Normalize migrated config into a typed snapshot, or null if unusable.
 * Does not touch storage.
 */
export function normalizeCultivationSnapshot(value: unknown): CultivationSnapshot | null {
	const prepared = prepareLegacyVersionField(value);
	const parsed = cultivationSnapshotInputSchema.safeParse(prepared);
	if (!parsed.success) return null;
	return toCultivationSnapshot(parsed.data);
}

/**
 * Load cultivation snapshot from a theme-storage value.
 * Returns migrated flag so the caller can write back via its own storage API.
 */
export function loadCultivationSnapshot(value: unknown): {
	readonly migrated: boolean;
	readonly snapshot: CultivationSnapshot | null;
} {
	if (value === null || value === undefined) {
		return { migrated: false, snapshot: null };
	}

	const recordParse = z.record(z.string(), z.unknown()).safeParse(value);
	if (!recordParse.success) {
		return { migrated: false, snapshot: null };
	}
	const record = recordParse.data;

	const legacyRemapped = typeof record.schemaVersion !== "number" && typeof record.version === "number";
	const redundantLegacyVersion = typeof record.schemaVersion === "number" && "version" in record;

	try {
		const migratedResult = migrateCultivationConfig(record);
		const snapshot = normalizeCultivationSnapshot(migratedResult.config);
		return {
			migrated: migratedResult.migrated || legacyRemapped || redundantLegacyVersion,
			snapshot,
		};
	} catch {
		return { migrated: false, snapshot: null };
	}
}

/** Serialize snapshot for theme storage (host KV). Only `schemaVersion` for schema id. */
export function toCultivationStorageValue(snapshot: CultivationSnapshot): ThemeStorageValue {
	return {
		schemaVersion: snapshot.version,
		updatedAt: snapshot.updatedAt,
		realmId: snapshot.realmId,
		level: snapshot.level,
		name: snapshot.name,
		englishName: snapshot.englishName,
		score: snapshot.score,
		realmStartScore: snapshot.realmStartScore,
		cultivationPower: snapshot.cultivationPower,
		cultivationPowerTarget: snapshot.cultivationPowerTarget,
		scoreBreakdown: { ...snapshot.scoreBreakdown },
		growth: { ...snapshot.growth },
		dailyScores: snapshot.dailyScores.map((entry) => ({ ...entry })),
		dailyMetrics: (snapshot.dailyMetrics ?? []).map((entry) => ({ ...entry })),
		progressToNext: snapshot.progressToNext,
		nextRealmId: snapshot.nextRealmId,
		nextRealmTargetScore: snapshot.nextRealmTargetScore,
		achievedRealmIds: [...snapshot.achievedRealmIds],
		metrics: { ...snapshot.metrics },
	};
}

import { PET_CONFIG_SCHEMA_VERSION } from "../../../shared/pet-config.js";
import { migrateVersionedConfig, type VersionedConfigMigrationResult } from "../versioned-config.js";
import { petConfigMigration001To2 } from "./migrations/001_to_2.js";

const PET_CONFIG_MIGRATIONS = [petConfigMigration001To2] as const;

export function migratePetConfig(value: unknown): VersionedConfigMigrationResult {
	return migrateVersionedConfig(value, {
		currentVersion: PET_CONFIG_SCHEMA_VERSION,
		migrations: PET_CONFIG_MIGRATIONS,
	});
}

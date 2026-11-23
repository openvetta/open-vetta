import { readdir } from "node:fs/promises";
import { atomicWriteJSONAsync } from "@vetta/toolkit/atomic-write";
import { createVersionedJsonConfigStore, type VersionedJsonConfigStore } from "@vetta/toolkit/config-store";
import { migrateAppMonitorData } from "../config/app-monitor/migrate-config.js";
import { migrateAppMonitorMonthData } from "../config/app-monitor/migrate-month-data.js";
import { getAppLogger } from "../logger.js";
import { type AppMonitorData, normalizeAppMonitorData } from "./app-monitor-data.js";
import {
	appMonitorMonthPath,
	appMonitorMonthsDirPath,
	appMonitorProfilePath,
	appMonitorSummaryPath,
} from "./app-monitor-layout.js";
import { type AppMonitorMonthData, normalizeAppMonitorMonthData } from "./app-monitor-month-data.js";
import { type AppMonitorProfile, normalizeAppMonitorProfile } from "./app-monitor-profile.js";

const log = getAppLogger("app-monitor");

export const appMonitorStore = createVersionedJsonConfigStore<AppMonitorData>({
	path: appMonitorSummaryPath(),
	name: "app-monitor",
	normalize: normalizeAppMonitorData,
	migrate: migrateAppMonitorData,
	writeJson: atomicWriteJSONAsync,
	logger: log,
});

export const appMonitorProfileStore = createVersionedJsonConfigStore<AppMonitorProfile>({
	path: appMonitorProfilePath(),
	name: "app-monitor-profile",
	normalize: normalizeAppMonitorProfile,
	writeJson: atomicWriteJSONAsync,
	logger: log,
});

export function createAppMonitorMonthStore(
	month: string,
	profile: AppMonitorProfile,
): VersionedJsonConfigStore<AppMonitorMonthData> {
	return createVersionedJsonConfigStore<AppMonitorMonthData>({
		path: appMonitorMonthPath(month),
		name: `app-monitor-month-${month}`,
		normalize: (value) => normalizeAppMonitorMonthData(value, month, profile),
		migrate: migrateAppMonitorMonthData,
		writeJson: atomicWriteJSONAsync,
		logger: log,
	});
}

const MONTH_FILE_PATTERN = /^(\d{4}-\d{2})\.json$/;

/** Month keys that have a persisted monthly file, ascending. Missing directory means none yet. */
export async function listPersistedAppMonitorMonths(): Promise<string[]> {
	let names: string[];
	try {
		names = await readdir(appMonitorMonthsDirPath());
	} catch {
		return [];
	}
	const months: string[] = [];
	for (const name of names) {
		const match = MONTH_FILE_PATTERN.exec(name);
		if (match?.[1]) months.push(match[1]);
	}
	return months.sort();
}

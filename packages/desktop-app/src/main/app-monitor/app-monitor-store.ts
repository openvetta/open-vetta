import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { atomicWriteJSONAsync } from "@vetta/toolkit/atomic-write";
import { createVersionedJsonConfigStore } from "@vetta/toolkit/config-store";
import { migrateAppMonitorData } from "../config/app-monitor/migrate-config.js";
import { getAppLogger } from "../logger.js";
import { type AppMonitorData, normalizeAppMonitorData } from "./app-monitor-data.js";

const APP_MONITOR_PATH = join(getVettaHomePath(), "app-monitor.json");
const log = getAppLogger("app-monitor");

export const appMonitorStore = createVersionedJsonConfigStore<AppMonitorData>({
	path: APP_MONITOR_PATH,
	name: "app-monitor",
	normalize: normalizeAppMonitorData,
	migrate: migrateAppMonitorData,
	writeJson: atomicWriteJSONAsync,
	logger: log,
});

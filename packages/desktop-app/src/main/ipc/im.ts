import { ipcMain, type WebContents } from "electron";
import type { LogEvent } from "../im-host/host-protocol.js";
import { getImHost, type SetConfigPayload } from "../im-host/index.js";
import type { LegacyDetection } from "../im-host/migration.js";

const CHANNELS = {
	GET_CONFIG: "vetta:im:get-config",
	SET_CONFIG: "vetta:im:set-config",
	GET_STATUS: "vetta:im:get-status",
	SUBSCRIBE_STATUS: "vetta:im:subscribe-status",
	UNSUBSCRIBE_STATUS: "vetta:im:unsubscribe-status",
	STATUS_EVENT: "vetta:im:status-event",
	LOG_EVENT: "vetta:im:log-event",
	TEST_CONNECTION: "vetta:im:test-connection",
	RESTART: "vetta:im:restart",
	GET_RECENT_LOGS: "vetta:im:get-recent-logs",
	GET_PATHS: "vetta:im:get-paths",
	DETECT_LEGACY: "vetta:im:detect-legacy",
	IMPORT_LEGACY: "vetta:im:import-legacy",
} as const;

interface SubscriptionEntry {
	statusUnsub: () => void;
	logUnsub: () => void;
}

const subscriptions = new Map<string, SubscriptionEntry>();
let counter = 0;

export function registerImIpc(webContents: WebContents): () => void {
	const host = getImHost();

	ipcMain.handle(CHANNELS.GET_CONFIG, () => {
		return host.getPublicConfig();
	});

	ipcMain.handle(CHANNELS.SET_CONFIG, async (_event, payload: SetConfigPayload) => {
		return host.setConfig(payload);
	});

	ipcMain.handle(CHANNELS.GET_STATUS, () => {
		return host.getStatus();
	});

	ipcMain.handle(CHANNELS.SUBSCRIBE_STATUS, () => {
		counter += 1;
		const id = `im-sub-${counter}`;
		const statusUnsub = host.subscribeStatus((snapshot) => {
			if (webContents.isDestroyed()) return;
			webContents.send(CHANNELS.STATUS_EVENT, id, snapshot);
		});
		const logUnsub = host.subscribeLog((event: LogEvent) => {
			if (webContents.isDestroyed()) return;
			webContents.send(CHANNELS.LOG_EVENT, id, event);
		});
		subscriptions.set(id, { statusUnsub, logUnsub });
		// Push initial snapshot so the UI doesn't have to make a separate
		// get-status call after subscribing.
		webContents.send(CHANNELS.STATUS_EVENT, id, host.getStatus());
		return { subscriptionId: id };
	});

	ipcMain.handle(CHANNELS.UNSUBSCRIBE_STATUS, (_event, id: string) => {
		const entry = subscriptions.get(id);
		if (entry) {
			entry.statusUnsub();
			entry.logUnsub();
			subscriptions.delete(id);
		}
	});

	ipcMain.handle(CHANNELS.TEST_CONNECTION, async (_event, payload: SetConfigPayload["feishu"]) => {
		// First milestone: a "test" is a structural sanity check on the
		// fields. Real network probing would require either a parallel
		// sidecar or a feishu HTTP call from main; both have follow-up
		// scope. We at least surface fast feedback for empty fields and
		// obviously malformed identifiers.
		if (!payload?.appId || payload.appId.trim() === "") {
			return { ok: false, error: "App ID 不能为空" };
		}
		if (!payload?.appSecret || payload.appSecret.trim() === "") {
			return { ok: false, error: "App Secret 不能为空" };
		}
		if (!/^cli_[a-zA-Z0-9]+$/.test(payload.appId.trim())) {
			return { ok: false, error: "App ID 格式不正确（应以 cli_ 开头）" };
		}
		return { ok: true, message: "字段格式校验通过；保存后将由桥接进程进行真实连接验证。" };
	});

	ipcMain.handle(CHANNELS.RESTART, async () => {
		await host.restart();
		return { ok: true };
	});

	ipcMain.handle(CHANNELS.GET_RECENT_LOGS, () => {
		return host.getRecentLogs();
	});

	ipcMain.handle(CHANNELS.GET_PATHS, () => {
		return host.getPaths();
	});

	ipcMain.handle(CHANNELS.DETECT_LEGACY, () => {
		return host.detectLegacy();
	});

	ipcMain.handle(CHANNELS.IMPORT_LEGACY, async (_event, detection: LegacyDetection) => {
		return host.importLegacy(detection);
	});

	return () => {
		ipcMain.removeHandler(CHANNELS.GET_CONFIG);
		ipcMain.removeHandler(CHANNELS.SET_CONFIG);
		ipcMain.removeHandler(CHANNELS.GET_STATUS);
		ipcMain.removeHandler(CHANNELS.SUBSCRIBE_STATUS);
		ipcMain.removeHandler(CHANNELS.UNSUBSCRIBE_STATUS);
		ipcMain.removeHandler(CHANNELS.TEST_CONNECTION);
		ipcMain.removeHandler(CHANNELS.RESTART);
		ipcMain.removeHandler(CHANNELS.GET_RECENT_LOGS);
		ipcMain.removeHandler(CHANNELS.GET_PATHS);
		ipcMain.removeHandler(CHANNELS.DETECT_LEGACY);
		ipcMain.removeHandler(CHANNELS.IMPORT_LEGACY);
		for (const entry of subscriptions.values()) {
			entry.statusUnsub();
			entry.logUnsub();
		}
		subscriptions.clear();
	};
}

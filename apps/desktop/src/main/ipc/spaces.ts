import { ipcMain } from "electron";
import { type SharedSpaceData, SPACES_CHANNELS, type SpaceSyncRequest } from "../../shared/spaces-ipc.js";
import { getSpaceStore, watchSpaceStore } from "../spaces/space-store-instance.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 只校验握手的外壳；空间数据本身由存储逐条清洗。 */
export function parseSpaceSyncRequest(value: unknown): SpaceSyncRequest {
	if (!isRecord(value) || typeof value.sourceId !== "string" || !value.sourceId.trim()) {
		throw new Error("Invalid space sync request: sourceId is required");
	}
	return {
		sourceId: value.sourceId.trim(),
		local: (isRecord(value.local) ? value.local : {}) as unknown as SharedSpaceData,
		localDirty: value.localDirty === true,
	};
}

/** 工作空间存储的 Renderer 入口（ADR-0160）。 */
export function registerSpacesIpc(): () => void {
	const stopWatching = watchSpaceStore();
	ipcMain.handle(SPACES_CHANNELS.SYNC, (_event, request: unknown) =>
		getSpaceStore().sync(parseSpaceSyncRequest(request)),
	);
	ipcMain.handle(SPACES_CHANNELS.SAVE, (_event, data: unknown) =>
		getSpaceStore().save((isRecord(data) ? data : {}) as unknown as SharedSpaceData),
	);
	return () => {
		stopWatching();
		ipcMain.removeHandler(SPACES_CHANNELS.SYNC);
		ipcMain.removeHandler(SPACES_CHANNELS.SAVE);
	};
}

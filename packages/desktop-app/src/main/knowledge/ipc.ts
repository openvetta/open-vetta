/**
 * 知识库相关 IPC：手动「立即扫描+加工」「重建索引」，以及保存设置后重载轮询器。
 */

import { ipcMain } from "electron";
import { getAppLogger } from "../logger.js";
import { rebuildKnowledgeIndex, reloadKnowledgePoller, runKnowledgeRound } from "./poller.js";

const log = getAppLogger("kb-ipc");

const CHANNELS = {
	SCAN_NOW: "vetta:kb:scan-now",
	REBUILD_INDEX: "vetta:kb:rebuild-index",
	RELOAD: "vetta:kb:reload",
} as const;

export function registerKnowledgeIpc(): void {
	ipcMain.handle(CHANNELS.SCAN_NOW, async () => {
		log.info("manual scan triggered");
		return runKnowledgeRound();
	});
	ipcMain.handle(CHANNELS.REBUILD_INDEX, async () => {
		log.info("manual rebuild index triggered");
		await rebuildKnowledgeIndex();
	});
	ipcMain.handle(CHANNELS.RELOAD, async () => {
		await reloadKnowledgePoller();
	});
}

export function unregisterKnowledgeIpc(): void {
	ipcMain.removeHandler(CHANNELS.SCAN_NOW);
	ipcMain.removeHandler(CHANNELS.REBUILD_INDEX);
	ipcMain.removeHandler(CHANNELS.RELOAD);
}

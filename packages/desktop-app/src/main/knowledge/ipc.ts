/**
 * 知识库相关 IPC：手动「立即整理」（起一轮加工），以及保存设置后重载轮询器。
 * 缓存重建无需手动触发——由加工轮收尾与轮询器启动自愈自动完成。
 */

import { ipcMain } from "electron";
import { getAppLogger } from "../logger.js";
import { reloadKnowledgePoller, runKnowledgeRound } from "./poller.js";

const log = getAppLogger("kb-ipc");

const CHANNELS = {
	SCAN_NOW: "vetta:kb:scan-now",
	RELOAD: "vetta:kb:reload",
} as const;

export function registerKnowledgeIpc(): void {
	ipcMain.handle(CHANNELS.SCAN_NOW, async () => {
		log.info("manual scan triggered");
		return runKnowledgeRound();
	});
	ipcMain.handle(CHANNELS.RELOAD, async () => {
		await reloadKnowledgePoller();
	});
}

export function unregisterKnowledgeIpc(): void {
	ipcMain.removeHandler(CHANNELS.SCAN_NOW);
	ipcMain.removeHandler(CHANNELS.RELOAD);
}

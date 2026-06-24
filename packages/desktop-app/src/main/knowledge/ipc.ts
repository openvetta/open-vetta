/**
 * 知识库相关 IPC：
 * - 手动「立即整理」（起一轮加工）、保存设置后重载轮询器。
 * - raws ↔ UI 的读（list/tree）与写（增删改，走特权互斥写）。
 * 缓存重建无需手动触发——由加工轮收尾与轮询器启动自愈自动完成。
 */

import { ipcMain } from "electron";
import { readDesktopConfig } from "../ipc/fs.js";
import { getAppLogger } from "../logger.js";
import { isKnowledgeProcessing, reloadKnowledgePoller, runKnowledgeRound } from "./poller.js";
import {
	addFilesToKnowledgeBase,
	createKnowledgeBase,
	deleteKnowledgeBase,
	deleteKnowledgeEntry,
	listKnowledgeBases,
	renameKnowledgeBase,
	renameKnowledgeEntry,
} from "./raws-fs.js";
import { getKnowledgeFileStatuses } from "./status.js";

const log = getAppLogger("kb-ipc");

const CHANNELS = {
	SCAN_NOW: "vetta:kb:scan-now",
	RELOAD: "vetta:kb:reload",
	IS_PROCESSING: "vetta:kb:is-processing",
	LIST: "vetta:kb:list",
	STATUSES: "vetta:kb:statuses",
	ADD_FILES: "vetta:kb:add-files",
	DELETE_ENTRY: "vetta:kb:delete-entry",
	RENAME_ENTRY: "vetta:kb:rename-entry",
	CREATE: "vetta:kb:create",
	DELETE: "vetta:kb:delete",
	RENAME: "vetta:kb:rename",
} as const;

export function registerKnowledgeIpc(): void {
	ipcMain.handle(CHANNELS.SCAN_NOW, async () => {
		log.info("manual scan triggered");
		// 手动整理与定时一致：用配置的加工模型与并发数（即使「永不自动加工」也能手动跑）。
		const kb = (await readDesktopConfig()).knowledgeBase;
		return runKnowledgeRound(kb?.processingModelKey, kb?.agentConcurrency ?? 3);
	});
	ipcMain.handle(CHANNELS.RELOAD, async () => {
		await reloadKnowledgePoller();
	});

	ipcMain.handle(CHANNELS.IS_PROCESSING, async () => isKnowledgeProcessing());
	ipcMain.handle(CHANNELS.LIST, async () => listKnowledgeBases());
	ipcMain.handle(CHANNELS.STATUSES, async () => getKnowledgeFileStatuses());
	ipcMain.handle(CHANNELS.ADD_FILES, async (_e, kbId: string, sourcePaths: string[], move: boolean) => {
		await addFilesToKnowledgeBase(kbId, sourcePaths, move);
	});
	ipcMain.handle(CHANNELS.DELETE_ENTRY, async (_e, kbId: string, relPath: string) => {
		await deleteKnowledgeEntry(kbId, relPath);
	});
	ipcMain.handle(CHANNELS.RENAME_ENTRY, async (_e, kbId: string, relPath: string, newName: string) => {
		await renameKnowledgeEntry(kbId, relPath, newName);
	});
	ipcMain.handle(CHANNELS.CREATE, async (_e, name: string) => {
		await createKnowledgeBase(name);
	});
	ipcMain.handle(CHANNELS.DELETE, async (_e, name: string) => {
		await deleteKnowledgeBase(name);
	});
	ipcMain.handle(CHANNELS.RENAME, async (_e, oldName: string, newName: string) => {
		await renameKnowledgeBase(oldName, newName);
	});
}

export function unregisterKnowledgeIpc(): void {
	for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
}

/**
 * 知识库相关 IPC：
 * - 手动「立即整理」（起一轮加工）、保存设置后重载轮询器。
 * - raws ↔ UI 的读（list/tree）与写（增删改，走特权互斥写）。
 * 缓存重建无需手动触发——由加工轮收尾与轮询器启动自愈自动完成。
 */

import { ipcMain } from "electron";
import {
	recordKnowledgeBaseClearWiki,
	recordKnowledgeBaseFilesAdded,
	recordKnowledgeBaseFilesDeleted,
	recordKnowledgeBaseManualScan,
	recordKnowledgeBaseRetryFailed,
} from "../app-monitor/app-monitor-service.js";
import { readDesktopConfig } from "../ipc/fs.js";
import { getAppLogger } from "../logger.js";
import {
	isKnowledgeProcessing,
	reloadKnowledgePoller,
	retryFailedKnowledge,
	runKnowledgeRound,
	scheduleKnowledgeBaseCurrentSnapshot,
} from "./poller.js";
import {
	addFilesToKnowledgeBase,
	createKnowledgeBase,
	deleteKnowledgeBase,
	deleteKnowledgeEntry,
	listKnowledgeBases,
	listKnowledgeDir,
	renameKnowledgeBase,
	renameKnowledgeEntry,
} from "./raws-fs.js";
import { getKnowledgeFileStatuses } from "./status.js";
import { clearAllWiki, clearProcessingRecords, deleteWikiForEntries } from "./wiki-ops.js";

const log = getAppLogger("kb-ipc");

const CHANNELS = {
	SCAN_NOW: "vetta:kb:scan-now",
	RETRY_FAILED: "vetta:kb:retry-failed",
	RELOAD: "vetta:kb:reload",
	IS_PROCESSING: "vetta:kb:is-processing",
	LIST: "vetta:kb:list",
	LIST_DIR: "vetta:kb:list-dir",
	STATUSES: "vetta:kb:statuses",
	ADD_FILES: "vetta:kb:add-files",
	DELETE_ENTRY: "vetta:kb:delete-entry",
	RENAME_ENTRY: "vetta:kb:rename-entry",
	CREATE: "vetta:kb:create",
	DELETE: "vetta:kb:delete",
	RENAME: "vetta:kb:rename",
	CLEAR_WIKI: "vetta:kb:clear-wiki",
	CLEAR_RECORDS: "vetta:kb:clear-records",
	DELETE_WIKI: "vetta:kb:delete-wiki",
} as const;

export function registerKnowledgeIpc(): void {
	ipcMain.handle(CHANNELS.SCAN_NOW, async () => {
		log.info("manual scan triggered");
		recordKnowledgeBaseManualScan();
		// 手动整理与定时一致：用配置的加工模型与并发数（即使「永不自动加工」也能手动跑）。
		const kb = (await readDesktopConfig()).knowledgeBase;
		return runKnowledgeRound(kb?.processingModelKey, kb?.agentConcurrency ?? 3, kb?.processingModelReasoningLevel);
	});
	ipcMain.handle(CHANNELS.RETRY_FAILED, async () => {
		log.info("retry failed knowledge triggered");
		recordKnowledgeBaseRetryFailed();
		const kb = (await readDesktopConfig()).knowledgeBase;
		return retryFailedKnowledge(kb?.processingModelKey, kb?.agentConcurrency ?? 3, kb?.processingModelReasoningLevel);
	});
	ipcMain.handle(CHANNELS.RELOAD, async () => {
		await reloadKnowledgePoller();
		scheduleKnowledgeBaseCurrentSnapshot();
	});

	ipcMain.handle(CHANNELS.IS_PROCESSING, async () => isKnowledgeProcessing());
	ipcMain.handle(CHANNELS.LIST, async () => listKnowledgeBases());
	ipcMain.handle(CHANNELS.LIST_DIR, async (_e, kbId: string, relPath: string) =>
		listKnowledgeDir(kbId, relPath ?? ""),
	);
	ipcMain.handle(CHANNELS.STATUSES, async () => getKnowledgeFileStatuses());
	ipcMain.handle(CHANNELS.ADD_FILES, async (_e, kbId: string, sourcePaths: string[], move: boolean) => {
		await addFilesToKnowledgeBase(kbId, sourcePaths, move);
		recordKnowledgeBaseFilesAdded(sourcePaths.length);
		scheduleKnowledgeBaseCurrentSnapshot();
	});
	ipcMain.handle(CHANNELS.DELETE_ENTRY, async (_e, kbId: string, relPath: string) => {
		await deleteKnowledgeEntry(kbId, relPath);
		recordKnowledgeBaseFilesDeleted(1);
		scheduleKnowledgeBaseCurrentSnapshot();
	});
	ipcMain.handle(CHANNELS.RENAME_ENTRY, async (_e, kbId: string, relPath: string, newName: string) => {
		await renameKnowledgeEntry(kbId, relPath, newName);
		scheduleKnowledgeBaseCurrentSnapshot();
	});
	ipcMain.handle(CHANNELS.CREATE, async (_e, name: string) => {
		await createKnowledgeBase(name);
		scheduleKnowledgeBaseCurrentSnapshot();
	});
	ipcMain.handle(CHANNELS.DELETE, async (_e, name: string) => {
		await deleteKnowledgeBase(name);
		scheduleKnowledgeBaseCurrentSnapshot();
	});
	ipcMain.handle(CHANNELS.RENAME, async (_e, oldName: string, newName: string) => {
		await renameKnowledgeBase(oldName, newName);
		scheduleKnowledgeBaseCurrentSnapshot();
	});
	ipcMain.handle(CHANNELS.CLEAR_WIKI, async () => {
		log.info("clear all wiki triggered");
		await clearAllWiki();
		recordKnowledgeBaseClearWiki();
		scheduleKnowledgeBaseCurrentSnapshot();
	});
	ipcMain.handle(CHANNELS.CLEAR_RECORDS, async () => {
		log.info("clear processing records triggered");
		await clearProcessingRecords();
	});
	ipcMain.handle(CHANNELS.DELETE_WIKI, async (_e, kbId: string, relPaths: string[]) => {
		await deleteWikiForEntries(kbId, relPaths);
	});
}

export function unregisterKnowledgeIpc(): void {
	for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
}

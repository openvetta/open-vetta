import { type FSWatcher, watch } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { atomicWriteFileAsync } from "@vetta/toolkit/atomic-write";
import { BrowserWindow } from "electron";
import { SPACES_CHANNELS, type SpaceStoreSnapshot } from "../../shared/spaces-ipc.js";
import { getAppLogger } from "../logger.js";
import { SpaceStore, type SpaceStoreFileIo } from "./space-store.js";

const log = getAppLogger("spaces");
/** 别的进程写完文件后，合并短时间内的多次事件再重读。 */
const RELOAD_DEBOUNCE_MS = 150;

export function getSpaceStorePath(): string {
	return resolve(getVettaHomePath(), "spaces.v1.json");
}

function isMissingFile(error: unknown): boolean {
	return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

export function createSpaceStoreFileIo(path: string, now: () => number = Date.now): SpaceStoreFileIo {
	return {
		read: async () => {
			try {
				return await readFile(path, "utf8");
			} catch (error) {
				if (isMissingFile(error)) return undefined;
				throw error;
			}
		},
		write: (content) => atomicWriteFileAsync(path, content),
		backupCorrupt: (content) => writeFile(`${path}.corrupt-${now()}`, content, "utf8"),
	};
}

function broadcast(snapshot: SpaceStoreSnapshot): void {
	for (const win of BrowserWindow.getAllWindows()) {
		if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
		win.webContents.send(SPACES_CHANNELS.CHANGED, snapshot);
	}
}

let store: SpaceStore | undefined;
let watcher: FSWatcher | undefined;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

/** 进程内唯一的工作空间存储（ADR-0160）。 */
export function getSpaceStore(): SpaceStore {
	store ??= new SpaceStore({ io: createSpaceStoreFileIo(getSpaceStorePath()), onChanged: broadcast, log });
	return store;
}

/**
 * 监听其他进程（共用 `~/.vetta` 的另一个安装）对文件的改写。监听目录而非文件：原子写是
 * 「写临时文件再改名」，文件级 watcher 会在第一次替换后失效。监听失败只影响跨进程的实时性。
 */
export function watchSpaceStore(): () => void {
	if (watcher) return stopWatchingSpaceStore;
	const path = getSpaceStorePath();
	const name = basename(path);
	try {
		watcher = watch(dirname(path), (_event, changed) => {
			if (changed && changed.toString() !== name) return;
			if (reloadTimer) clearTimeout(reloadTimer);
			reloadTimer = setTimeout(() => {
				reloadTimer = undefined;
				void getSpaceStore()
					.reloadFromDisk()
					.catch((error: unknown) => log.warn("failed to reload space store", error));
			}, RELOAD_DEBOUNCE_MS);
		});
		watcher.on("error", (error) => {
			log.warn("space store watcher stopped", error);
			stopWatchingSpaceStore();
		});
	} catch (error) {
		log.warn("failed to watch space store", error);
	}
	return stopWatchingSpaceStore;
}

function stopWatchingSpaceStore(): void {
	if (reloadTimer) clearTimeout(reloadTimer);
	reloadTimer = undefined;
	watcher?.close();
	watcher = undefined;
}

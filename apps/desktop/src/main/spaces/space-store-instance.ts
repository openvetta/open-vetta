import { type Stats, unwatchFile, watchFile } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { atomicWriteFileAsync } from "@vetta/toolkit/atomic-write";
import { BrowserWindow } from "electron";
import { SPACES_CHANNELS, type SpaceStoreSnapshot } from "../../shared/spaces-ipc.js";
import { getAppLogger } from "../logger.js";
import { SpaceStore, type SpaceStoreFileIo } from "./space-store.js";

const log = getAppLogger("spaces");
/** 跨进程改写的轮询间隔。只 stat 一个文件，开销可以忽略。 */
const POLL_INTERVAL_MS = 2_000;

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
let watching: { path: string; listener: (current: Stats, previous: Stats) => void } | undefined;

/** 进程内唯一的工作空间存储（ADR-0160）。 */
export function getSpaceStore(): SpaceStore {
	store ??= new SpaceStore({ io: createSpaceStoreFileIo(getSpaceStorePath()), onChanged: broadcast, log });
	return store;
}

/**
 * 发现其他进程（共用 `~/.vetta` 的另一个安装）对文件的改写。
 *
 * 用 stat 轮询而不是 `fs.watch`：`fs.watch` 只能监听整个 `~/.vetta` 目录（原子写会换掉文件），
 * 那里会话与日志持续高频写入，在 Electron 主进程里触发过 FSEvents 段错误导致启动闪退。
 * 轮询只看这一个文件的 mtime/大小，文件尚不存在也能工作；`persistent: false` 不阻止退出。
 */
export function watchSpaceStore(): () => void {
	if (watching) return stopWatchingSpaceStore;
	const path = getSpaceStorePath();
	const listener = (current: Stats, previous: Stats): void => {
		if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
		void getSpaceStore()
			.reloadFromDisk()
			.catch((error: unknown) => log.warn("failed to reload space store", error));
	};
	try {
		watchFile(path, { interval: POLL_INTERVAL_MS, persistent: false }, listener);
		watching = { path, listener };
	} catch (error) {
		log.warn("failed to watch space store", error);
	}
	return stopWatchingSpaceStore;
}

function stopWatchingSpaceStore(): void {
	if (!watching) return;
	unwatchFile(watching.path, watching.listener);
	watching = undefined;
}

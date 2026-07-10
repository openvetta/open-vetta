import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { app, ipcMain, shell, type WebContents } from "electron";

const DOWNLOAD_CHANNELS = {
	START: "vetta:downloads:start",
	PAUSE: "vetta:downloads:pause",
	RESUME: "vetta:downloads:resume",
	CANCEL: "vetta:downloads:cancel",
	REMOVE: "vetta:downloads:remove",
	LIST: "vetta:downloads:list",
	OPEN_FILE: "vetta:downloads:open-file",
	SHOW_IN_FOLDER: "vetta:downloads:show-in-folder",
	GET_DEFAULT_DIR: "vetta:downloads:get-default-dir",
	EVENT: "vetta:downloads:event",
} as const;

export { DOWNLOAD_CHANNELS };

export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "canceled";

export interface DownloadItem {
	id: string;
	url: string;
	filename: string;
	path: string;
	totalBytes: number; // 0 if unknown
	receivedBytes: number;
	status: DownloadStatus;
	error?: string;
	createdAt: number;
	completedAt?: number;
	speedBytesPerSec?: number;
}

interface DownloadEvent {
	type: "added" | "updated" | "removed";
	item?: DownloadItem;
	id?: string;
}

interface InternalState {
	items: Map<string, DownloadItem>;
	// 当前正在下载的 id 集合
	active: Set<string>;
	// 队列：等待下载的 id（FIFO）
	queue: string[];
	// 取消请求函数（中止当前 HTTP 请求并 destroy 写流）
	abortFns: Map<string, () => void>;
	// 速率统计
	rates: Map<string, { lastBytes: number; lastTs: number }>;
}

const MAX_CONCURRENT = 2;
const STATE_FILE_NAME = "downloads.json";

let state: InternalState;
let stateFilePath: string;
let webContentsRef: WebContents | null = null;

function getDownloadsDir(): string {
	try {
		return app.getPath("downloads");
	} catch {
		return tmpdir();
	}
}

function getStoreDir(): string {
	const dir = join(app.getPath("userData"), "downloads");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

function loadPersistedItems(): DownloadItem[] {
	try {
		if (!existsSync(stateFilePath)) return [];
		const raw = readFileSync(stateFilePath, "utf-8");
		const arr = JSON.parse(raw) as DownloadItem[];
		return Array.isArray(arr) ? arr : [];
	} catch {
		return [];
	}
}

function persist(): void {
	try {
		const items = Array.from(state.items.values()).filter(
			(it) =>
				it.status === "completed" || it.status === "failed" || it.status === "canceled" || it.status === "paused",
		);
		writeFileSync(stateFilePath, JSON.stringify(items, null, 2), "utf-8");
	} catch {
		// ignore
	}
}

function emit(event: DownloadEvent): void {
	if (!webContentsRef || webContentsRef.isDestroyed()) return;
	webContentsRef.send(DOWNLOAD_CHANNELS.EVENT, event);
}

function notifyUpdated(item: DownloadItem): void {
	emit({ type: "updated", item: { ...item } });
}

function notifyAdded(item: DownloadItem): void {
	emit({ type: "added", item: { ...item } });
}

function notifyRemoved(id: string): void {
	emit({ type: "removed", id });
}

function uniqueFilename(dir: string, name: string): string {
	let candidate = join(dir, name);
	if (!existsSync(candidate)) return candidate;
	const ext = extname(name);
	const base = basename(name, ext);
	let i = 1;
	while (existsSync(candidate)) {
		candidate = join(dir, `${base} (${i})${ext}`);
		i++;
	}
	return candidate;
}

function ensureDir(p: string): void {
	const d = dirname(p);
	if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function makeId(): string {
	return `dl_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

interface StartParams {
	url: string;
	filename?: string;
	headers?: Record<string, string>;
	saveDir?: string;
}

function addDownload(params: StartParams): DownloadItem {
	const dir = params.saveDir || getDownloadsDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const inferredName = params.filename || decodeURIComponent(basename(new URL(params.url).pathname)) || "download";
	const finalPath = uniqueFilename(dir, inferredName);

	const item: DownloadItem = {
		id: makeId(),
		url: params.url,
		filename: basename(finalPath),
		path: finalPath,
		totalBytes: 0,
		receivedBytes: 0,
		status: "queued",
		createdAt: Date.now(),
	};
	state.items.set(item.id, item);
	state.queue.push(item.id);
	notifyAdded(item);
	pump(params.headers);
	return item;
}

function pump(headers?: Record<string, string>): void {
	while (state.active.size < MAX_CONCURRENT && state.queue.length > 0) {
		const id = state.queue.shift();
		if (!id) break;
		const item = state.items.get(id);
		if (!item || item.status !== "queued") continue;
		state.active.add(id);
		startTransfer(item, headers).catch((err) => {
			item.status = "failed";
			item.error = err instanceof Error ? err.message : String(err);
			notifyUpdated(item);
			state.active.delete(id);
			persist();
			pump(headers);
		});
	}
}

function startTransfer(item: DownloadItem, headers?: Record<string, string>): Promise<void> {
	return new Promise((resolve, reject) => {
		const url = new URL(item.url);
		const isHttps = url.protocol === "https:";
		const requester = isHttps ? httpsRequest : httpRequest;

		// 断点续传：若已存在部分文件且已记录 receivedBytes，使用 Range
		let resumeFrom = 0;
		if (existsSync(item.path)) {
			try {
				const st = statSync(item.path);
				resumeFrom = st.size;
				item.receivedBytes = resumeFrom;
			} catch {
				resumeFrom = 0;
			}
		}

		const reqHeaders: Record<string, string> = { ...(headers ?? {}) };
		if (resumeFrom > 0) {
			reqHeaders.Range = `bytes=${resumeFrom}-`;
		}

		item.status = "downloading";
		notifyUpdated(item);

		const req = requester(
			{
				protocol: url.protocol,
				hostname: url.hostname,
				port: url.port || (isHttps ? 443 : 80),
				path: `${url.pathname}${url.search}`,
				method: "GET",
				headers: reqHeaders,
			},
			(res) => {
				// 重定向
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					const redirectUrl = new URL(res.headers.location, url).toString();
					item.url = redirectUrl;
					res.resume();
					startTransfer(item, headers).then(resolve, reject);
					return;
				}

				if (res.statusCode === 416) {
					// Range not satisfiable — 已完成
					item.status = "completed";
					item.completedAt = Date.now();
					notifyUpdated(item);
					state.active.delete(item.id);
					persist();
					pump(headers);
					resolve();
					return;
				}

				if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
					reject(new Error(`HTTP ${res.statusCode}`));
					return;
				}

				const lengthHeader = res.headers["content-length"];
				const partLength = lengthHeader ? Number(lengthHeader) : 0;
				if (res.statusCode === 206) {
					// 部分内容；总大小由 Content-Range
					const cr = res.headers["content-range"];
					if (cr) {
						const m = /\/(\d+)$/.exec(cr);
						if (m) item.totalBytes = Number(m[1]);
					}
				} else {
					// 全量
					item.totalBytes = partLength;
					item.receivedBytes = 0;
					if (existsSync(item.path)) {
						try {
							rmSyncSafe(item.path);
						} catch {
							// ignore
						}
					}
				}
				notifyUpdated(item);

				ensureDir(item.path);
				const writeStream = createWriteStream(item.path, {
					flags: resumeFrom > 0 && res.statusCode === 206 ? "a" : "w",
				});

				let aborted = false;
				const abort = () => {
					aborted = true;
					req.destroy();
					writeStream.destroy();
				};
				state.abortFns.set(item.id, abort);
				state.rates.set(item.id, { lastBytes: item.receivedBytes, lastTs: Date.now() });

				res.on("data", (chunk: Buffer) => {
					if (aborted) return;
					writeStream.write(chunk);
					item.receivedBytes += chunk.length;
					updateRate(item);
					notifyUpdated(item);
				});

				res.on("end", () => {
					if (aborted) return;
					writeStream.end();
					writeStream.on("close", () => {
						state.abortFns.delete(item.id);
						state.rates.delete(item.id);
						state.active.delete(item.id);
						if (item.status !== "canceled" && item.status !== "paused") {
							item.status = "completed";
							item.completedAt = Date.now();
							notifyUpdated(item);
						}
						persist();
						pump(headers);
						resolve();
					});
				});

				res.on("error", (err) => {
					writeStream.destroy();
					state.abortFns.delete(item.id);
					state.rates.delete(item.id);
					state.active.delete(item.id);
					reject(err);
				});
			},
		);

		req.on("error", (err) => {
			state.abortFns.delete(item.id);
			state.rates.delete(item.id);
			state.active.delete(item.id);
			reject(err);
		});

		req.end();
	});
}

function rmSyncSafe(p: string): void {
	try {
		rmSync(p, { force: true });
	} catch {
		// ignore
	}
}

function updateRate(item: DownloadItem): void {
	const r = state.rates.get(item.id);
	if (!r) return;
	const now = Date.now();
	const dt = now - r.lastTs;
	if (dt < 500) return;
	const db = item.receivedBytes - r.lastBytes;
	item.speedBytesPerSec = Math.round((db / dt) * 1000);
	r.lastBytes = item.receivedBytes;
	r.lastTs = now;
}

function pauseDownload(id: string): void {
	const item = state.items.get(id);
	if (!item) return;
	if (item.status === "downloading") {
		item.status = "paused";
		item.speedBytesPerSec = 0;
		state.abortFns.get(id)?.();
		state.abortFns.delete(id);
		state.active.delete(id);
		notifyUpdated(item);
		persist();
		pump();
	} else if (item.status === "queued") {
		item.status = "paused";
		const idx = state.queue.indexOf(id);
		if (idx >= 0) state.queue.splice(idx, 1);
		notifyUpdated(item);
		persist();
	}
}

function resumeDownload(id: string): void {
	const item = state.items.get(id);
	if (!item) return;
	if (item.status === "paused" || item.status === "failed") {
		item.status = "queued";
		item.error = undefined;
		state.queue.push(id);
		notifyUpdated(item);
		pump();
	}
}

export function cancelDownload(id: string): void {
	if (!state) return;
	const item = state.items.get(id);
	if (!item) return;
	state.abortFns.get(id)?.();
	state.abortFns.delete(id);
	state.active.delete(id);
	const qIdx = state.queue.indexOf(id);
	if (qIdx >= 0) state.queue.splice(qIdx, 1);
	item.status = "canceled";
	item.speedBytesPerSec = 0;
	notifyUpdated(item);
	persist();
	pump();
}

async function removeDownload(id: string, deleteFile: boolean): Promise<void> {
	const item = state.items.get(id);
	if (!item) return;
	cancelDownload(id);
	state.items.delete(id);
	if (deleteFile && existsSync(item.path)) {
		try {
			await rm(item.path, { force: true });
		} catch {
			// ignore
		}
	}
	notifyRemoved(id);
	persist();
}

export function listDownloads(): DownloadItem[] {
	if (!state) return [];
	return Array.from(state.items.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function registerDownloadsIpc(webContents: WebContents): () => void {
	webContentsRef = webContents;
	stateFilePath = join(getStoreDir(), STATE_FILE_NAME);

	state = {
		items: new Map(),
		active: new Set(),
		queue: [],
		abortFns: new Map(),
		rates: new Map(),
	};

	// 恢复历史记录（仅作为列表展示，状态保持原样；进行中的会被标为 paused）
	for (const it of loadPersistedItems()) {
		if (it.status === "downloading" || it.status === "queued") {
			it.status = "paused";
			it.speedBytesPerSec = 0;
		}
		state.items.set(it.id, it);
	}

	ipcMain.handle(DOWNLOAD_CHANNELS.START, async (_e, params: StartParams) => {
		return addDownload(params);
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.PAUSE, async (_e, id: string) => {
		pauseDownload(id);
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.RESUME, async (_e, id: string) => {
		resumeDownload(id);
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.CANCEL, async (_e, id: string) => {
		cancelDownload(id);
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.REMOVE, async (_e, id: string, deleteFile: boolean) => {
		await removeDownload(id, deleteFile);
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.LIST, async () => {
		return listDownloads();
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.OPEN_FILE, async (_e, id: string) => {
		const item = state.items.get(id);
		if (!item || !existsSync(item.path)) return;
		await shell.openPath(item.path);
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.SHOW_IN_FOLDER, async (_e, id: string) => {
		const item = state.items.get(id);
		if (!item) return;
		shell.showItemInFolder(item.path);
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.GET_DEFAULT_DIR, async () => getDownloadsDir());

	return () => {
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.START);
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.PAUSE);
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.RESUME);
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.CANCEL);
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.REMOVE);
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.LIST);
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.OPEN_FILE);
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.SHOW_IN_FOLDER);
		ipcMain.removeHandler(DOWNLOAD_CHANNELS.GET_DEFAULT_DIR);
	};
}

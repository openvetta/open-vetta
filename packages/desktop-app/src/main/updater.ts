import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "@vetta/coding-agent/config";
import { app, type BrowserWindow } from "electron";

import { DEFAULT_SERVER_URL } from "./constants.js";
import { canPerformInPlaceUpdate, installAndRestart, preferredAssetExtension } from "./updater-install.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 服务端响应类型 ───

interface ReleaseAsset {
	id: number;
	platform: string;
	arch: string;
	file_name: string;
	file_size: number;
	content_type: string;
	/** 安装包 sha256，下载后校验；摘要机制之前发布的存量安装包为空，跳过校验 */
	sha256?: string;
}

interface LatestRelease {
	version: string;
	release_note: string;
	assets: ReleaseAsset[];
	published_at: string;
}

// ─── 旧版兼容：保留 checkForUpdate / getAppVersion 导出 ───

export interface UpdateCheckResult {
	hasUpdate: boolean;
	currentVersion: string;
	latestVersion?: string;
	releaseNote?: string;
	downloadUrl?: string;
	error?: string;
}

// ─── Updater 状态 ───

export type UpdaterPhase = "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "error";

export interface UpdaterState {
	phase: UpdaterPhase;
	currentVersion: string;
	latestVersion?: string;
	releaseNote?: string;
	/** 0..1 */
	progress?: number;
	downloadedBytes?: number;
	totalBytes?: number;
	assetFileName?: string;
	/** 检查/下载/安装失败时的错误信息（中文） */
	error?: string;
	/** 用户已下载、待重启安装；true 时 sidebar 应显示"待重启"提示 */
	pendingInstall: boolean;
}

interface PendingInstallRecord {
	version: string;
	assetPath: string;
	stagingDir: string;
	platform: string;
	arch: string;
	downloadedAt: number;
}

// ─── 工具函数 ───

function getSettings(): Record<string, unknown> {
	const settingsPath = join(getAgentDir(), "settings.json");
	try {
		return JSON.parse(readFileSync(settingsPath, "utf-8"));
	} catch {
		return {};
	}
}

/** 三段式版本号比较：lv > cv 返回 true */
function compareVersions(current: string, latest: string): boolean {
	const c = current.split(".").map(Number);
	const l = latest.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		const cv = c[i] || 0;
		const lv = l[i] || 0;
		if (lv > cv) return true;
		if (lv < cv) return false;
	}
	return false;
}

export function getAppVersion(): string {
	return app.isPackaged
		? app.getVersion()
		: (JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8")).version as string);
}

function getPlatformId(): string {
	if (process.platform === "darwin") return "darwin";
	if (process.platform === "win32") return "win32";
	return "linux";
}

function getArchId(): string {
	return process.arch === "arm64" ? "arm64" : "x64";
}

function getServerUrl(): string {
	return DEFAULT_SERVER_URL.replace(/\/$/, "");
}

/**
 * 从 release.assets 里挑出最适合无感更新的资产：
 * 1. platform + arch 完全匹配；
 * 2. 文件扩展名匹配该平台无感更新偏好（.zip / .exe / .AppImage）；
 * 3. 若同时存在多个匹配项，选 file_size 最大的（兜底）。
 */
function pickAsset(release: LatestRelease, platform: string, arch: string): ReleaseAsset | undefined {
	const matching = release.assets.filter((a) => a.platform === platform && a.arch === arch);
	if (matching.length === 0) return undefined;
	const ext = preferredAssetExtension(process.platform);
	const preferred = matching.filter((a) => a.file_name.toLowerCase().endsWith(ext.toLowerCase()));
	const pool = preferred.length > 0 ? preferred : matching;
	return pool.reduce((best, cur) => (cur.file_size > best.file_size ? cur : best));
}

// ─── pending-install.json 持久化 ───

function getUpdatesDir(): string {
	return join(app.getPath("userData"), "updates");
}

function getPendingRecordPath(): string {
	return join(getUpdatesDir(), "pending-install.json");
}

function readPendingRecord(): PendingInstallRecord | undefined {
	const path = getPendingRecordPath();
	if (!existsSync(path)) return undefined;
	try {
		const data = JSON.parse(readFileSync(path, "utf-8")) as PendingInstallRecord;
		if (!data.assetPath || !existsSync(data.assetPath)) {
			rmSync(path, { force: true });
			return undefined;
		}
		return data;
	} catch {
		rmSync(path, { force: true });
		return undefined;
	}
}

function writePendingRecord(record: PendingInstallRecord): void {
	mkdirSync(getUpdatesDir(), { recursive: true });
	writeFileSync(getPendingRecordPath(), JSON.stringify(record, null, 2));
}

function clearPendingRecord(): void {
	rmSync(getPendingRecordPath(), { force: true });
}

// ─── 检查更新（兼容旧 API） ───

export async function checkForUpdate(): Promise<UpdateCheckResult> {
	const currentVersion = getAppVersion();
	const platform = getPlatformId();
	const arch = getArchId();
	const settings = getSettings();
	const serverToken = settings.serverToken as string | undefined;

	if (!serverToken) {
		return { hasUpdate: false, currentVersion, error: "未登录" };
	}

	try {
		const url = `${getServerUrl()}/releases/latest?platform=${platform}&arch=${arch}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${serverToken}`,
			},
		});
		clearTimeout(timeout);

		if (!response.ok) {
			if (response.status === 404) return { hasUpdate: false, currentVersion };
			return { hasUpdate: false, currentVersion, error: `HTTP ${response.status}` };
		}

		const body = (await response.json()) as { code: number; data?: LatestRelease; message?: string };
		if (body.code !== 0 || !body.data) {
			return { hasUpdate: false, currentVersion, error: body.message };
		}

		const latest = body.data;
		const hasUpdate = compareVersions(currentVersion, latest.version);
		const downloadUrl = hasUpdate
			? `${getServerUrl()}/releases/${latest.version}/download?platform=${platform}&arch=${arch}`
			: undefined;

		return {
			hasUpdate,
			currentVersion,
			latestVersion: latest.version,
			releaseNote: latest.release_note,
			downloadUrl,
		};
	} catch {
		return { hasUpdate: false, currentVersion, error: "检查更新失败" };
	}
}

// ─── UpdaterService ───

const EVENT_CHANNEL = "vetta:updater:state";

class UpdaterService {
	private state: UpdaterState;
	private mainWindow: BrowserWindow | null = null;
	private latestRelease: LatestRelease | null = null;
	private selectedAsset: ReleaseAsset | null = null;
	private downloadAbort: AbortController | null = null;
	private lastEmitAt = 0;

	constructor() {
		this.state = {
			phase: "idle",
			currentVersion: getAppVersion(),
			pendingInstall: false,
		};
	}

	setMainWindow(win: BrowserWindow): void {
		this.mainWindow = win;
		// 窗口建好后立刻推一次当前状态，方便 renderer 启动时拿到
		this.emit(true);
	}

	getState(): UpdaterState {
		return { ...this.state };
	}

	/** 启动时调用：恢复 pending-install 状态 + 触发后台 check */
	async onAppReady(): Promise<void> {
		const pending = readPendingRecord();
		if (pending && pending.platform === getPlatformId() && pending.arch === getArchId()) {
			// 用版本号判断是否真的还有"待安装"——install 成功后新版本启动时，
			// pending-install.json 因为 detached swap.sh 异步执行可能没被及时清理，
			// 但 currentVersion 一定 ≥ pending.version。此时清理掉。
			const upgradeStillPending = compareVersions(getAppVersion(), pending.version);
			if (!upgradeStillPending) {
				rmSync(pending.stagingDir, { recursive: true, force: true });
				clearPendingRecord();
			} else {
				this.state = {
					...this.state,
					phase: "ready",
					latestVersion: pending.version,
					assetFileName: pending.assetPath.split(/[/\\]/).pop(),
					pendingInstall: true,
				};
				this.selectedAsset = {
					id: 0,
					platform: pending.platform,
					arch: pending.arch,
					file_name: pending.assetPath.split(/[/\\]/).pop() ?? "",
					file_size: 0,
					content_type: "",
				};
				this.emit(true);
			}
		}
		// 不 await：check 在后台异步执行，不阻塞启动
		void this.check();
	}

	async check(): Promise<UpdaterState> {
		// pending-install 已在场：不再覆盖状态（用户已经处于 ready）
		if (this.state.pendingInstall && this.state.phase === "ready") {
			return this.getState();
		}

		this.setState({ phase: "checking", error: undefined });
		const result = await checkForUpdate();

		if (result.error) {
			this.setState({ phase: "idle", error: result.error });
			return this.getState();
		}
		if (!result.hasUpdate || !result.latestVersion) {
			this.setState({ phase: "idle", error: undefined });
			return this.getState();
		}

		// 拉一次完整 release（拿 assets）
		const release = await this.fetchLatestRelease();
		if (!release) {
			this.setState({ phase: "idle", error: "无法获取版本资产清单" });
			return this.getState();
		}
		const asset = pickAsset(release, getPlatformId(), getArchId());
		if (!asset) {
			this.setState({
				phase: "idle",
				error: `当前平台（${getPlatformId()}-${getArchId()}）暂无对应安装包`,
			});
			return this.getState();
		}

		this.latestRelease = release;
		this.selectedAsset = asset;
		this.setState({
			phase: "available",
			latestVersion: release.version,
			releaseNote: release.release_note,
			assetFileName: asset.file_name,
			totalBytes: asset.file_size,
			error: undefined,
		});
		return this.getState();
	}

	private async fetchLatestRelease(): Promise<LatestRelease | null> {
		const settings = getSettings();
		const serverToken = settings.serverToken as string | undefined;
		if (!serverToken) return null;
		try {
			const url = `${getServerUrl()}/releases/latest?platform=${getPlatformId()}&arch=${getArchId()}`;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10_000);
			const response = await fetch(url, {
				signal: controller.signal,
				headers: { Accept: "application/json", Authorization: `Bearer ${serverToken}` },
			});
			clearTimeout(timeout);
			if (!response.ok) return null;
			const body = (await response.json()) as { code: number; data?: LatestRelease };
			if (body.code !== 0 || !body.data) return null;
			return body.data;
		} catch {
			return null;
		}
	}

	/** 用户点击 sidebar icon 触发后台静默下载 */
	async startDownload(): Promise<UpdaterState> {
		if (this.state.phase === "downloading") return this.getState();
		if (this.state.phase === "ready") return this.getState();
		if (!this.selectedAsset || !this.latestRelease) {
			// 没 check 过：自动 check 一次
			await this.check();
			if (this.state.phase !== "available") return this.getState();
		}
		if (!canPerformInPlaceUpdate()) {
			this.setState({
				phase: "error",
				error: app.isPackaged ? "当前平台不支持无感更新，请前往发版页面手动下载" : "开发模式不支持无感更新",
			});
			return this.getState();
		}

		const release = this.latestRelease;
		const asset = this.selectedAsset;
		if (!release || !asset) return this.getState();

		const settings = getSettings();
		const serverToken = settings.serverToken as string | undefined;
		if (!serverToken) {
			this.setState({ phase: "error", error: "未登录，无法下载更新" });
			return this.getState();
		}

		const stagingDir = join(getUpdatesDir(), release.version);
		mkdirSync(stagingDir, { recursive: true });
		const assetPath = join(stagingDir, asset.file_name);

		this.setState({
			phase: "downloading",
			progress: 0,
			downloadedBytes: 0,
			totalBytes: asset.file_size,
			error: undefined,
		});

		this.downloadAbort = new AbortController();
		try {
			await this.downloadStream(release.version, serverToken, assetPath, asset.file_size, asset.sha256);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "下载失败";
			rmSync(assetPath, { force: true });
			this.downloadAbort = null;
			this.setState({ phase: "error", error: msg });
			return this.getState();
		}
		this.downloadAbort = null;

		// 落 pending-install 记录
		writePendingRecord({
			version: release.version,
			assetPath,
			stagingDir,
			platform: getPlatformId(),
			arch: getArchId(),
			downloadedAt: Date.now(),
		});

		this.setState({
			phase: "ready",
			progress: 1,
			downloadedBytes: asset.file_size,
			pendingInstall: true,
			error: undefined,
		});
		return this.getState();
	}

	private async downloadStream(
		version: string,
		serverToken: string,
		destPath: string,
		expectedSize: number,
		expectedSha256?: string,
	): Promise<void> {
		const url = `${getServerUrl()}/releases/${version}/download?platform=${getPlatformId()}&arch=${getArchId()}`;
		const response = await fetch(url, {
			signal: this.downloadAbort?.signal,
			headers: { Authorization: `Bearer ${serverToken}` },
		});
		if (!response.ok || !response.body) {
			throw new Error(`下载失败：HTTP ${response.status}`);
		}

		const total = Number(response.headers.get("Content-Length") || expectedSize || 0);
		const writeStream = createWriteStream(destPath);
		const reader = response.body.getReader();
		// 边下边算摘要，避免安装包落盘后再整个读一遍
		const hash = createHash("sha256");
		let received = 0;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) {
					received += value.byteLength;
					hash.update(value);
					await new Promise<void>((resolve, reject) => {
						writeStream.write(value, (err) => (err ? reject(err) : resolve()));
					});
					this.maybeEmitProgress(received, total);
				}
			}
		} finally {
			await new Promise<void>((resolve) => writeStream.end(resolve));
		}

		// 摘要校验：服务端提供了 sha256 才做（存量安装包没有）
		if (expectedSha256) {
			const actual = hash.digest("hex");
			if (actual !== expectedSha256.toLowerCase()) {
				throw new Error(`安装包校验失败：内容摘要与服务端不一致（期望 ${expectedSha256}，实际 ${actual}）`);
			}
		}

		// 大小校验（弱完整性检查，缺 hash 时的兜底）
		try {
			const actualSize = statSync(destPath).size;
			if (expectedSize > 0 && actualSize !== expectedSize) {
				throw new Error(`下载文件大小不匹配（${actualSize} vs ${expectedSize}）`);
			}
		} catch (err) {
			if (err instanceof Error && err.message.includes("不匹配")) throw err;
			// stat 失败忽略
		}
	}

	private maybeEmitProgress(received: number, total: number): void {
		const now = Date.now();
		// 节流：≤ 4 次/秒
		if (now - this.lastEmitAt < 250 && received < total) return;
		this.lastEmitAt = now;
		this.state = {
			...this.state,
			downloadedBytes: received,
			totalBytes: total,
			progress: total > 0 ? received / total : 0,
		};
		this.emit(false);
	}

	/** 用户点击「立即重启」 */
	async install(): Promise<void> {
		if (this.state.phase !== "ready") return;
		const pending = readPendingRecord();
		if (!pending) {
			this.setState({ phase: "error", error: "更新文件丢失，请重新下载" });
			return;
		}
		this.setState({ phase: "installing" });
		try {
			await installAndRestart({ assetPath: pending.assetPath, stagingDir: pending.stagingDir });
			// 走到这里说明 app.quit 已触发，下一行不会实际执行
		} catch (err) {
			const msg = err instanceof Error ? err.message : "安装失败";
			this.setState({ phase: "error", error: msg, pendingInstall: true });
		}
	}

	/** 用户点击「稍后」：保留 pending-install，UI 退到 idle 但 pendingInstall=true */
	dismissReady(): void {
		if (this.state.phase !== "ready") return;
		// 状态保持 ready + pendingInstall，下次点击 icon 时仍弹 Dialog；
		// 这里只是关闭对话框层面的视觉提示，不需要状态变更，只发一次事件即可
		this.emit(true);
	}

	/** 用户主动取消下载或丢弃已下载的更新 */
	cancel(): void {
		if (this.downloadAbort) {
			this.downloadAbort.abort();
			this.downloadAbort = null;
		}
		const pending = readPendingRecord();
		if (pending) {
			rmSync(pending.stagingDir, { recursive: true, force: true });
			clearPendingRecord();
		}
		this.latestRelease = null;
		this.selectedAsset = null;
		this.setState({
			phase: "idle",
			progress: undefined,
			downloadedBytes: undefined,
			totalBytes: undefined,
			pendingInstall: false,
			error: undefined,
		});
	}

	private setState(patch: Partial<UpdaterState>): void {
		this.state = { ...this.state, ...patch };
		this.emit(true);
	}

	private emit(force: boolean): void {
		const win = this.mainWindow;
		if (!win || win.isDestroyed()) return;
		if (!force && Date.now() - this.lastEmitAt < 100) return;
		win.webContents.send(EVENT_CHANNEL, this.state);
	}
}

export const updaterService = new UpdaterService();

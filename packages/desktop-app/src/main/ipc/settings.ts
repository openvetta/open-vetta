import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";
import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
import type { RefreshOutcome } from "../../preload/api.js";
import { DEFAULT_SERVER_URL, DEFAULT_SITE_URL } from "../constants.js";
import { getAppLogger } from "../logger.js";
import { peekSharedRuntime } from "../runtime.js";
import { type ModelsConfig, type ProviderConfig, readModelsConfig, writeModelsConfig } from "./fs.js";

const settingsLog = getAppLogger("settings");

function getSettingsPath(): string {
	return join(getAgentDir(), "settings.json");
}

export function readSettings(): Record<string, unknown> {
	const path = getSettingsPath();
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

export function writeSettings(settings: Record<string, unknown>): void {
	atomicWriteJSON(getSettingsPath(), settings);
}

interface RemoteProvidersResult {
	providers: Record<string, unknown>;
	error?: string;
}

// 主进程发起的请求遇到 401 时，广播给所有渲染窗口，
// 让渲染层统一走 logout 流程（清 token / user / 远程 providers / SSE）。
// 不要在这里做任何会影响本地会话的事——本地模型用户可完全离线运行。
function broadcastUnauthorized(): void {
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) {
			win.webContents.send("vetta:auth:unauthorized");
		}
	}
}

// refresh token 流：通知渲染层有新的 access/refresh，由渲染层负责 set atom + localStorage。
function broadcastTokenRefreshed(accessToken: string, refreshToken: string): void {
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) {
			win.webContents.send("vetta:auth:token-refreshed", { accessToken, refreshToken });
		}
	}
}

/**
 * 主进程内部使用的 token refresh。
 * - 进程内单飞（去重）：并发请求只触发一次 refresh。
 * - 成功：写回 settings.json，广播 token-refreshed 给渲染层。
 * - 失败：返回三态结果（见 RefreshOutcome），由调用方决定是否登出。
 *   只有 unauthorized 才该登出；transient（网络/超时/5xx）必须保留会话。
 */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

// 远大于真实刷新延迟（正常 <100ms）。一次性轮转下，绝不能因为短超时丢弃一个
// 服务端可能已提交的轮转响应——那会让 settings.json 永久停在已撤销的 refresh token。
// 这里只用一个宽松上限防止真正挂死的连接无限占用 single-flight。
const REFRESH_TIMEOUT_MS = 30_000;

function persistTokens(access: string, refresh: string): void {
	const settings = readSettings();
	settings.serverToken = access;
	settings.serverRefreshToken = refresh;
	writeSettings(settings);
	// 同步给已运行的 coding-agent session，避免它继续用旧 access token
	const runtime = peekSharedRuntime();
	if (runtime) {
		void runtime.reloadServerAuth(access).catch((err) => {
			settingsLog.warn("reloadServerAuth after refresh failed:", err);
		});
	}
}

export async function tryRefreshAccessToken(): Promise<RefreshOutcome> {
	if (refreshInFlight) return refreshInFlight;
	refreshInFlight = (async (): Promise<RefreshOutcome> => {
		const settings = readSettings();
		const refreshToken = settings.serverRefreshToken as string | undefined;
		if (!refreshToken) return { status: "unauthorized" };
		const url = `${DEFAULT_SERVER_URL.replace(/\/$/, "")}/auth/refresh`;
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
			let response: Response;
			try {
				response = await fetch(url, {
					method: "POST",
					signal: controller.signal,
					headers: {
						Accept: "application/json",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ refresh_token: refreshToken }),
				});
			} finally {
				clearTimeout(timeout);
			}
			// 服务端对 refresh token 失效/过期/撤销一律返回 HTTP 401（见 api errcode 40105/40106/40107）。
			// 这是唯一应当登出的明确信号。
			if (response.status === 401) return { status: "unauthorized" };
			// 其它非 2xx（5xx 等）视为暂时性，保留会话。
			if (!response.ok) return { status: "transient" };
			const body = (await response.json()) as {
				code: number;
				data?: { access_token?: string; refresh_token?: string };
			};
			// 200 但 body 异常：保守按暂时性处理，不登出。
			if (body.code !== 0 || !body.data?.access_token || !body.data?.refresh_token) {
				return { status: "transient" };
			}
			persistTokens(body.data.access_token, body.data.refresh_token);
			broadcastTokenRefreshed(body.data.access_token, body.data.refresh_token);
			return { status: "ok", accessToken: body.data.access_token };
		} catch {
			// 网络失败 / abort / 超时 → 暂时性，绝不登出。
			return { status: "transient" };
		}
	})();
	try {
		return await refreshInFlight;
	} finally {
		refreshInFlight = null;
	}
}

/**
 * 带 401 自动 refresh 的 GET 请求。
 * - 第一次 401 → 尝试 refresh → 拿到新 token 后用新 token 重试一次
 * - refresh 失败或重试仍 401 → 广播 unauthorized，由渲染层决定 logout
 */
async function authedGet(path: string, timeoutMs = 5000): Promise<Response | null> {
	const settings = readSettings();
	let token = settings.serverToken as string | undefined;
	if (!token) return null;
	const url = `${DEFAULT_SERVER_URL.replace(/\/$/, "")}${path}`;
	const doFetch = async (t: string): Promise<Response> => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			return await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${t}`,
				},
			});
		} finally {
			clearTimeout(timer);
		}
	};
	let res = await doFetch(token);
	if (res.status === 401) {
		const outcome = await tryRefreshAccessToken();
		if (outcome.status === "unauthorized") {
			broadcastUnauthorized();
			return res;
		}
		if (outcome.status === "transient") {
			// 暂时性失败（网络/超时/5xx）：保留会话，返回原 401，调用方按"暂不可达"降级。
			return res;
		}
		token = outcome.accessToken;
		res = await doFetch(token);
		if (res.status === 401) {
			// 用刚换来的新 token 仍 401 → 确属鉴权失败，登出。
			broadcastUnauthorized();
		}
	}
	return res;
}

export async function fetchRemoteProviders(): Promise<RemoteProvidersResult> {
	try {
		const response = await authedGet("/providers/models.json");
		if (!response) return { providers: {}, error: "未登录" };
		if (response.status === 401) return { providers: {}, error: "unauthorized" };
		if (!response.ok) return { providers: {}, error: `HTTP ${response.status}` };

		const body = (await response.json()) as { code: number; data?: { providers?: Record<string, unknown> } };
		if (body.code !== 0 || !body.data?.providers) {
			return { providers: {} };
		}
		return { providers: body.data.providers };
	} catch {
		return { providers: {}, error: "服务器不可达" };
	}
}

// ─── 预设模板（provider templates，BYOK 直连，见 ADR-0015 / CONTEXT.md「预设模板」）───

interface ProviderTemplate {
	id: string;
	displayName: string;
	api: string;
	baseUrl?: string;
	icon?: string;
	models: Array<{
		id: string;
		name?: string;
		api?: string;
		reasoning?: boolean;
		input?: string[];
		contextWindow?: number;
		maxTokens?: number;
		cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	}>;
}

interface ProviderTemplatesResult {
	templates: ProviderTemplate[];
	error?: string;
}

/** 服务端 /providers/templates.json 的 provider 形状(公开,不含 key)。 */
interface RemoteTemplateProvider {
	display_name?: string;
	displayName?: string;
	api: string;
	baseUrl?: string;
	base_url?: string;
	icon?: string;
	models?: Array<{
		id: string;
		name?: string;
		api?: string;
		reasoning?: boolean;
		input?: string[];
		contextWindow?: number;
		maxTokens?: number;
		cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	}>;
}

/** 公开免登录 GET——预设模板目录无密钥,不需要也不应带 Authorization。 */
async function publicGet(path: string, timeoutMs = 5000): Promise<Response | null> {
	const url = `${DEFAULT_SERVER_URL.replace(/\/$/, "")}${path}`;
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			return await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
		} finally {
			clearTimeout(timer);
		}
	} catch {
		return null;
	}
}

export async function fetchProviderTemplates(): Promise<ProviderTemplatesResult> {
	const response = await publicGet("/providers/templates.json");
	if (!response) return { templates: [], error: "服务器不可达" };
	if (!response.ok) return { templates: [], error: `HTTP ${response.status}` };
	try {
		const body = (await response.json()) as {
			code: number;
			data?: { providers?: Record<string, RemoteTemplateProvider> };
		};
		if (body.code !== 0 || !body.data?.providers) return { templates: [] };
		const templates: ProviderTemplate[] = [];
		for (const [id, p] of Object.entries(body.data.providers)) {
			templates.push({
				id,
				displayName: p.displayName ?? p.display_name ?? id,
				api: p.api,
				baseUrl: p.baseUrl ?? p.base_url,
				icon: p.icon,
				models: (p.models ?? []).map((m) => ({
					id: m.id,
					name: m.name,
					api: m.api,
					reasoning: m.reasoning,
					input: m.input,
					contextWindow: m.contextWindow,
					maxTokens: m.maxTokens,
					cost: m.cost,
				})),
			});
		}
		return { templates };
	} catch {
		return { templates: [] };
	}
}

/**
 * 在线合并:用服务端模板的最新元数据覆写本地 models.json 中 source:"template" 的条目,
 * 只保留用户填的 apiKey;服务端已删除该模板(byId 无命中)则保留本地快照不动。
 * 手搓自定义服务商(无 source 标记)绝不触碰。返回 models.json 是否被改写。
 */
function mergeAdoptedTemplates(config: ModelsConfig, templates: ProviderTemplate[]): boolean {
	const byId = new Map(templates.map((t) => [t.id, t]));
	let changed = false;
	for (const [name, p] of Object.entries(config.providers)) {
		if (p.source !== "template") continue;
		const t = byId.get(p.templateId ?? name);
		if (!t) continue; // 服务端删除 → 回退快照,保留本地条目
		const merged: ProviderConfig = {
			...p,
			displayName: t.displayName,
			api: t.api,
			baseUrl: t.baseUrl,
			icon: t.icon,
			models: t.models,
		};
		if (JSON.stringify(merged) !== JSON.stringify(p)) {
			config.providers[name] = merged;
			changed = true;
		}
	}
	return changed;
}

/** 拉取模板并就地在线合并已采纳条目。返回 live 模板列表供渲染层展示。 */
export async function syncProviderTemplates(): Promise<ProviderTemplatesResult> {
	const result = await fetchProviderTemplates();
	if (result.templates.length > 0) {
		try {
			const config = await readModelsConfig();
			if (mergeAdoptedTemplates(config, result.templates)) {
				await writeModelsConfig(config);
			}
		} catch (err) {
			settingsLog.warn("mergeAdoptedTemplates failed:", err);
		}
	}
	return result;
}

interface SubscriptionWindow {
	kind: "5h" | "week" | "month";
	limit: number;
	consumed: number;
	reset_at: string;
}

interface SubscriptionStatus {
	active: boolean;
	go_enabled: boolean;
	tier_id?: string;
	tier_name?: string;
	badge_text?: string;
	badge_color?: string;
	description?: string;
	expires_at?: string;
	windows?: SubscriptionWindow[];
}

async function fetchSubscriptionStatus(): Promise<{ status: SubscriptionStatus | null; error?: string }> {
	try {
		const response = await authedGet("/subscription/me");
		if (!response) return { status: null, error: "未登录" };
		if (response.status === 401) return { status: null, error: "unauthorized" };
		if (!response.ok) return { status: null, error: `HTTP ${response.status}` };

		const body = (await response.json()) as { code: number; data?: SubscriptionStatus };
		if (body.code !== 0 || !body.data) {
			return { status: null };
		}
		return { status: body.data };
	} catch {
		return { status: null, error: "服务器不可达" };
	}
}

/**
 * focus / 系统 wake 时若 access token 剩余寿命 < WAKE_REFRESH_THRESHOLD_MS，主动 refresh。
 * 解决"合上笔记本一夜，第二天第一个请求 401 才被动刷新"的体感问题。
 */
const WAKE_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

function decodeAccessTokenExpMs(token: string): number | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
		const json = JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as { exp?: number };
		if (typeof json.exp !== "number") return null;
		return json.exp * 1000;
	} catch {
		return null;
	}
}

function maybeRefreshOnWake(reason: string): void {
	const settings = readSettings();
	const token = settings.serverToken as string | undefined;
	if (!token) return;
	const expMs = decodeAccessTokenExpMs(token);
	if (expMs === null) return;
	const remaining = expMs - Date.now();
	if (remaining > WAKE_REFRESH_THRESHOLD_MS) return;
	// tryRefreshAccessToken 内部有 single-flight，重复触发安全
	void tryRefreshAccessToken().catch((err) => {
		settingsLog.warn(`wake refresh (${reason}) failed:`, err);
	});
}

function registerWakeRefreshHooks(): () => void {
	const onFocus = () => maybeRefreshOnWake("focus");
	const onResume = () => maybeRefreshOnWake("resume");
	app.on("browser-window-focus", onFocus);
	powerMonitor.on("resume", onResume);
	return () => {
		app.off("browser-window-focus", onFocus);
		powerMonitor.off("resume", onResume);
	};
}

export function registerSettingsIpc(): () => void {
	// 清理 settings.json 中残留的 serverUrl，现在统一由环境变量管理
	const settings = readSettings();
	if ("serverUrl" in settings) {
		delete settings.serverUrl;
		writeSettings(settings);
	}

	ipcMain.handle("vetta:settings:get-server-url", () => {
		return DEFAULT_SERVER_URL;
	});

	ipcMain.handle("vetta:settings:get-site-url", () => {
		return DEFAULT_SITE_URL;
	});

	ipcMain.handle("vetta:settings:get-server-token", () => {
		const settings = readSettings();
		return (settings.serverToken as string | undefined) ?? undefined;
	});

	ipcMain.handle("vetta:settings:set-server-token", async (_event, token: unknown) => {
		const settings = readSettings();
		const nextToken = typeof token === "string" ? token : undefined;
		if (nextToken !== undefined) {
			settings.serverToken = nextToken;
		} else {
			delete settings.serverToken;
		}
		writeSettings(settings);
		// Push fresh auth to any active sessions so they pick up the new token
		// without requiring an app restart (fixes 401-after-login bug).
		const runtime = peekSharedRuntime();
		if (runtime) {
			try {
				await runtime.reloadServerAuth(nextToken);
			} catch (err) {
				settingsLog.warn("reloadServerAuth failed:", err);
			}
		}
	});

	ipcMain.handle("vetta:settings:get-server-refresh-token", () => {
		const settings = readSettings();
		return (settings.serverRefreshToken as string | undefined) ?? undefined;
	});

	ipcMain.handle("vetta:settings:set-server-refresh-token", (_event, token: unknown) => {
		const settings = readSettings();
		const nextToken = typeof token === "string" ? token : undefined;
		if (nextToken !== undefined) {
			settings.serverRefreshToken = nextToken;
		} else {
			delete settings.serverRefreshToken;
		}
		writeSettings(settings);
	});

	ipcMain.handle("vetta:models:fetch-remote", async () => {
		return fetchRemoteProviders();
	});

	ipcMain.handle("vetta:models:fetch-templates", async () => {
		return syncProviderTemplates();
	});

	// 启动时静默同步一次:让已采纳的预设模板拿到服务端最新元数据(url/模型/图标),
	// 即便用户从不打开设置页,ModelSelector 也能反映更新。失败静默(离线回退快照)。
	void syncProviderTemplates().catch(() => {});

	ipcMain.handle("vetta:subscription:status", async () => {
		return fetchSubscriptionStatus();
	});

	// 渲染层 401 时统一委托主进程 refresh，避免跨进程并发使用同一 refresh_token
	// 触发服务端 reuse-detection（revoked）导致误踢登录。
	ipcMain.handle("vetta:auth:refresh-token", async () => {
		return tryRefreshAccessToken();
	});

	const teardownWakeHooks = registerWakeRefreshHooks();

	return () => {
		teardownWakeHooks();
		ipcMain.removeHandler("vetta:settings:get-server-url");
		ipcMain.removeHandler("vetta:settings:get-server-token");
		ipcMain.removeHandler("vetta:settings:set-server-token");
		ipcMain.removeHandler("vetta:settings:get-server-refresh-token");
		ipcMain.removeHandler("vetta:settings:set-server-refresh-token");
		ipcMain.removeHandler("vetta:models:fetch-remote");
		ipcMain.removeHandler("vetta:models:fetch-templates");
		ipcMain.removeHandler("vetta:subscription:status");
		ipcMain.removeHandler("vetta:auth:refresh-token");
	};
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent";
import { BrowserWindow, ipcMain } from "electron";

import { DEFAULT_SERVER_URL } from "../constants.js";
import { peekSharedRuntime } from "../runtime.js";
import { atomicWriteJSON } from "../utils/atomic-write.js";

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
 * - 失败：返回 null，由调用方决定是否广播 unauthorized。
 */
let refreshInFlight: Promise<string | null> | null = null;

function persistTokens(access: string, refresh: string): void {
	const settings = readSettings();
	settings.serverToken = access;
	settings.serverRefreshToken = refresh;
	writeSettings(settings);
	// 同步给已运行的 coding-agent session，避免它继续用旧 access token
	const runtime = peekSharedRuntime();
	if (runtime) {
		void runtime.reloadServerAuth(access).catch((err) => {
			console.warn("[settings ipc] reloadServerAuth after refresh failed:", err);
		});
	}
}

async function tryRefreshAccessToken(): Promise<string | null> {
	if (refreshInFlight) return refreshInFlight;
	refreshInFlight = (async () => {
		const settings = readSettings();
		const refreshToken = settings.serverRefreshToken as string | undefined;
		if (!refreshToken) return null;
		const url = `${DEFAULT_SERVER_URL.replace(/\/$/, "")}/auth/refresh`;
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5000);
			const response = await fetch(url, {
				method: "POST",
				signal: controller.signal,
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ refresh_token: refreshToken }),
			});
			clearTimeout(timeout);
			if (!response.ok) return null;
			const body = (await response.json()) as {
				code: number;
				data?: { access_token?: string; refresh_token?: string };
			};
			if (body.code !== 0 || !body.data?.access_token || !body.data?.refresh_token) return null;
			persistTokens(body.data.access_token, body.data.refresh_token);
			broadcastTokenRefreshed(body.data.access_token, body.data.refresh_token);
			return body.data.access_token;
		} catch {
			return null;
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
		const newToken = await tryRefreshAccessToken();
		if (!newToken) {
			broadcastUnauthorized();
			return res;
		}
		token = newToken;
		res = await doFetch(token);
		if (res.status === 401) {
			broadcastUnauthorized();
		}
	}
	return res;
}

async function fetchRemoteProviders(): Promise<RemoteProvidersResult> {
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

async function fetchCreditsBalance(): Promise<{ balance: number | null; unlimited?: boolean }> {
	try {
		const response = await authedGet("/credits/balance");
		if (!response) return { balance: null };
		if (!response.ok) return { balance: null };

		const body = (await response.json()) as { code: number; data?: { balance?: number; unlimited?: boolean } };
		if (body.code !== 0) {
			return { balance: null };
		}
		return { balance: body.data?.balance ?? null, unlimited: body.data?.unlimited };
	} catch {
		return { balance: null };
	}
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
				console.warn("[settings ipc] reloadServerAuth failed:", err);
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

	ipcMain.handle("vetta:credits:balance", async () => {
		return fetchCreditsBalance();
	});

	return () => {
		ipcMain.removeHandler("vetta:settings:get-server-url");
		ipcMain.removeHandler("vetta:settings:get-server-token");
		ipcMain.removeHandler("vetta:settings:set-server-token");
		ipcMain.removeHandler("vetta:settings:get-server-refresh-token");
		ipcMain.removeHandler("vetta:settings:set-server-refresh-token");
		ipcMain.removeHandler("vetta:models:fetch-remote");
		ipcMain.removeHandler("vetta:credits:balance");
	};
}

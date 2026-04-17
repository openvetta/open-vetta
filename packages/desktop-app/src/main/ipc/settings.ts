import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent";
import { ipcMain } from "electron";

import { DEFAULT_SERVER_URL } from "../constants.js";
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

async function fetchRemoteProviders(): Promise<RemoteProvidersResult> {
	const settings = readSettings();
	const serverUrl = DEFAULT_SERVER_URL;
	const serverToken = settings.serverToken as string | undefined;
	if (!serverToken) {
		return { providers: {}, error: "未登录" };
	}

	try {
		const url = `${serverUrl.replace(/\/$/, "")}/providers/models.json`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${serverToken}`,
			},
		});
		clearTimeout(timeout);

		if (response.status === 401) {
			return { providers: {}, error: "unauthorized" };
		}
		if (!response.ok) {
			return { providers: {}, error: `HTTP ${response.status}` };
		}

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
	const settings = readSettings();
	const serverUrl = DEFAULT_SERVER_URL;
	const serverToken = settings.serverToken as string | undefined;
	if (!serverToken) {
		return { balance: null };
	}

	try {
		const url = `${serverUrl.replace(/\/$/, "")}/credits/balance`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${serverToken}`,
			},
		});
		clearTimeout(timeout);

		if (!response.ok) {
			return { balance: null };
		}

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

	ipcMain.handle("vetta:settings:set-server-token", (_event, token: unknown) => {
		const settings = readSettings();
		if (typeof token === "string") {
			settings.serverToken = token;
		} else {
			delete settings.serverToken;
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
		ipcMain.removeHandler("vetta:models:fetch-remote");
		ipcMain.removeHandler("vetta:credits:balance");
	};
}

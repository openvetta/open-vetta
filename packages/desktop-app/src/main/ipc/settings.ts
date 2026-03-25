import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent";
import { ipcMain } from "electron";

const DEFAULT_SERVER_URL = "http://REDACTED-HOST:8080/api/v1";

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
	const path = getSettingsPath();
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
}

interface RemoteProvidersResult {
	providers: Record<string, unknown>;
	error?: string;
}

async function fetchRemoteProviders(): Promise<RemoteProvidersResult> {
	const settings = readSettings();
	let serverUrl = settings.serverUrl as string | undefined;
	if (!serverUrl) {
		serverUrl = DEFAULT_SERVER_URL;
		settings.serverUrl = serverUrl;
		writeSettings(settings);
	}
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

export function registerSettingsIpc(): () => void {
	ipcMain.handle("vetta:settings:get-server-url", () => {
		const settings = readSettings();
		let url = settings.serverUrl as string | undefined;
		if (!url) {
			url = DEFAULT_SERVER_URL;
			settings.serverUrl = url;
			writeSettings(settings);
		}
		return url;
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

	return () => {
		ipcMain.removeHandler("vetta:settings:get-server-url");
		ipcMain.removeHandler("vetta:settings:get-server-token");
		ipcMain.removeHandler("vetta:settings:set-server-token");
		ipcMain.removeHandler("vetta:models:fetch-remote");
	};
}

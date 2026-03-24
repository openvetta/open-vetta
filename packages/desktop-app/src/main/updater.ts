import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent";
import { app } from "electron";

const DEFAULT_SERVER_URL = "http://REDACTED-HOST:8080/api/v1";

interface ReleaseAsset {
	platform: string;
	arch: string;
	file_name: string;
	file_size: number;
}

interface LatestRelease {
	version: string;
	release_note: string;
	assets: ReleaseAsset[];
	published_at: string;
}

export interface UpdateCheckResult {
	hasUpdate: boolean;
	currentVersion: string;
	latestVersion?: string;
	releaseNote?: string;
	downloadUrl?: string;
	error?: string;
}

function getSettings(): Record<string, unknown> {
	const settingsPath = join(getAgentDir(), "settings.json");
	try {
		return JSON.parse(readFileSync(settingsPath, "utf-8"));
	} catch {
		return {};
	}
}

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

export async function checkForUpdate(): Promise<UpdateCheckResult> {
	const currentVersion = app.getVersion();
	const platform = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";
	const arch = process.arch === "arm64" ? "arm64" : "x64";

	const settings = getSettings();
	const serverUrl = (settings.serverUrl as string) || DEFAULT_SERVER_URL;
	const serverToken = settings.serverToken as string | undefined;

	if (!serverToken) {
		return { hasUpdate: false, currentVersion, error: "未登录" };
	}

	try {
		const url = `${serverUrl.replace(/\/$/, "")}/releases/latest?platform=${platform}&arch=${arch}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${serverToken}`,
			},
		});
		clearTimeout(timeout);

		if (!response.ok) {
			if (response.status === 404) {
				return { hasUpdate: false, currentVersion };
			}
			return { hasUpdate: false, currentVersion, error: `HTTP ${response.status}` };
		}

		const body = (await response.json()) as { code: number; data?: LatestRelease; message?: string };
		if (body.code !== 0 || !body.data) {
			return { hasUpdate: false, currentVersion, error: body.message };
		}

		const latest = body.data;
		const hasUpdate = compareVersions(currentVersion, latest.version);

		const downloadUrl = hasUpdate
			? `${serverUrl.replace(/\/$/, "")}/releases/${latest.version}/download?platform=${platform}&arch=${arch}`
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

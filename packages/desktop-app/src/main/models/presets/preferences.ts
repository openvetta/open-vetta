import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";

/**
 * 预设服务商的展示偏好。存在 settings.json 而不是渲染层 localStorage——
 * 主进程的后台定时同步也要按它决定往 models.json 里写哪些模型。
 *
 * 刻意不复用 ipc/settings.ts 的读写函数:那边 import 本模块所在的 sync.ts,会成环。
 */
const SETTINGS_KEY = "presetShowAllModels";

function settingsPath(): string {
	return join(getAgentDir(), "settings.json");
}

function read(): Record<string, unknown> {
	const path = settingsPath();
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
	} catch {
		return {};
	}
}

/** true = 展示各家全部模型;默认 false = 每个系列只留最新一档。 */
export function getShowAllPresetModels(): boolean {
	return read()[SETTINGS_KEY] === true;
}

export function setShowAllPresetModels(showAll: boolean): void {
	const settings = read();
	if (showAll) {
		settings[SETTINGS_KEY] = true;
	} else {
		delete settings[SETTINGS_KEY];
	}
	atomicWriteJSON(settingsPath(), settings);
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";
import { net } from "electron";
import { getAppLogger } from "../../logger.js";
import { getDesktopModelSettingsService } from "../model-settings-host.js";
import type { ModelsConfig } from "../model-settings-service.js";
import { getPresetProvider, PRESET_PROVIDERS } from "./catalog.js";
import { fetchPresetModels, type PresetModelsResult } from "./fetch.js";
import { enrichFromCatalog, fetchModelsDevCatalog, isCatalogFresh, type ModelsDevCatalog } from "./models-dev.js";

const presetLog = getAppLogger("preset-providers");

const FETCH_TIMEOUT_MS = 15_000;
const CATALOG_PATH = join(getVettaHomePath(), "agent", "models-dev-cache.json");
/** 后台同步间隔:12 小时。上游模型目录变动没那么快,再密就是白烧流量。 */
const AUTO_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** 下发给渲染层的预设目录条目(内置,不含 key)。 */
export interface PresetProviderInfo {
	id: string;
	displayName: string;
	api: string;
	baseUrl: string;
	icon: string;
}

export function listPresetProviders(): PresetProviderInfo[] {
	return PRESET_PROVIDERS.map((def) => ({
		id: def.id,
		displayName: def.displayName,
		api: def.api,
		baseUrl: def.baseUrl,
		icon: def.icon,
	}));
}

/** 进程内缓存,避免同一次同步里六家各拉一遍 3MB 的目录。 */
let catalogMemo: ModelsDevCatalog | null = null;

async function readCatalogCache(): Promise<ModelsDevCatalog | null> {
	try {
		return JSON.parse(await readFile(CATALOG_PATH, "utf8")) as ModelsDevCatalog;
	} catch {
		return null;
	}
}

/**
 * 取 models.dev 目录:内存 → 磁盘缓存 → 网络。过期或拉取失败都退回旧缓存,
 * 一份都没有就返回 null(此时只展示各家接口自己给的字段,不显示价格)。
 */
async function getModelsDevCatalog(): Promise<ModelsDevCatalog | null> {
	const now = Date.now();
	if (isCatalogFresh(catalogMemo, now)) return catalogMemo;
	catalogMemo ??= await readCatalogCache();
	if (isCatalogFresh(catalogMemo, now)) return catalogMemo;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const fresh = await fetchModelsDevCatalog(net.fetch, now, controller.signal);
		catalogMemo = fresh;
		atomicWriteJSON(CATALOG_PATH, fresh);
	} catch (err) {
		presetLog.warn("拉取 models.dev 目录失败，改用缓存：", err);
	} finally {
		clearTimeout(timer);
	}
	return catalogMemo;
}

/**
 * 拉取某预设服务商的模型列表,并用 models.dev 目录补齐价格/上下文等接口不返回的字段。
 * 只读不写——由渲染层拿到结果后连同 key 一起落盘,避免主进程与渲染层各写一次 models.json。
 *
 * apiKey 缺省时读 models.json 里已保存的 key(手动刷新场景)。
 */
export async function refreshPresetModels(providerId: string, apiKey?: string): Promise<PresetModelsResult> {
	const def = getPresetProvider(providerId);
	if (!def) return { models: [], error: `未知预设服务商：${providerId}` };

	let key = apiKey?.trim();
	if (!key) {
		const config = await getDesktopModelSettingsService().getConfig();
		key = config.providers[providerId]?.apiKey?.trim();
	}
	if (!key) return { models: [], error: "尚未填写 API Key" };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	let result: PresetModelsResult;
	try {
		result = await fetchPresetModels(def, key, net.fetch, controller.signal);
	} finally {
		clearTimeout(timer);
	}
	if (result.models.length === 0) return result;

	const catalog = await getModelsDevCatalog();
	return { ...result, models: result.models.map((model) => enrichFromCatalog(catalog, def.id, model)) };
}

/** models.json 里由预设采纳而来、且填了 key 的条目。 */
function adoptedPresetIds(config: ModelsConfig): string[] {
	return Object.entries(config.providers)
		.filter(([id, provider]) => {
			if (provider.source !== "template") return false;
			if (!provider.apiKey?.trim()) return false;
			return Boolean(getPresetProvider(provider.templateId ?? id));
		})
		.map(([id]) => id);
}

/**
 * 后台同步所有已启用的预设服务商的模型列表并写回 models.json。
 * 单个失败静默跳过(保留本地快照),不影响其它服务商。
 */
export async function syncAdoptedPresets(): Promise<void> {
	const service = getDesktopModelSettingsService();
	const config = await service.getConfig();
	const ids = adoptedPresetIds(config);
	if (ids.length === 0) return;

	const results = await Promise.all(
		ids.map(async (id) => {
			const templateId = config.providers[id]?.templateId ?? id;
			const result = await refreshPresetModels(templateId, config.providers[id]?.apiKey);
			return { id, result };
		}),
	);

	// 重新读一次:同步期间渲染层可能改过配置,不能拿旧快照整体覆盖。
	const latest = await service.getConfig();
	let changed = false;
	const syncedAt = new Date().toISOString();
	for (const { id, result } of results) {
		const provider = latest.providers[id];
		if (!provider || provider.source !== "template") continue;
		if (result.error || result.models.length === 0) {
			presetLog.warn(`同步预设服务商 ${id} 模型失败：${result.error ?? "空列表"}`);
			continue;
		}
		latest.providers[id] = { ...provider, models: result.models, modelsSyncedAt: syncedAt };
		changed = true;
	}
	if (changed) await service.replaceConfig(latest);
}

/** 启动时同步一次,之后每 12 小时一次。返回清理函数。 */
export function startPresetModelsAutoSync(): () => void {
	const run = (): void => {
		void syncAdoptedPresets().catch((err) => {
			presetLog.warn("预设模型自动同步失败：", err);
		});
	};
	run();
	const timer = setInterval(run, AUTO_SYNC_INTERVAL_MS);
	return () => clearInterval(timer);
}

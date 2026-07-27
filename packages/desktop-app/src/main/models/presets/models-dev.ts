import type { ModelDefinition } from "../model-settings-service.js";
import type { FetchImpl } from "./fetch.js";

/**
 * models.dev 目录:补齐各家 `/models` 不返回的元数据(价格、上下文长度、视觉/思考能力)。
 *
 * 六家的 `/models` 一律不给价格,OpenAI / DeepSeek / GLM 连上下文长度都不给。曾用手写
 * 静态表补,但各家发版一快就全错(见 ADR-0050),改为拉这份社区维护、跟各家发版更新的目录。
 * 拉不到就用磁盘缓存,再没有就只展示接口给的字段——绝不显示猜的价格。
 */

const CATALOG_URL = "https://models.dev/api.json";
/** 目录变动按天计,12 小时一拉,与预设模型列表同步节奏一致。 */
export const CATALOG_TTL_MS = 12 * 60 * 60 * 1000;

/** 预设标识 → models.dev 的 provider key。 */
const PROVIDER_KEYS: Record<string, string> = {
	claude: "anthropic",
	openai: "openai",
	deepseek: "deepseek",
	zai: "zai",
	kimi: "moonshotai",
	gemini: "google",
};

interface RawModel {
	name?: string;
	reasoning?: boolean;
	reasoning_options?: Array<{ type?: string; values?: string[] }>;
	modalities?: { input?: string[] };
	limit?: { context?: number; output?: number };
	cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
}

/** 只保留六家、只保留用得上的字段——原始 api.json 有 170+ 家、3MB 出头。 */
export interface ModelsDevCatalog {
	fetchedAt: string;
	/** 预设标识 → 模型 id → 元数据。 */
	providers: Record<string, Record<string, ModelDefinition>>;
}

export function isCatalogFresh(catalog: ModelsDevCatalog | null, now: number): boolean {
	if (!catalog) return false;
	const fetchedAt = Date.parse(catalog.fetchedAt);
	return Number.isFinite(fetchedAt) && now - fetchedAt < CATALOG_TTL_MS;
}

export async function fetchModelsDevCatalog(
	fetchImpl: FetchImpl,
	now: number,
	signal?: AbortSignal,
): Promise<ModelsDevCatalog> {
	const response = await fetchImpl(CATALOG_URL, {
		method: "GET",
		signal,
		headers: { Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`models.dev 返回 ${response.status} ${response.statusText}`);
	const body = (await response.json()) as Record<string, { models?: Record<string, RawModel> }>;
	return { fetchedAt: new Date(now).toISOString(), providers: shrink(body) };
}

function shrink(body: Record<string, { models?: Record<string, RawModel> }>): ModelsDevCatalog["providers"] {
	const providers: ModelsDevCatalog["providers"] = {};
	for (const [presetId, key] of Object.entries(PROVIDER_KEYS)) {
		const models = body[key]?.models;
		if (!models) continue;
		const entries: Record<string, ModelDefinition> = {};
		for (const [id, raw] of Object.entries(models)) {
			entries[id] = toModelDefinition(id, raw);
		}
		providers[presetId] = entries;
	}
	return providers;
}

function toModelDefinition(id: string, raw: RawModel): ModelDefinition {
	const levels = raw.reasoning_options?.find((option) => option.type === "effort")?.values;
	const input = raw.modalities?.input?.filter((modality) => modality === "text" || modality === "image");
	const cost = raw.cost;
	return {
		id,
		...(raw.name ? { name: raw.name } : {}),
		...(raw.reasoning === undefined ? {} : { reasoning: raw.reasoning }),
		...(raw.reasoning && levels?.length ? { reasoningLevels: levels } : {}),
		...(input?.length ? { input } : {}),
		...(raw.limit?.context ? { contextWindow: raw.limit.context } : {}),
		...(raw.limit?.output ? { maxTokens: raw.limit.output } : {}),
		...(cost?.input === undefined
			? {}
			: {
					cost: {
						input: cost.input,
						output: cost.output ?? 0,
						cacheRead: cost.cache_read ?? 0,
						cacheWrite: cost.cache_write ?? 0,
					},
				}),
	};
}

/**
 * 目录里查某个模型。先精确匹配,再去掉 `-YYYYMMDD` 日期后缀,最后退化为最长前缀匹配
 * (各家常有 `-latest` / `-preview` / 日期变体,共享同一份定价)。
 */
export function lookupCatalogModel(
	catalog: ModelsDevCatalog | null,
	presetId: string,
	modelId: string,
): ModelDefinition | undefined {
	const models = catalog?.providers[presetId];
	if (!models) return undefined;
	const exact = models[modelId];
	if (exact) return exact;
	const undated = modelId.replace(/-\d{8}$/, "");
	if (undated !== modelId && models[undated]) return models[undated];
	let best: ModelDefinition | undefined;
	let bestLength = 0;
	for (const [id, model] of Object.entries(models)) {
		if (id.length > bestLength && undated.startsWith(id)) {
			best = model;
			bestLength = id.length;
		}
	}
	return best;
}

/**
 * 用目录补齐接口没给的字段。接口给了的一律以接口为准(它最清楚自己开了什么),
 * 价格只能来自目录——查不到就不带价格,不猜。
 */
export function enrichFromCatalog(
	catalog: ModelsDevCatalog | null,
	presetId: string,
	model: ModelDefinition,
): ModelDefinition {
	const meta = lookupCatalogModel(catalog, presetId, model.id);
	return {
		...model,
		...(model.name === undefined && meta?.name !== undefined ? { name: meta.name } : {}),
		...(model.reasoning === undefined && meta?.reasoning !== undefined ? { reasoning: meta.reasoning } : {}),
		...(model.reasoningLevels === undefined && meta?.reasoningLevels !== undefined
			? { reasoningLevels: meta.reasoningLevels }
			: {}),
		input: model.input ?? meta?.input ?? ["text"],
		...(model.contextWindow === undefined && meta?.contextWindow !== undefined
			? { contextWindow: meta.contextWindow }
			: {}),
		...(model.maxTokens === undefined && meta?.maxTokens !== undefined ? { maxTokens: meta.maxTokens } : {}),
		...(meta?.cost ? { cost: meta.cost } : {}),
	};
}

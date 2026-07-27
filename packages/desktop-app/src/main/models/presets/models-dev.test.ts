import { describe, expect, it } from "vitest";
import type { FetchImpl } from "./fetch.js";
import {
	CATALOG_TTL_MS,
	enrichFromCatalog,
	fetchModelsDevCatalog,
	isCatalogFresh,
	lookupCatalogModel,
	type ModelsDevCatalog,
} from "./models-dev.js";

const NOW = Date.parse("2026-07-27T00:00:00Z");

const RAW_API_JSON = {
	anthropic: {
		models: {
			"claude-opus-4-8": {
				name: "Claude Opus 4.8",
				reasoning: true,
				reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
				modalities: { input: ["text", "image", "pdf"], output: ["text"] },
				limit: { context: 1000000, output: 128000 },
				cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
			},
		},
	},
	deepseek: {
		models: {
			"deepseek-v4-flash": {
				name: "DeepSeek V4 Flash",
				reasoning: true,
				modalities: { input: ["text"], output: ["text"] },
				limit: { context: 1000000, output: 384000 },
				cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
			},
		},
	},
	// 不在预设六家里,应当被裁掉。
	somebody: { models: { "x-1": { name: "X" } } },
};

async function fetchCatalog(): Promise<ModelsDevCatalog> {
	const fetchImpl: FetchImpl = async (url) => {
		expect(url).toBe("https://models.dev/api.json");
		return { ok: true, status: 200, statusText: "OK", json: async () => RAW_API_JSON } as Response;
	};
	return fetchModelsDevCatalog(fetchImpl, NOW);
}

describe("models.dev 目录", () => {
	it("只保留预设六家并折算成 ModelDefinition", async () => {
		const catalog = await fetchCatalog();

		expect(Object.keys(catalog.providers).sort()).toEqual(["claude", "deepseek"]);
		expect(catalog.providers.deepseek["deepseek-v4-flash"]).toEqual({
			id: "deepseek-v4-flash",
			name: "DeepSeek V4 Flash",
			reasoning: true,
			input: ["text"],
			contextWindow: 1000000,
			maxTokens: 384000,
			cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
		});
		// pdf 不是我们支持的输入模态,应被过滤;effort 等级转成 reasoningLevels。
		expect(catalog.providers.claude["claude-opus-4-8"]).toMatchObject({
			input: ["text", "image"],
			reasoningLevels: ["low", "high", "max"],
		});
	});

	it("新鲜度按 12 小时判定", async () => {
		const catalog = await fetchCatalog();

		expect(isCatalogFresh(catalog, NOW)).toBe(true);
		expect(isCatalogFresh(catalog, NOW + CATALOG_TTL_MS - 1)).toBe(true);
		expect(isCatalogFresh(catalog, NOW + CATALOG_TTL_MS)).toBe(false);
		expect(isCatalogFresh(null, NOW)).toBe(false);
	});

	it("查不到精确 id 时退化为去日期后缀与最长前缀匹配", async () => {
		const catalog = await fetchCatalog();

		expect(lookupCatalogModel(catalog, "claude", "claude-opus-4-8-20260204")?.id).toBe("claude-opus-4-8");
		expect(lookupCatalogModel(catalog, "claude", "claude-opus-4-8-thinking")?.id).toBe("claude-opus-4-8");
		expect(lookupCatalogModel(catalog, "claude", "claude-sonnet-9")).toBeUndefined();
	});

	it("接口给了的字段优先,价格只来自目录", async () => {
		const catalog = await fetchCatalog();

		// 接口自报 200k 上下文与不支持思考,不能被目录覆盖。
		const merged = enrichFromCatalog(catalog, "claude", {
			id: "claude-opus-4-8",
			contextWindow: 200000,
			reasoning: false,
		});

		expect(merged).toMatchObject({
			contextWindow: 200000,
			reasoning: false,
			name: "Claude Opus 4.8",
			input: ["text", "image"],
			cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
		});
	});

	it("目录缺失时不编造价格,输入模态兜底为 text", () => {
		const merged = enrichFromCatalog(null, "openai", { id: "gpt-9-unknown" });

		expect(merged).toEqual({ id: "gpt-9-unknown", input: ["text"] });
	});
});

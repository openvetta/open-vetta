import type { ModelDefinition } from "../model-settings-service.js";

/**
 * 预设服务商模型的静态能力/价格补充表(截至 2026-07,best-effort)。
 *
 * 各家 `/models` 接口都不返回价格,部分(OpenAI / DeepSeek / GLM)连上下文长度、
 * 视觉、思考能力都不返回。这里按模型 id 正则补齐:
 * - 接口给了的字段一律以接口为准(Anthropic / Kimi / Gemini 的元数据更权威);
 * - `cost` 只能来自这张表,匹配不到就不显示价格,不臆造。
 *
 * 规则按数组顺序取首个命中,越具体的写在越前面。
 */
interface ModelMetaRule {
	readonly match: RegExp;
	readonly meta: Omit<ModelDefinition, "id">;
}

const TEXT = ["text"];
const VISION = ["text", "image"];

const META_RULES: Record<string, readonly ModelMetaRule[]> = {
	claude: [
		{
			match: /opus/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 200_000,
				cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
			},
		},
		{
			match: /sonnet/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 200_000,
				cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
			},
		},
		{
			match: /haiku/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 200_000,
				cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
			},
		},
	],
	openai: [
		{
			match: /^gpt-5.*-nano/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 400_000,
				cost: { input: 0.05, output: 0.4, cacheRead: 0.005, cacheWrite: 0 },
			},
		},
		{
			match: /^gpt-5.*-mini/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 400_000,
				cost: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
			},
		},
		{
			match: /^gpt-5/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 400_000,
				cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
			},
		},
		{
			match: /^gpt-4\.1-nano/,
			meta: {
				input: VISION,
				contextWindow: 1_047_576,
				cost: { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0 },
			},
		},
		{
			match: /^gpt-4\.1-mini/,
			meta: {
				input: VISION,
				contextWindow: 1_047_576,
				cost: { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0 },
			},
		},
		{
			match: /^gpt-4\.1/,
			meta: {
				input: VISION,
				contextWindow: 1_047_576,
				cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
			},
		},
		{
			match: /^gpt-4o-mini/,
			meta: {
				input: VISION,
				contextWindow: 128_000,
				cost: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
			},
		},
		{
			match: /^gpt-4o/,
			meta: {
				input: VISION,
				contextWindow: 128_000,
				cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
			},
		},
		{
			match: /^o[34]-mini/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 200_000,
				cost: { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 0 },
			},
		},
		{
			match: /^o3/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 200_000,
				cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
			},
		},
	],
	deepseek: [
		{
			match: /reasoner|thinking/,
			meta: {
				input: TEXT,
				reasoning: true,
				contextWindow: 128_000,
				cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0 },
			},
		},
		{
			match: /chat|v3|v4/,
			meta: {
				input: TEXT,
				contextWindow: 128_000,
				cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0 },
			},
		},
	],
	zai: [
		{
			match: /glm-4(\.\d+)?v/,
			meta: {
				input: VISION,
				reasoning: true,
				contextWindow: 64_000,
				cost: { input: 0.6, output: 1.8, cacheRead: 0.11, cacheWrite: 0 },
			},
		},
		{
			match: /air|flash/,
			meta: {
				input: TEXT,
				reasoning: true,
				contextWindow: 128_000,
				cost: { input: 0.2, output: 1.1, cacheRead: 0.03, cacheWrite: 0 },
			},
		},
		{
			match: /^glm-/,
			meta: {
				input: TEXT,
				reasoning: true,
				contextWindow: 200_000,
				cost: { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 },
			},
		},
	],
	kimi: [
		{
			match: /^kimi-k\d/,
			meta: {
				input: TEXT,
				reasoning: true,
				contextWindow: 256_000,
				cost: { input: 0.6, output: 2.5, cacheRead: 0.15, cacheWrite: 0 },
			},
		},
		{
			match: /^kimi-.*vl|vision/,
			meta: {
				input: VISION,
				contextWindow: 128_000,
				cost: { input: 0.6, output: 2.5, cacheRead: 0.15, cacheWrite: 0 },
			},
		},
		{
			match: /^moonshot-v1/,
			meta: {
				input: TEXT,
				contextWindow: 128_000,
				cost: { input: 0.2, output: 2, cacheRead: 0.05, cacheWrite: 0 },
			},
		},
	],
	gemini: [
		{
			match: /flash-lite/,
			meta: {
				input: VISION,
				reasoning: true,
				cost: { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0 },
			},
		},
		{
			match: /flash/,
			meta: {
				input: VISION,
				reasoning: true,
				cost: { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0 },
			},
		},
		{
			match: /pro/,
			meta: {
				input: VISION,
				reasoning: true,
				cost: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 0 },
			},
		},
	],
};

/**
 * 用静态表补齐接口没给的字段。接口已给的字段一律保留;`cost` 只来自静态表。
 */
export function enrichModel(providerId: string, model: ModelDefinition): ModelDefinition {
	const rule = META_RULES[providerId]?.find((item) => item.match.test(model.id));
	const meta = rule?.meta;
	return {
		...model,
		input: model.input ?? meta?.input ?? TEXT,
		...(model.reasoning === undefined && meta?.reasoning !== undefined ? { reasoning: meta.reasoning } : {}),
		...(model.contextWindow === undefined && meta?.contextWindow !== undefined
			? { contextWindow: meta.contextWindow }
			: {}),
		...(model.maxTokens === undefined && meta?.maxTokens !== undefined ? { maxTokens: meta.maxTokens } : {}),
		...(meta?.cost ? { cost: meta.cost } : {}),
	};
}

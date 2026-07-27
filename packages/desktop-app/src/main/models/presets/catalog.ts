import type { ModelDefinition } from "../model-settings-service.js";
import { enrichModel } from "./metadata.js";

/** 拉取模型列表的适配器种类——各家 /models 接口形状不同,按此分派。 */
export type PresetFetcher = "anthropic" | "openai-compatible" | "gemini";

export interface PresetProviderDef {
	/** 预设标识,同时用作 models.json 里的 provider key 与 templateId。 */
	readonly id: string;
	readonly displayName: string;
	/** 图标 symbol,见 provider-icon/icons.generated.ts。 */
	readonly icon: string;
	readonly api: string;
	readonly baseUrl: string;
	readonly fetcher: PresetFetcher;
	/** 上游 /models 会混入 embedding / tts / 图像等非对话模型,按此过滤。 */
	readonly isChatModel: (id: string) => boolean;
	/** 未填 key 或拉取失败时展示的种子模型 id(仅用于展示,不落盘)。 */
	readonly seedModelIds: readonly string[];
}

const NON_CHAT = /embedding|embed|whisper|tts|audio|realtime|moderation|dall-e|image|transcribe|rerank|vision-ocr/i;

export const PRESET_PROVIDERS: readonly PresetProviderDef[] = [
	{
		id: "claude",
		displayName: "Claude",
		icon: "claude",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		fetcher: "anthropic",
		isChatModel: (id) => id.startsWith("claude-"),
		seedModelIds: ["claude-opus-4-6", "claude-sonnet-4-5", "claude-haiku-4-5"],
	},
	{
		id: "openai",
		displayName: "OpenAI",
		icon: "openai",
		api: "openai-responses",
		baseUrl: "https://api.openai.com/v1",
		fetcher: "openai-compatible",
		isChatModel: (id) => /^(gpt-|o[1345](-|$)|chatgpt-)/.test(id) && !NON_CHAT.test(id),
		seedModelIds: ["gpt-5.1", "gpt-5.1-mini", "gpt-4.1"],
	},
	{
		id: "deepseek",
		displayName: "DeepSeek",
		icon: "deepseek",
		api: "openai-completions-deepseek",
		baseUrl: "https://api.deepseek.com",
		fetcher: "openai-compatible",
		isChatModel: (id) => !NON_CHAT.test(id),
		seedModelIds: ["deepseek-chat", "deepseek-reasoner"],
	},
	{
		id: "zai",
		displayName: "Z.ai (GLM)",
		icon: "zai",
		api: "zai-openai-completions",
		baseUrl: "https://api.z.ai/api/paas/v4",
		fetcher: "openai-compatible",
		isChatModel: (id) => !NON_CHAT.test(id),
		seedModelIds: ["glm-4.6", "glm-4.5", "glm-4.5-air"],
	},
	{
		id: "kimi",
		displayName: "Kimi",
		icon: "kimi",
		api: "openai-completions",
		baseUrl: "https://api.moonshot.ai/v1",
		fetcher: "openai-compatible",
		isChatModel: (id) => !NON_CHAT.test(id),
		seedModelIds: ["kimi-k2-turbo-preview", "moonshot-v1-128k"],
	},
	{
		id: "gemini",
		displayName: "Gemini",
		icon: "gemini",
		api: "google-generative-ai",
		// baseUrl 必须带版本段:google provider 见到 baseUrl 就不再追加 apiVersion。
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		fetcher: "gemini",
		isChatModel: (id) => !NON_CHAT.test(id),
		seedModelIds: ["gemini-2.5-pro", "gemini-2.5-flash"],
	},
];

export function getPresetProvider(id: string): PresetProviderDef | undefined {
	return PRESET_PROVIDERS.find((provider) => provider.id === id);
}

/** 种子模型(离线/未填 key 时展示),能力与价格来自内置静态表。 */
export function getSeedModels(def: PresetProviderDef): ModelDefinition[] {
	return def.seedModelIds.map((id) => enrichModel(def.id, { id }));
}

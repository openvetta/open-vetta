import type { ModelSettingsService, ProviderConfig } from "./model-settings-service.js";

/** 旧版在 Vetta 设置里启用 Magpie 时写下的条目:provider key 与模板标识都是 magpie。 */
const MAGPIE_PROVIDER_ID = "magpie";

export function isLegacyMagpiePreset(provider: ProviderConfig | undefined): boolean {
	return provider?.source === "template" && (provider.templateId ?? MAGPIE_PROVIDER_ID) === MAGPIE_PROVIDER_ID;
}

export interface LegacyMagpieRemoval {
	/** 默认模型原本是 Magpie 的模型,随条目一起被清掉了,接入后要重新选。 */
	readonly defaultModelCleared: boolean;
}

/**
 * 删掉旧版在 Vetta 里启用的 Magpie 条目;没有可删的返回 null。
 *
 * Magpie 改为在其 Agents 页接入 Vetta,是唯一事实源:关掉开关就该没有 Magpie 的模型。
 * 旧条目留着会和 Magpie 写的同名条目冲突——Magpie 接入时把它存起来,断开时又原样还原,
 * 结果「Magpie 关了模型还在」。所以升级后见到就删,由调用方提示用户改去 Magpie 里接入。
 */
export async function removeLegacyMagpiePreset(
	service: Pick<ModelSettingsService, "getConfig" | "removeProvider">,
): Promise<LegacyMagpieRemoval | null> {
	const config = await service.getConfig();
	if (!isLegacyMagpiePreset(config.providers[MAGPIE_PROVIDER_ID])) return null;
	await service.removeProvider(MAGPIE_PROVIDER_ID);
	return { defaultModelCleared: Boolean(config.defaultModel?.startsWith(`${MAGPIE_PROVIDER_ID}/`)) };
}

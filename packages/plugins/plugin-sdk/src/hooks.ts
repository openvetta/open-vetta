import { createContext, useCallback, useContext } from "react";
import type { ConversationMessage, ConversationState } from "./conversation.js";
import { type GenerationMetricsSnapshot, UNSUPPORTED_GENERATION_METRICS } from "./generation-metrics.js";
import { requireBridge } from "./host-bridge.js";
import type { PluginLocales, PluginTranslate } from "./i18n.js";
import { resolveCatalogKey } from "./i18n.js";
import type { PluginPromptAttachment } from "./prompt-attachment.js";
import type { PluginSidebarState } from "./ui.js";

// ─── i18n context (host-provided, per plugin) ───

export interface PluginI18nContextValue {
	/** This plugin's catalogs, keyed by locale code. */
	locales: PluginLocales;
	/** Fallback locale when a key is missing in the current locale. */
	defaultLocale: string;
}

/**
 * Internal: the host wraps plugin-rendered components in this context's Provider,
 * carrying THIS plugin's catalogs. Module Federation shares this single SDK
 * instance, so the value the host provides is visible to {@link useTranslation}.
 */
export const __PluginI18nContext = createContext<PluginI18nContextValue>({
	locales: {},
	defaultLocale: "zh",
});

export interface PluginTranslation {
	/** The host's current locale code (e.g. "zh"). */
	locale: string;
	/** Resolve a bare catalog key at the current locale, with optional `{{params}}`. */
	t: PluginTranslate;
}

/**
 * Reactive translation for plugin React components — re-renders when the host
 * language changes. `t` resolves a BARE catalog key (no `%...%` wrapper) against
 * THIS plugin's catalogs; the host provides them via __PluginI18nContext.
 */
export function useTranslation(): PluginTranslation {
	const locale = requireBridge().useLocale();
	const { locales, defaultLocale } = useContext(__PluginI18nContext);
	const t = useCallback<PluginTranslate>(
		(key, params) => resolveCatalogKey(key, locales, locale, defaultLocale, params),
		[locales, locale, defaultLocale],
	);
	return { locale, t };
}

/** Reactive: the currently-active conversation's state. */
export function useActiveConversation(): ConversationState {
	return requireBridge().useActiveConversation();
}

/** Reactive: the active conversation's messages. */
export function useConversationMessages(): ConversationMessage[] {
	return requireBridge().useConversationMessages();
}

function useUnsupportedGenerationMetrics(): GenerationMetricsSnapshot {
	return UNSUPPORTED_GENERATION_METRICS;
}

/**
 * Reactive: 当前活动会话的生成指标（首字延迟、tok/s、token 用量），由宿主限频刷新。
 * 口径见 {@link GenerationMetricsSnapshot}。
 *
 * 用到它的插件要声明 Plugin API `^2.12.0`：插件运行时 import 的是宿主提供的 SDK 模块，
 * 旧宿主上没有这个导出，插件会整个加载失败。要兼容旧宿主请改用
 * `ctx.conversation.getGenerationMetrics`，并先判断方法是否存在。
 */
export function useGenerationMetrics(): GenerationMetricsSnapshot {
	// 宿主桥没有实现时退回空快照（例如插件在测试里自己装了一个最小桥）。
	// 同一个宿主上这个分支恒定，不违反 hook 调用顺序。
	const useHostMetrics = requireBridge().useGenerationMetrics ?? useUnsupportedGenerationMetrics;
	return useHostMetrics();
}

/**
 * Reactive: the plugin-owned one-shot context attached to the next prompt.
 * Clears automatically after send, capsule close, or session switch.
 */
export function usePromptAttachment(): PluginPromptAttachment | null {
	return requireBridge().usePromptAttachment();
}

/**
 * Reactive: 宿主左侧侧边栏此刻的形态，变化时自动重渲染。
 *
 * 沉浸式工作区视图尤其需要它：侧边栏收起时宿主页头会长出「展开侧边栏」按钮压在左上角，
 * 视图画在那一带的东西要让位。返回值引用稳定，可直接进 useEffect 依赖。
 */
export function useSidebarState(): PluginSidebarState {
	return requireBridge().useSidebarState();
}

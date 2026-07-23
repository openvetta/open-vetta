import { createContext, useCallback, useContext } from "react";
import type { ConversationMessage, ConversationState } from "./conversation.js";
import { requireBridge } from "./host-bridge.js";
import type { PluginLocales, PluginTranslate } from "./i18n.js";
import { resolveCatalogKey } from "./i18n.js";
import type { PluginImageRef } from "./images.js";

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

/**
 * Reactive: the image currently bound as the edit target via
 * `ui.setEditImageAttachment` (or null). Single source of truth for the
 * "selected for edit" highlight — clears automatically when the host drops the
 * attachment (send, capsule close, or session switch).
 */
export function useEditImageAttachment(): PluginImageRef | null {
	return requireBridge().useEditImageAttachment();
}

// i18n 共享常量 / 类型 / locale 归一化。被 main 进程、renderer、preload 三处共用，
// 故放 src/shared（main 用相对 ../shared 引、renderer 用 @/shared 引）。

/** 当前支持的语言。新增语言 = 这里加一项 + 补 locales/<lang>/*.json + 重新构建。 */
export const SUPPORTED_LANGUAGES = ["zh", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * 系统 locale 无法解析（空串 / 读取失败）时的最终兜底 UI 语言。
 * 与 FALLBACK_LANGUAGE 分离：无法推断时的默认语言 vs 缺译回退语言。
 * 首启且 desktop-config.language 未设置时，优先 {@link resolveAppLanguageFromLocale} 跟随系统。
 */
export const DEFAULT_LANGUAGE: AppLanguage = "en";

/** 回退语言：key 缺译文时回退中文，绝不暴露原始 key（见 ADR-0031）。 */
export const FALLBACK_LANGUAGE: AppLanguage = "zh";

/** 命名空间：按 renderer domain 切分 + common（基础件）+ main（主进程原生 UI）。 */
export const NAMESPACES = [
	"common",
	"main",
	"chat",
	"project",
	"pet",
	"settings",
	"message",
	"skills",
	"batch-tasks",
	"automation",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isSupportedLanguage(value: unknown): value is AppLanguage {
	return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * 将 OS / Chromium / navigator locale 归一到 AppLanguage。
 * 中文族（zh、zh-CN、zh-Hans、zh-TW…）→ zh；其余可识别 locale → en；空串 → DEFAULT_LANGUAGE。
 * main（app.getSystemLocale）、onboarding/quickpanel 的 navigator 兜底共用此函数。
 */
export function resolveAppLanguageFromLocale(locale: string | null | undefined): AppLanguage {
	const raw = (locale ?? "").trim().toLowerCase().replace(/_/g, "-");
	if (!raw) return DEFAULT_LANGUAGE;
	if (raw === "zh" || raw.startsWith("zh-")) return "zh";
	return "en";
}

// i18n 共享常量 / 类型 / locale 归一化。被 main 进程、renderer、preload 三处共用，
// 故放 src/shared（main 用相对 ../shared 引、renderer 用 @/shared 引）。

/** 当前支持的语言。新增语言 = 这里加一项 + 补 locales/<lang>/*.json + 重新构建。 */
export const SUPPORTED_LANGUAGES = ["zh", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** 回退语言：key 缺译文时回退中文，绝不暴露原始 key（见 ADR-0031）。 */
export const FALLBACK_LANGUAGE: AppLanguage = "zh";

/** 命名空间：按 renderer domain 切分 + common（基础件）+ main（主进程原生 UI）。 */
export const NAMESPACES = ["common", "main", "chat", "project"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isSupportedLanguage(value: unknown): value is AppLanguage {
	return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

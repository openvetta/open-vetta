import type { ThemeDef } from "../tokens";
import { defaultTheme } from "./default";
import { emeraldTheme } from "./emerald";
import { monoTheme } from "./mono";
import { sandTheme } from "./sand";
import { slateTheme } from "./slate";
import { voltageTheme } from "./voltage";

export const THEMES: ThemeDef[] = [
	sandTheme,
	defaultTheme,
	monoTheme,
	voltageTheme,
	emeraldTheme,
	slateTheme,
];

export const THEME_MAP: Record<string, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export const DEFAULT_THEME_ID = "sand";

/** 已重命名/下线的主题 id，启动时映射到新 id 并写回 localStorage。 */
const THEME_ID_ALIASES: Record<string, string> = {
	github: "slate",
	// 「测试」主题已升为「默认」
	test: "sand",
};

/** 解析存储/入参中的主题 id：别名迁移 + 未知 id 回落默认。 */
export function resolveThemeId(id: string): string {
	const candidate = THEME_ID_ALIASES[id] ?? id;
	return THEME_MAP[candidate] ? candidate : DEFAULT_THEME_ID;
}

export function getTheme(id: string): ThemeDef {
	return THEME_MAP[resolveThemeId(id)] ?? sandTheme;
}

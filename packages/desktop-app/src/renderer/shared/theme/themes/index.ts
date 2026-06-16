import type { ThemeDef } from "../tokens";
import { defaultTheme } from "./default";
import { emeraldTheme } from "./emerald";
import { jadeTheme } from "./jade";
import { monoTheme } from "./mono";
import { neonTheme } from "./neon";
import { oceanTheme } from "./ocean";
import { sandTheme } from "./sand";
import { scarletTheme } from "./scarlet";
import { voltageTheme } from "./voltage";

export const THEMES: ThemeDef[] = [
	sandTheme,
	defaultTheme,
	monoTheme,
	voltageTheme,
	scarletTheme,
	neonTheme,
	oceanTheme,
	jadeTheme,
	emeraldTheme,
];

export const THEME_MAP: Record<string, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export const DEFAULT_THEME_ID = "sand";

export function getTheme(id: string): ThemeDef {
	return THEME_MAP[id] ?? sandTheme;
}

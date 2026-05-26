import type { ThemeDef } from "../tokens";
import { defaultTheme } from "./default";
import { monoTheme } from "./mono";
import { neonTheme } from "./neon";
import { oceanTheme } from "./ocean";
import { scarletTheme } from "./scarlet";
import { voltageTheme } from "./voltage";

export const THEMES: ThemeDef[] = [defaultTheme, monoTheme, voltageTheme, scarletTheme, neonTheme, oceanTheme];

export const THEME_MAP: Record<string, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export const DEFAULT_THEME_ID = "default";

export function getTheme(id: string): ThemeDef {
	return THEME_MAP[id] ?? defaultTheme;
}

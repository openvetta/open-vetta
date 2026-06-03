import { nativeTheme } from "electron";
import { getMainWindow } from "../../window-manager.js";
import { type ActionDefinition, ActionError, type JsonValue } from "../types.js";

type ThemeMode = "light" | "dark" | "auto";

const THEME_MODES = new Set<ThemeMode>(["light", "dark", "auto"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateThemeModeInput(input: unknown): JsonValue {
	if (!isRecord(input)) {
		throw new ActionError("ACTION_INVALID_INPUT", "Input must be an object with a mode field.");
	}
	const mode = input.mode;
	if (typeof mode !== "string" || !THEME_MODES.has(mode as ThemeMode)) {
		throw new ActionError("ACTION_INVALID_INPUT", "mode must be one of: light, dark, auto.");
	}
	return { mode };
}

export function registerAppearanceActions(register: (action: ActionDefinition) => void): void {
	register({
		id: "appearance.setThemeMode",
		domain: "appearance",
		title: "设置应用外观模式",
		summary: "将已打开 GUI 的外观模式切换为浅色、深色或跟随系统。",
		availability: "gui-main",
		permission: "appearance.write",
		inputSchema: {
			description: '对象参数：{ "mode": "light" | "dark" | "auto" }。',
		},
		examples: [
			{
				description: "切换到深色模式",
				input: { mode: "dark" },
			},
			{
				description: "切换为跟随系统",
				input: { mode: "auto" },
			},
		],
		validateInput: validateThemeModeInput,
		run: (input) => {
			const { mode } = input as { mode: ThemeMode };
			nativeTheme.themeSource = mode === "auto" ? "system" : mode;
			const mainWindow = getMainWindow();
			mainWindow?.webContents.send("vetta:theme:mode-requested", { mode });
			return {
				mode,
				nativeSource: nativeTheme.themeSource,
				shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
				rendererNotified: mainWindow !== null,
			};
		},
	});
}

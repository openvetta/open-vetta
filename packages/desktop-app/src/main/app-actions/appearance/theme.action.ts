import { getMainWindow } from "../../window-manager.js";
import type { ActionDefinition, JsonValue } from "../types.js";
import { type ThemeActionInput, validateThemeActionInput } from "./theme.schema.js";
import {
	applyNativeThemeMode,
	getFallbackThemeState,
	getNativeThemeInfo,
	getThemeHelp,
	getThemeState,
	waitForRendererThemeResponse,
} from "./theme.utils.js";

export const themeAction: ActionDefinition = {
	id: "appearance.theme",
	domain: "appearance",
	title: "读取或设置应用主题",
	summary: "通过 type 字段查看帮助、读取当前主题，或切换浅色/深色/跟随系统模式与多主题风格。",
	availability: "gui-main",
	permission: "appearance.write",
	inputSchema: {
		description:
			'对象参数：{ "type": "help" }、{ "type": "get" } 或 { "type": "set", "mode"?: "light" | "dark" | "auto", "themeId"?: string }。',
	},
	examples: [
		{
			description: "查看可用主题 id 和操作说明",
			input: { type: "help" },
		},
		{
			description: "获取当前主题",
			input: { type: "get" },
		},
		{
			description: "切换到深色默认主题",
			input: { type: "set", mode: "dark", themeId: "default" },
		},
		{
			description: "只切换主题风格",
			input: { type: "set", themeId: "ocean" },
		},
	],
	validateInput: validateThemeActionInput,
	requiresApproval: (input, context) => {
		const request = input as unknown as ThemeActionInput;
		return context.source === "local-server" && request.type === "set";
	},
	run: async (input) => {
		const request = input as unknown as ThemeActionInput;
		if (request.type === "help") {
			return await getThemeHelp();
		}

		if (request.type === "get") {
			const mainWindow = getMainWindow();
			return mainWindow === null ? getFallbackThemeState() : await getThemeState();
		}

		if (request.mode !== undefined) {
			applyNativeThemeMode(request.mode);
		}

		const changeRequest: Record<string, JsonValue> = {};
		if (request.mode !== undefined) changeRequest.mode = request.mode;
		if (request.themeId !== undefined) changeRequest.themeId = request.themeId;
		const mainWindow = getMainWindow();
		if (mainWindow === null) {
			return {
				type: "set",
				requested: changeRequest,
				native: getNativeThemeInfo(),
				rendererAvailable: false,
				rendererSynced: false,
			};
		}
		const renderer = await waitForRendererThemeResponse(
			"vetta:theme:change-requested",
			"vetta:theme:change-response",
			changeRequest,
		);

		return {
			type: "set",
			requested: changeRequest,
			state: renderer,
			native: getNativeThemeInfo(),
			rendererAvailable: true,
			rendererSynced: true,
		};
	},
};

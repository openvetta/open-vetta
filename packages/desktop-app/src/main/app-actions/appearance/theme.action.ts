import { THEME_MAP } from "../../../renderer/shared/theme/themes/index.js";
import { getMainWindow } from "../../window-manager.js";
import { throwAgentEntityNotFound } from "../shared.js";
import { type ActionDefinition, ActionError, type JsonValue } from "../types.js";
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
	title: "读取或设置外观",
	summary: "对应设置 → 外观：读取/切换显示模式（浅色/深色/跟随系统）、主题风格，以及鼠标指针样式（默认/白鼬）。",
	availability: "gui-main",
	permission: "appearance.write",
	keywords: [
		"theme",
		"主题",
		"外观",
		"深色",
		"浅色",
		"暗色",
		"亮色",
		"dark",
		"light",
		"auto",
		"跟随系统",
		"模式",
		"皮肤",
		"配色",
		"themeId",
		"cursor",
		"pointer",
		"鼠标",
		"鼠标指针",
		"指针",
		"光标",
		"白鼬",
		"stoat",
		"鼠标样式",
		"cursorStyle",
	],
	approval: {
		defaultPresentation: "appearance.theme-change",
		presentations: [
			{
				id: "appearance.theme-change",
				title: "外观变更确认",
				description: "使用外观变更专用审批界面；该界面未挂载时自动回退到通用审批界面。",
			},
			{
				id: "appearance.picker",
				title: "外观选择器",
				description: "使用可交互的外观选择界面，并按用户最终选择执行变更。",
			},
			{
				id: "generic",
				title: "通用确认",
				description: "使用通用 Action 审批界面，直接展示 Action 信息和完整输入。",
			},
		],
	},
	inputSchema: {
		description:
			'对象参数：{ "type": "help" }、{ "type": "get" } 或 { "type": "set", "mode"?: "light" | "dark" | "auto", "themeId"?: string, "cursorStyle"?: "default" | "stoat", "approvalUi"?: "appearance.theme-change" | "appearance.picker" | "generic" }。对应设置 → 外观中的显示模式、主题风格与鼠标指针。set 至少提供 mode / themeId / cursorStyle 之一；approvalUi 为 appearance.picker 时可全部省略，由用户在审批界面选择。cursorStyle=default 为系统默认指针，stoat 为白鼬自定义指针。approvalUi 省略时使用默认的 appearance.theme-change。',
	},
	examples: [
		{
			description: "查看可用主题 id、指针样式与操作说明",
			input: { type: "help" },
		},
		{
			description: "获取当前外观（模式、主题、指针）",
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
		{
			description: "切换为白鼬鼠标指针",
			input: { type: "set", cursorStyle: "stoat" },
		},
		{
			description: "恢复系统默认鼠标指针",
			input: { type: "set", cursorStyle: "default" },
		},
		{
			description: "在外观选择器中确认或调整模式/主题/指针",
			input: { type: "set", approvalUi: "appearance.picker" },
		},
		{
			description: "切换主题并明确使用通用审批界面",
			input: { type: "set", themeId: "ocean", approvalUi: "generic" },
		},
	],
	validateInput: validateThemeActionInput,
	assertReady: (input) => {
		const request = input as unknown as ThemeActionInput;
		if (request.type !== "set" || request.themeId === undefined) return;
		// themeId 对应设置 → 外观中的颜色主题 id；未知 id 在审批前拒绝。
		if (!THEME_MAP[request.themeId]) {
			throwAgentEntityNotFound({
				operation: "set",
				entity: "color theme",
				idField: "themeId",
				id: request.themeId,
				queryAction: "appearance.theme",
				queryExample: { type: "help" },
				resultIdPath: "themes[].id",
				availableIds: Object.keys(THEME_MAP),
				extra: 'You may also call appearance.theme with {"type":"get"} for current state.',
			});
		}
	},
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

		if (request.mode === undefined && request.themeId === undefined && request.cursorStyle === undefined) {
			throw new ActionError(
				"ACTION_INVALID_INPUT",
				"Appearance set requires mode, themeId, or cursorStyle after approval.",
			);
		}

		if (request.mode !== undefined) {
			applyNativeThemeMode(request.mode);
		}

		const changeRequest: Record<string, JsonValue> = {};
		if (request.mode !== undefined) changeRequest.mode = request.mode;
		if (request.themeId !== undefined) changeRequest.themeId = request.themeId;
		if (request.cursorStyle !== undefined) changeRequest.cursorStyle = request.cursorStyle;
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

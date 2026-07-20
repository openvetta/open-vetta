import type { PluginAppActionExample, PluginContext, PluginJsonSchema } from "@vetta-org/plugin-sdk";
import { throwEntityNotFound } from "../action-errors";

type ThemeInput =
	| { type: "help" }
	| { type: "get" }
	| {
			type: "set";
			mode?: "light" | "dark" | "auto";
			themeId?: string;
			cursorStyle?: "default" | "stoat";
			approvalUi?: string;
	  }
	| { type: "set-language"; language: "zh" | "en"; approvalUi?: string };

const inputSchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{ properties: { type: { const: "help" } }, required: ["type"], additionalProperties: false },
		{ properties: { type: { const: "get" } }, required: ["type"], additionalProperties: false },
		{
			properties: {
				type: { const: "set" },
				mode: { enum: ["light", "dark", "auto"] },
				themeId: { type: "string", minLength: 1 },
				cursorStyle: { enum: ["default", "stoat"] },
				approvalUi: {
					enum: ["appearance.theme-change", "appearance.picker", "appearance.set-language", "generic"],
				},
			},
			required: ["type"],
			additionalProperties: false,
		},
		{
			properties: {
				type: { const: "set-language" },
				language: { enum: ["zh", "en"] },
				approvalUi: { enum: ["appearance.set-language", "generic"] },
			},
			required: ["type", "language"],
			additionalProperties: false,
		},
	],
};

const examples: PluginAppActionExample<ThemeInput>[] = [
	{ description: "查看可用主题", input: { type: "help" } },
	{ description: "获取当前外观", input: { type: "get" } },
	{ description: "切换深色默认主题", input: { type: "set", mode: "dark", themeId: "default" } },
	{ description: "切换界面语言为英文", input: { type: "set-language", language: "en" } },
];

export function registerAppearanceActions(ctx: PluginContext): void {
	ctx.appActions.register<ThemeInput>({
		id: "appearance.theme",
		publicId: "appearance.theme",
		title: "读取或设置外观",
		summary: "对应设置 → 外观：读取/切换显示模式、主题风格、鼠标指针，以及界面语言（zh/en）。",
		description:
			'对象参数：{ "type": "help" }、{ "type": "get" }、{ "type": "set", "mode"?: ..., "themeId"?: ..., "cursorStyle"?: ... } 或 { "type": "set-language", "language": "zh" | "en" }。',
		keywords: [
			"theme",
			"主题",
			"外观",
			"深色",
			"浅色",
			"dark",
			"light",
			"auto",
			"语言",
			"language",
			"cursor",
			"鼠标",
		],
		effect: "write",
		approval: {
			defaultPresentation: "appearance.theme-change",
			presentations: [
				{
					id: "appearance.theme-change",
					title: "外观变更确认",
					description: "使用外观变更专用审批界面。",
				},
				{
					id: "appearance.picker",
					title: "外观选择器",
					description: "使用可交互的外观选择界面。",
				},
				{
					id: "appearance.set-language",
					title: "修改界面语言确认",
					description: "确认界面语言切换。",
				},
			],
			presentationByOperation: {
				set: "appearance.theme-change",
				"set-language": "appearance.set-language",
			},
		},
		inputSchema,
		examples,
		assertReady: async ({ input }) => {
			if (input.type !== "set" || input.themeId === undefined) return;
			const ids = ctx.official.appearance.listThemeIds();
			if (ids.includes(input.themeId)) return;
			throwEntityNotFound({
				operation: "set",
				entity: "color theme",
				idField: "themeId",
				id: input.themeId,
				queryAction: "appearance.theme",
				queryExample: { type: "help" },
				resultIdPath: "themes[].id",
				availableIds: ids,
				extra: 'You may also call appearance.theme with {"type":"get"} for current state.',
			});
		},
		handler: async ({ input }) => {
			if (input.type === "help") return ctx.official.appearance.help();
			if (input.type === "get") return ctx.official.appearance.get();
			if (input.type === "set-language") return ctx.official.appearance.setLanguage(input.language);
			return ctx.official.appearance.set({
				mode: input.mode,
				themeId: input.themeId,
				cursorStyle: input.cursorStyle,
			});
		},
	});
}

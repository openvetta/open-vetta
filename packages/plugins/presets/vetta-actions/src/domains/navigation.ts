import type { PluginAppActionExample, PluginContext, PluginJsonSchema } from "@vetta-org/plugin-sdk";
import { throwInvalidInput } from "../action-errors";

type NavigationInput =
	| { type: "help" }
	| { type: "open"; target: string; tab?: string; section?: string; approvalUi?: string };

const inputSchema: PluginJsonSchema = {
	type: "object",
	oneOf: [
		{ properties: { type: { const: "help" } }, required: ["type"], additionalProperties: false },
		{
			properties: {
				type: { const: "open" },
				target: { type: "string", minLength: 1 },
				tab: { type: "string", minLength: 1 },
				section: { type: "string", minLength: 1 },
				approvalUi: { enum: ["navigation.open", "generic"] },
			},
			required: ["type", "target"],
			additionalProperties: false,
		},
	],
};

const examples: PluginAppActionExample<NavigationInput>[] = [
	{ description: "查看可导航页面目录", input: { type: "help" } },
	{ description: "打开能力页", input: { type: "open", target: "skills" } },
	{ description: "打开模型配置", input: { type: "open", target: "models" } },
	{ description: "打开连接器", input: { type: "open", target: "connectors" } },
];

export function registerNavigationActions(ctx: PluginContext): void {
	ctx.appActions.register<NavigationInput>({
		id: "navigation.open",
		publicId: "navigation.open",
		title: "打开应用页面",
		summary: "根据稳定页面 id 打开应用内页面；支持跳转到设置页分类和具体设置项。",
		description:
			'对象参数：{ "type": "help" } 或 { "type": "open", "target": string, "tab"?: string, "section"?: string }。',
		keywords: [
			"open",
			"打开",
			"跳转",
			"导航",
			"页面",
			"settings",
			"设置",
			"技能广场",
			"下载中心",
			"自动化",
			"批量任务",
		],
		effect: "write",
		approval: {
			defaultPresentation: "navigation.open",
			presentations: [
				{
					id: "navigation.open",
					title: "页面跳转确认",
					description: "使用页面跳转专用审批界面。",
				},
			],
			presentationByOperation: {
				open: "navigation.open",
			},
		},
		inputSchema,
		examples,
		assertReady: async ({ input }) => {
			if (input.type !== "open") return;
			try {
				ctx.official.navigation.resolveOpen({
					target: input.target,
					tab: input.tab,
					section: input.section,
				});
			} catch (error) {
				throwInvalidInput(error instanceof Error ? error.message : String(error), {
					operation: "open",
					target: input.target,
					tab: input.tab,
					section: input.section,
				});
			}
		},
		handler: async ({ input }) => {
			if (input.type === "help") return ctx.official.navigation.help();
			return ctx.official.navigation.open({
				target: input.target,
				tab: input.tab,
				section: input.section,
			});
		},
	});
}

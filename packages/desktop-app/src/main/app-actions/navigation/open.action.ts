import type { ActionDefinition } from "../types.js";
import { type NavigationActionInput, validateNavigationActionInput } from "./open.schema.js";
import { getNavigationHelp, openHashPath, resolveNavigationTarget } from "./open.utils.js";

export const openAction: ActionDefinition = {
	id: "navigation.open",
	domain: "navigation",
	title: "打开应用页面",
	summary: "根据稳定页面 id 打开应用内页面；支持跳转到设置页分类和具体设置项。",
	availability: "gui-main",
	permission: "navigation.write",
	keywords: [
		"open",
		"打开",
		"跳转",
		"导航",
		"页面",
		"goto",
		"settings",
		"设置",
		"配置",
		"技能广场",
		"下载中心",
		"自动化",
		"批量任务",
		"对话",
		"模型配置",
		"MCP",
		"桌宠",
		"知识库",
		"插件",
		"快捷键",
	],
	approval: {
		defaultPresentation: "navigation.open",
		presentations: [
			{
				id: "navigation.open",
				title: "页面跳转确认",
				description: "使用页面跳转专用审批界面；该界面未挂载时自动回退到通用审批界面。",
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
			'对象参数：{ "type": "help" } 或 { "type": "open", "target": string, "tab"?: string, "section"?: string, "approvalUi"?: "navigation.open" | "generic" }。target 可为普通页面 id、设置分类 id 或设置子项 id；approvalUi 由调用方按本次交互选择审批界面，省略时使用默认的 navigation.open。',
	},
	examples: [
		{
			description: "查看可导航页面和设置项目录",
			input: { type: "help" },
		},
		{
			description: "打开技能广场",
			input: { type: "open", target: "skills" },
		},
		{
			description: "打开模型配置页",
			input: { type: "open", target: "models" },
		},
		{
			description: "打开模型服务商设置项",
			input: { type: "open", target: "models-providers" },
		},
		{
			description: "打开 Agent 个性化设置项",
			input: { type: "open", target: "agent-personalization" },
		},
		{
			description: "打开技能广场并明确使用通用审批界面",
			input: { type: "open", target: "skills", approvalUi: "generic" },
		},
	],
	validateInput: validateNavigationActionInput,
	assertReady: (input) => {
		const request = input as unknown as NavigationActionInput;
		// 在审批前解析 target/tab/section，未知页面直接失败。
		if (request.type === "open") {
			resolveNavigationTarget(request);
		}
	},
	requiresApproval: (input, context) => {
		const request = input as unknown as NavigationActionInput;
		return context.source === "local-server" && request.type === "open";
	},
	run: async (input) => {
		const request = input as unknown as NavigationActionInput;
		if (request.type === "help") {
			return getNavigationHelp();
		}

		const target = resolveNavigationTarget(request);
		await openHashPath(target.hashPath);
		return {
			type: "open",
			resolved: target.resolved,
		};
	},
};

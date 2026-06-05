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
	inputSchema: {
		description:
			'对象参数：{ "type": "help" } 或 { "type": "open", "target": string, "tab"?: string, "section"?: string }。target 可为普通页面 id、设置分类 id 或设置子项 id。',
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
	],
	validateInput: validateNavigationActionInput,
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

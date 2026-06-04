import { once } from "node:events";
import { z } from "zod";
import {
	SETTINGS_SECTIONS,
	SETTINGS_TABS,
	type SettingsSectionRegistration,
	type SettingsTabRegistration,
} from "../../../renderer/domains/settings/registry.js";
import { getMainWindow, showMainWindow } from "../../window-manager.js";
import { type ActionDefinition, ActionError, type JsonValue } from "../types.js";

const navigationActionInputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("help"),
	}),
	z.object({
		type: z.literal("open"),
		target: z.string().trim().min(1),
		tab: z.string().trim().min(1).optional(),
		section: z.string().trim().min(1).optional(),
	}),
]);

type NavigationActionInput = z.infer<typeof navigationActionInputSchema>;

interface StaticNavigationTarget {
	id: string;
	title: string;
	description: string;
	hashPath: string;
	aliases: readonly string[];
}

const STATIC_TARGETS: readonly StaticNavigationTarget[] = [
	{
		id: "chat",
		title: "对话",
		description: "主对话页，用于和 agent 交流。",
		hashPath: "/",
		aliases: ["主页", "首页", "聊天", "会话", "agent 对话"],
	},
	{
		id: "automation",
		title: "自动化",
		description: "定时自动化任务页面。",
		hashPath: "/automation",
		aliases: ["定时任务", "计划任务", "scheduler", "cron"],
	},
	{
		id: "batch-tasks",
		title: "批量任务",
		description: "批量执行多个目标目录任务的页面。",
		hashPath: "/batch-tasks",
		aliases: ["批处理", "批量执行", "batch"],
	},
	{
		id: "skills",
		title: "技能广场",
		description: "浏览和安装技能的页面。",
		hashPath: "/skills",
		aliases: ["技能", "插件", "skill marketplace"],
	},
	{
		id: "downloads",
		title: "下载中心",
		description: "查看下载任务的页面。",
		hashPath: "/downloads",
		aliases: ["下载", "download"],
	},
	{
		id: "settings",
		title: "设置",
		description: "设置首页，默认打开通用设置。",
		hashPath: "/settings/general",
		aliases: ["配置", "偏好设置", "preferences"],
	},
];

function validateNavigationActionInput(input: unknown): JsonValue {
	const result = navigationActionInputSchema.safeParse(input);
	if (!result.success) {
		throw new ActionError("ACTION_INVALID_INPUT", "Input must match the navigation action schema.", {
			issues: result.error.issues.map((issue) => ({
				path: issue.path.map(String).join("."),
				message: issue.message,
			})),
		});
	}
	return result.data as JsonValue;
}

function normalizeTarget(value: string): string {
	return value.trim().toLowerCase();
}

function getSettingsTabsByKey(): Map<string, SettingsTabRegistration> {
	return new Map(SETTINGS_TABS.map((tab) => [tab.key, tab]));
}

function getSettingsSectionsById(): Map<string, SettingsSectionRegistration> {
	return new Map(SETTINGS_SECTIONS.map((section) => [section.id, section]));
}

function buildSettingsHashPath(tab: string, section?: string): string {
	const search = new URLSearchParams();
	if (section) {
		search.set("section", section);
		search.set("nav", String(Date.now()));
	}
	const query = search.toString();
	return `/settings/${encodeURIComponent(tab)}${query ? `?${query}` : ""}`;
}

function buildSettingsCatalog(): JsonValue {
	return SETTINGS_TABS.map((tab) => ({
		id: tab.key,
		title: tab.label,
		target: { type: "open", target: "settings", tab: tab.key },
		visibility: {
			...(tab.personalOnly ? { personalOnly: true } : {}),
			...(tab.requireAuth ? { requireAuth: true } : {}),
			...(tab.macOnly ? { macOnly: true } : {}),
		},
		sections: SETTINGS_SECTIONS.filter((section) => section.tab === tab.key).map((section) => ({
			id: section.id,
			title: section.title,
			target: { type: "open", target: section.id },
		})),
	})) as JsonValue;
}

function getNavigationHelp(): JsonValue {
	return {
		type: "help",
		description:
			"navigation.open 用于打开应用页面。先根据用户意图从 catalog 选择最匹配的 target/tab/section，再调用 open；不要直接拼接或暴露 window.location.hash。",
		operations: [
			{
				type: "help",
				description: "返回可导航页面、设置页分类和设置子项目录。",
				input: { type: "help" },
			},
			{
				type: "open",
				description:
					"打开页面。普通页面传 target；设置页可传 target=settings + tab/section，也可直接把设置分类 id 或设置子项 id 作为 target。",
				input: { type: "open", target: "models-providers" },
			},
		],
		catalog: {
			pages: STATIC_TARGETS.map((target) => ({
				id: target.id,
				title: target.title,
				description: target.description,
				aliases: [...target.aliases],
				target: { type: "open", target: target.id },
			})),
			settings: {
				pageId: "settings",
				layout: "左侧是设置分类列表，右侧是当前分类的细分设置项。",
				usage: "用户提到具体设置时，优先匹配 settings.sections[].id；只提到大类时匹配 settings[].id。",
				tabs: buildSettingsCatalog(),
			},
		},
	};
}

function resolveNavigationTarget(input: Extract<NavigationActionInput, { type: "open" }>): {
	hashPath: string;
	resolved: JsonValue;
} {
	const target = normalizeTarget(input.target);
	const staticTarget = STATIC_TARGETS.find((candidate) => candidate.id === target);
	if (staticTarget && staticTarget.id !== "settings") {
		return {
			hashPath: staticTarget.hashPath,
			resolved: {
				kind: "page",
				id: staticTarget.id,
				title: staticTarget.title,
			},
		};
	}

	const tabsByKey = getSettingsTabsByKey();
	const sectionsById = getSettingsSectionsById();
	const sectionId = input.section ? normalizeTarget(input.section) : undefined;
	const explicitSection = sectionId ? sectionsById.get(sectionId) : undefined;
	const targetSection = sectionsById.get(target);
	const targetTab = tabsByKey.get(target);

	if (input.section && !explicitSection) {
		throw new ActionError("ACTION_INVALID_INPUT", `Unknown settings section: ${input.section}`);
	}

	if (targetSection) {
		const tab = tabsByKey.get(targetSection.tab);
		return {
			hashPath: buildSettingsHashPath(targetSection.tab, targetSection.id),
			resolved: {
				kind: "settings-section",
				tab: targetSection.tab,
				tabTitle: tab?.label ?? targetSection.tab,
				section: targetSection.id,
				sectionTitle: targetSection.title,
			},
		};
	}

	if (target === "settings" || targetTab) {
		const tabKey = input.tab ? normalizeTarget(input.tab) : (targetTab?.key ?? explicitSection?.tab ?? "general");
		const tab = tabsByKey.get(tabKey);
		if (!tab) {
			throw new ActionError("ACTION_INVALID_INPUT", `Unknown settings tab: ${input.tab ?? tabKey}`);
		}
		if (explicitSection && explicitSection.tab !== tab.key) {
			throw new ActionError(
				"ACTION_INVALID_INPUT",
				`Settings section ${explicitSection.id} belongs to tab ${explicitSection.tab}, not ${tab.key}.`,
			);
		}
		return {
			hashPath: buildSettingsHashPath(tab.key, explicitSection?.id),
			resolved: {
				kind: explicitSection ? "settings-section" : "settings-tab",
				tab: tab.key,
				tabTitle: tab.label,
				...(explicitSection ? { section: explicitSection.id, sectionTitle: explicitSection.title } : {}),
			},
		};
	}

	throw new ActionError("ACTION_INVALID_INPUT", `Unknown navigation target: ${input.target}`);
}

async function waitForWindowLoad(): Promise<void> {
	const mainWindow = getMainWindow();
	if (!mainWindow) return;
	if (!mainWindow.webContents.isLoading()) return;
	await once(mainWindow.webContents, "did-finish-load");
}

async function openHashPath(hashPath: string): Promise<void> {
	const mainWindow = showMainWindow();
	await waitForWindowLoad();
	await mainWindow.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(`#${hashPath}`)};`, true);
}

export function registerNavigationActions(register: (action: ActionDefinition) => void): void {
	register({
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
	});
}

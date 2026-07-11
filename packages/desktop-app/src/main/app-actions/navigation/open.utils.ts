import { once } from "node:events";
import {
	SETTINGS_SECTIONS,
	SETTINGS_TABS,
	type SettingsSectionRegistration,
	type SettingsTabRegistration,
} from "../../../renderer/domains/settings/registry.js";
import { getAppLogger } from "../../logger.js";
import { getMainWindow, showMainWindow } from "../../window-manager.js";
import { ActionError, type JsonValue } from "../types.js";
import type { NavigationActionInput } from "./open.schema.js";

const log = getAppLogger("action-nav");

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

export function getNavigationHelp(): JsonValue {
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

export function resolveNavigationTarget(input: Extract<NavigationActionInput, { type: "open" }>): {
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
		const sectionIds = [...getSettingsSectionsById().keys()];
		throw new ActionError(
			"ACTION_INVALID_INPUT",
			`Refused navigation.open before user approval: unknown settings section=${JSON.stringify(input.section)}. Call navigation.open help (type=help) and copy an exact section id from catalog.settings.tabs[].sections[].id. Available section ids (sample): ${sectionIds
				.slice(0, 20)
				.map((id) => JSON.stringify(id))
				.join(", ")}${sectionIds.length > 20 ? ", ..." : "."}`,
			{
				reason: "entity_not_found",
				approvalShown: false,
				operation: "open",
				idField: "section",
				id: input.section,
				queryAction: "navigation.open",
				queryExample: { type: "help" },
				resultIdPath: "catalog.settings.tabs[].sections[].id",
				availableIds: sectionIds.slice(0, 20),
				availableCount: sectionIds.length,
			},
		);
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
			const tabIds = [...tabsByKey.keys()];
			throw new ActionError(
				"ACTION_INVALID_INPUT",
				`Refused navigation.open before user approval: unknown settings tab=${JSON.stringify(input.tab ?? tabKey)}. Call navigation.open with {"type":"help"} and use catalog.settings.tabs[].id. Available tabs: ${tabIds
					.map((id) => JSON.stringify(id))
					.join(", ")}.`,
				{
					reason: "entity_not_found",
					approvalShown: false,
					operation: "open",
					idField: "tab",
					id: input.tab ?? tabKey,
					queryAction: "navigation.open",
					queryExample: { type: "help" },
					resultIdPath: "catalog.settings.tabs[].id",
					availableIds: tabIds,
				},
			);
		}
		if (explicitSection && explicitSection.tab !== tab.key) {
			throw new ActionError(
				"ACTION_INVALID_INPUT",
				`Refused navigation.open before user approval: section ${JSON.stringify(explicitSection.id)} belongs to tab ${JSON.stringify(explicitSection.tab)}, not ${JSON.stringify(tab.key)}. Either open with target=${JSON.stringify(explicitSection.id)} alone, or use tab=${JSON.stringify(explicitSection.tab)} with section=${JSON.stringify(explicitSection.id)}.`,
				{
					reason: "invalid_input",
					approvalShown: false,
					section: explicitSection.id,
					sectionTab: explicitSection.tab,
					requestedTab: tab.key,
				},
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

	const pageIds = STATIC_TARGETS.map((item) => item.id);
	const tabIds = [...tabsByKey.keys()];
	throw new ActionError(
		"ACTION_INVALID_INPUT",
		`Refused navigation.open before user approval: unknown target=${JSON.stringify(input.target)}. Do not invent page ids. Call navigation.open with {"type":"help"} and pick from catalog.pages[].id, settings tab ids, or section ids. Page targets: ${pageIds
			.map((id) => JSON.stringify(id))
			.join(", ")}. Settings tabs: ${tabIds.map((id) => JSON.stringify(id)).join(", ")}.`,
		{
			reason: "entity_not_found",
			approvalShown: false,
			operation: "open",
			idField: "target",
			id: input.target,
			queryAction: "navigation.open",
			queryExample: { type: "help" },
			resultIdPath: "catalog.pages[].id | catalog.settings.tabs[].id | sections[].id",
			availableIds: [...pageIds, ...tabIds],
		},
	);
}

export async function openHashPath(hashPath: string): Promise<void> {
	const mainWindow = showMainWindow();
	await waitForWindowLoad();
	await mainWindow.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(`#${hashPath}`)};`, true);
}

async function waitForWindowLoad(): Promise<void> {
	const mainWindow = getMainWindow();
	if (!mainWindow) return;
	if (!mainWindow.webContents.isLoading()) return;

	const timeoutId = setTimeout(() => {
		log.warn("waitForWindowLoad: timeout waiting for did-finish-load after 10s");
	}, 10000);

	await once(mainWindow.webContents, "did-finish-load");
	clearTimeout(timeoutId);
}

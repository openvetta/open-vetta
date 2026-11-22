import type { InstalledPlugin, SkillInfo } from "@preload/api";
import { pathBasename } from "@shared/lib/utils";
import type { Project, RegisteredWorkspaceView } from "@shared/store/atoms";
import { sessionDisplayLabel } from "@shared/store/atoms";
import { getSkillDisplayDescription, getSkillDisplayName, isSkillVisibleOnSurface } from "@vetta-org/capability-sdk";
import { resolveDesktopSessionOpenTarget } from "@/shared/session-access";
import type { DesktopSessionSearchResult } from "@/shared/session-search";
import {
	filterVisibleSettingsTabs,
	type RegisteredSettingsSection,
	SETTINGS_SECTIONS,
	SETTINGS_TABS,
	type SettingsTabLabelKey,
	type SettingsTabVisibilityContext,
} from "../../settings/registry";
import type { CommandMenuEntry } from "../types";

/**
 * 五个数据源到 Command Menu 条目的适配层，全部是纯函数：入参是已经取好的数据，
 * 出参是条目数组，文案由调用方注入。取数与导航副作用都不在这里。
 */

/**
 * 设置目录用到的 i18n key 联合。保持字面量而非 string：i18next 的键是有类型的，
 * 放宽成 string 会让 `t()` 失去校验，改错一个 key 只能在运行时看到原样回显。
 */
export type CommandMenuSettingsLabelKey = SettingsTabLabelKey | NonNullable<RegisteredSettingsSection["titleKey"]>;

/** 会被重定向到能力页的设置 section（ADR-0049），从目录里剔除，避免"点了跳到别处"。 */
const REDIRECTED_SETTINGS_TAB = "mcp";

export interface CommandMenuSourceLabels {
	readonly sessionTypes: Readonly<Record<DesktopSessionSearchResult["sourceKind"], string>>;
	readonly sessionStatus: Readonly<Record<CommandMenuSessionStatus, string>>;
	readonly sessionUnavailable: string;
	readonly settingsGroupHint: string;
	readonly abilitySkill: string;
	readonly abilityPlugin: string;
	readonly searchMarketplace: string;
}

export type CommandMenuSessionStatus = "running" | "waiting" | "unread";

/**
 * 等用户回答比在跑更需要人：排在前面，两者同时成立时也按「等回答」显示。
 * 跑完还没看的排在最后：它不急，但不能一停止就从面板里消失，逼用户再去搜。
 */
const SESSION_STATUS_PRIORITY: Readonly<Record<CommandMenuSessionStatus, number>> = {
	waiting: 0,
	running: 1,
	unread: 2,
};

export interface CommandMenuSessionActivity {
	readonly runningPaths: ReadonlySet<string>;
	/** sessionPath → 剩余待处理请求数。 */
	readonly waitingPaths: ReadonlyMap<string, number>;
	/** 需要用户回来看的会话（主进程与 Dock 角标同一份）；不在跑也不在等的即「跑完未看」。 */
	readonly attentionPaths: ReadonlySet<string>;
}

export function resolveSessionStatus(
	path: string,
	activity: CommandMenuSessionActivity,
): CommandMenuSessionStatus | undefined {
	if ((activity.waitingPaths.get(path) ?? 0) > 0) return "waiting";
	if (activity.runningPaths.has(path)) return "running";
	if (activity.attentionPaths.has(path)) return "unread";
	return undefined;
}

/** 不展示绝对路径：项目行只有名字，所在工作空间由调用方作为 badge 补上。 */
export function buildProjectEntries(projects: readonly Project[]): CommandMenuEntry[] {
	return projects.map((project, index) => ({
		id: `project:${project.cwd}`,
		groupKey: "projects",
		title: project.name?.trim() || pathBasename(project.cwd),
		icon: project.isDefault ? "icon-[solar--chat-round-line-linear]" : "icon-[solar--folder-linear]",
		// 侧栏已经按最近使用排好序，沿用它的次序即可，不另造一套。
		order: index,
		action: { kind: "openProject", cwd: project.cwd },
	}));
}

/** 没打开过的会话在组内排在所有打开过的会话之后。 */
const NEVER_OPENED_PRIORITY = Number.MAX_SAFE_INTEGER;

export interface BuildSessionEntriesOptions {
	readonly activity: CommandMenuSessionActivity;
	/** 会话路径 → 最近打开的名次（0 = 最近一次打开）。 */
	readonly recentRank: ReadonlyMap<string, number>;
	/**
	 * 空查询时为 true：不在进行中的会话都来自「最近打开」，归入那个组并按打开先后排列。
	 * 有查询词时为 false：它们留在「会话」组，打开过的按名次排在没打开过的前面（Raycast 式）。
	 */
	readonly asRecentGroup: boolean;
}

/**
 * 会话行的 badge 标明归属：项目 / 批量会话写项目名，「对话」与 Claw 没有项目，写类型名。
 * 带进行中状态的会话归入置顶的「进行中」组。
 */
export function buildSessionEntries(
	results: readonly DesktopSessionSearchResult[],
	labels: CommandMenuSourceLabels,
	{ activity, recentRank, asRecentGroup }: BuildSessionEntriesOptions,
): CommandMenuEntry[] {
	return results.map((result, index) => {
		const unavailable = resolveDesktopSessionOpenTarget(result.session.access) === "unavailable";
		const status = resolveSessionStatus(result.session.path, activity);
		const hasProject = result.sourceKind === "project" || result.sourceKind === "batch";
		const rank = recentRank.get(result.session.path);
		return {
			id: `session:${result.session.path}`,
			groupKey: status ? "activeSessions" : asRecentGroup ? "recentSessions" : "sessions",
			title: sessionDisplayLabel(result.session),
			icon: "icon-[solar--chat-line-linear]",
			badge: hasProject
				? result.sourceName?.trim() || pathBasename(result.sourceCwd)
				: labels.sessionTypes[result.sourceKind],
			status,
			statusLabel: status ? labels.sessionStatus[status] : undefined,
			priority: status ? SESSION_STATUS_PRIORITY[status] : (rank ?? NEVER_OPENED_PRIORITY),
			disabled: unavailable,
			disabledReason: unavailable ? labels.sessionUnavailable : undefined,
			// 后端已按活跃时间倒序推送，保持原序即"越近越靠前"。
			order: index,
			action: { kind: "openSession", result },
		};
	});
}

/**
 * 设置项取 section 粒度（~40 条）：`/settings/$tab?section=<id>` 是既有深链，
 * 落地后会自动切标签、滚动到位并播一次呼吸高亮，不需要新造导航能力。
 */
export function buildSettingsEntries(
	visibility: SettingsTabVisibilityContext,
	translate: (key: CommandMenuSettingsLabelKey) => string,
): CommandMenuEntry[] {
	const visibleTabs = filterVisibleSettingsTabs(SETTINGS_TABS, visibility);
	const tabByKey = new Map(visibleTabs.map((tab) => [tab.key, tab]));

	const entries: CommandMenuEntry[] = [];
	for (const [index, section] of SETTINGS_SECTIONS.entries()) {
		if (section.tab === REDIRECTED_SETTINGS_TAB) continue;
		// 平台 / 账号维度不可见的标签，其 section 也不该被搜到：点进去只会落到兜底标签。
		const tab = tabByKey.get(section.tab);
		if (!tab) continue;
		const titleKey: CommandMenuSettingsLabelKey | undefined = section.titleKey;
		entries.push({
			id: `settings:${section.id}`,
			groupKey: "settings",
			// 先取到局部再判空：直接对 `section.titleKey` 分支会让 TS 把回退分支里的
			// section 收窄成 never（当前每条都带 titleKey，但契约上它是可选的）。
			title: titleKey ? translate(titleKey) : section.title,
			subtitle: translate(tab.labelKey),
			icon: tab.icon,
			order: index,
			action: { kind: "openSettingsSection", tab: section.tab, section: section.id },
		});
	}
	return entries;
}

export function buildWorkspaceViewEntries(
	views: readonly RegisteredWorkspaceView[],
	/**
	 * label 与 pluginName **都**可能是 `%catalogKey%`，且解析要用归属插件的目录，
	 * 故整条 view 传进来由宿主解析。pluginName 尤其容易被漏：它在侧栏只出现在
	 * tooltip 里，占位符没被解析也看不出来。
	 */
	resolveText: (view: RegisteredWorkspaceView, raw: string) => string,
): CommandMenuEntry[] {
	return views.map((view, index) => ({
		id: `workspace:${view.pluginId}/${view.viewId}`,
		groupKey: "workspaceViews",
		title: resolveText(view, view.label),
		subtitle: resolveText(view, view.pluginName),
		icon: view.icon || "icon-[solar--widget-linear]",
		order: index,
		action: { kind: "openWorkspaceView", pluginId: view.pluginId, viewId: view.viewId },
	}));
}

/**
 * 只收本地已装能力，不碰市场目录——`listOpenMarketplaces()` 对 autoUpdate 源仍会
 * 走网络，挂在命令面板上代价不可接受。市场由恒定置底的逃生行承接。
 *
 * 条目动作统一是「跳能力页并预填名称」而不是直接开详情抽屉：详情需要 catalog id，
 * 而它的合成规则（台账 catalogId 回退、市场 id、本地 id）散在 build-ability-items
 * 里，在这里重造一遍必然与之漂移。
 */
export function buildInstalledAbilityEntries(
	installed: { readonly skills: readonly SkillInfo[]; readonly plugins: readonly InstalledPlugin[] },
	labels: CommandMenuSourceLabels,
): CommandMenuEntry[] {
	const entries: CommandMenuEntry[] = [];
	let order = 0;
	for (const skill of installed.skills) {
		if (!isSkillVisibleOnSurface(skill, "commandPalette")) continue;
		const title = getSkillDisplayName(skill);
		entries.push({
			id: `ability:skill:${skill.name}`,
			groupKey: "abilities",
			title,
			subtitle: getSkillDisplayDescription(skill) || undefined,
			icon: "icon-[solar--magic-stick-3-linear]",
			badge: labels.abilitySkill,
			badgeTone: "accent",
			order: order++,
			action: { kind: "openAbilities", query: title, scope: "mine" },
		});
	}
	for (const plugin of installed.plugins) {
		entries.push({
			id: `ability:plugin:${plugin.id}`,
			groupKey: "abilities",
			title: plugin.name,
			subtitle: plugin.id,
			icon: "icon-[solar--plug-circle-linear]",
			badge: labels.abilityPlugin,
			badgeTone: "accent",
			order: order++,
			action: { kind: "openAbilities", query: plugin.name, scope: "mine" },
		});
	}
	return entries;
}

/**
 * 能力市场逃生行：恒定置底、不参与匹配打分。面板内只能搜到已装能力，这一行把
 * "搜市场"降级成一次回车跳转，而不是把远端目录的异步态与失败态搬进命令面板。
 */
export function buildMarketplaceEscapeEntry(query: string, labels: CommandMenuSourceLabels): CommandMenuEntry {
	return {
		id: "ability:marketplace-search",
		groupKey: "abilities",
		title: labels.searchMarketplace,
		icon: "icon-[solar--shop-2-linear]",
		order: Number.MAX_SAFE_INTEGER,
		pinnedToBottom: true,
		// 这一行的语义就是去市场找没装的东西，故落到「发现」。
		action: { kind: "openAbilities", query: query.trim() || undefined, scope: "discover" },
	};
}

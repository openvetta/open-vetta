import type { ActivityTabKey } from "@shared/lib/project-profile";
import { atom } from "jotai";

export const activityPanelOpenAtom = atom<boolean>(false);

/** 活动面板默认宽度，也是关闭内嵌预览时回拉的兜底值。 */
export const ACTIVITY_PANEL_DEFAULT_WIDTH = 360;
export const activityPanelWidthAtom = atom<number>(ACTIVITY_PANEL_DEFAULT_WIDTH);

/** 活动面板可拖拽的最小宽度。 */
export const ACTIVITY_PANEL_MIN_WIDTH = 260;
/** 拉到最大时给主聊天区保留的最小宽度；面板上限 = 窗口宽度 - 此值。 */
export const ACTIVITY_PANEL_MIN_CHAT_AREA = 360;

/**
 * 文件 tab 内嵌预览的「显示阈值」：面板宽度 ≥ 此值才展示右侧预览框，否则只剩目录树。
 * 拖窄到阈值以下自动收起预览，拖宽回来自动恢复；无选中文件时跨过阈值默认选第一个文件。
 */
export const ACTIVITY_PANEL_PREVIEW_MIN_WIDTH = 520;

/** 当前窗口宽度下，活动面板的最大宽度。 */
export function activityPanelMaxWidth(windowWidth: number): number {
	return Math.max(ACTIVITY_PANEL_MIN_WIDTH, windowWidth - ACTIVITY_PANEL_MIN_CHAT_AREA);
}

/**
 * 写入活动面板宽度并夹到 [MIN, max] 内。传 "max" 表示拉到当前窗口下的最大宽度。
 * 供插件 API（openActivityTab 的 width 选项）与 ResizeHandle 复用同一套约束。
 */
export const setActivityPanelWidthAtom = atom(null, (_get, set, width: number | "max") => {
	const max = activityPanelMaxWidth(window.innerWidth);
	const target = width === "max" ? max : width;
	set(activityPanelWidthAtom, Math.min(max, Math.max(ACTIVITY_PANEL_MIN_WIDTH, target)));
});

/**
 * 活动面板 active tab 按项目（cwd）记忆。
 * 切换项目后会回到该项目上次选中的 tab；新项目按 profile.defaultActivityTab 决定。
 */
export const activityPanelTabByProjectAtom = atom<Map<string, ActivityTabKey>>(new Map<string, ActivityTabKey>());

export const ATTACHED_PLUGIN_TABS_STORAGE_KEY = "vetta-activity-plugin-tabs";

function readAttachedPluginTabs(): Map<string, string[]> {
	try {
		const raw = localStorage.getItem(ATTACHED_PLUGIN_TABS_STORAGE_KEY);
		if (!raw) return new Map();
		const parsed: unknown = JSON.parse(raw);
		if (parsed == null || typeof parsed !== "object") return new Map();
		const map = new Map<string, string[]>();
		for (const [cwd, keys] of Object.entries(parsed)) {
			if (Array.isArray(keys)) {
				map.set(
					cwd,
					keys.filter((key): key is string => typeof key === "string"),
				);
			}
		}
		return map;
	} catch {
		return new Map();
	}
}

const attachedPluginTabsBaseAtom = atom<Map<string, string[]>>(readAttachedPluginTabs());

/**
 * 活动面板插件 tab 的 attach 记录：会话 cwd → ["pluginId:tabId"]（见 ADR-0026）。
 * 普通项目所有 session 共享项目 cwd → 项目级同步；「对话」项目 per-session 子目录
 * cwd → 天然按 session 隔离。写入时同步持久化到 localStorage。
 */
export const attachedPluginTabsAtom = atom(
	(get) => get(attachedPluginTabsBaseAtom),
	(_get, set, next: Map<string, string[]>) => {
		set(attachedPluginTabsBaseAtom, next);
		localStorage.setItem(ATTACHED_PLUGIN_TABS_STORAGE_KEY, JSON.stringify(Object.fromEntries(next)));
	},
);

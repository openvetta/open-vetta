import type { ActivityTabKey } from "@shared/lib/project-profile";
import { atom } from "jotai";

export const activityPanelOpenAtom = atom<boolean>(false);
export const activityPanelWidthAtom = atom<number>(360);

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

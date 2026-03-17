/**
 * Shortcut definitions and persistence.
 *
 * Each shortcut has:
 * - id: unique identifier
 * - label: Chinese display name
 * - defaultShortcut: default key combo (serialized)
 * - shortcut: current key combo (may differ if user customized)
 */

export interface ShortcutAction {
	id: string;
	label: string;
	description: string;
	defaultShortcut: string;
}

/** All available shortcut actions with defaults */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
	{
		id: "new-session",
		label: "新建会话",
		description: "在当前项目下创建新的对话会话",
		defaultShortcut: "mod+n",
	},
	{
		id: "open-project",
		label: "打开项目",
		description: "选择并打开一个项目文件夹",
		defaultShortcut: "mod+o",
	},
	{
		id: "open-settings",
		label: "打开设置",
		description: "打开设置页面",
		defaultShortcut: "mod+,",
	},
];

const STORAGE_KEY = "vetta-shortcuts";

export type ShortcutMap = Record<string, string>;

/** Load user-customized shortcuts from localStorage */
export function loadShortcuts(): ShortcutMap {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as ShortcutMap;
	} catch {
		// ignore
	}
	return {};
}

/** Save customized shortcuts to localStorage */
export function saveShortcuts(map: ShortcutMap): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** Get the effective shortcut for an action (custom or default) */
export function getEffectiveShortcut(actionId: string, customMap: ShortcutMap): string {
	if (customMap[actionId]) return customMap[actionId];
	const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId);
	return action?.defaultShortcut ?? "";
}

/** Reset a single shortcut to its default */
export function resetShortcut(actionId: string, customMap: ShortcutMap): ShortcutMap {
	const next = { ...customMap };
	delete next[actionId];
	saveShortcuts(next);
	return next;
}

/** Reset all shortcuts to defaults */
export function resetAllShortcuts(): ShortcutMap {
	localStorage.removeItem(STORAGE_KEY);
	return {};
}

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
	/** settings ns i18n key，渲染期解析（模块级常量不存中文）。 */
	labelKey: string;
	descriptionKey: string;
	defaultShortcut: string;
}

/** All available shortcut actions with defaults。as const 保留 labelKey 字面量类型供 t() 校验。 */
export const SHORTCUT_ACTIONS = [
	{
		id: "new-session",
		labelKey: "shortcutNewSessionLabel",
		descriptionKey: "shortcutNewSessionDesc",
		defaultShortcut: "mod+n",
	},
	{
		id: "open-project",
		labelKey: "shortcutOpenProjectLabel",
		descriptionKey: "shortcutOpenProjectDesc",
		defaultShortcut: "mod+o",
	},
	{
		id: "open-settings",
		labelKey: "shortcutOpenSettingsLabel",
		descriptionKey: "shortcutOpenSettingsDesc",
		defaultShortcut: "mod+,",
	},
] as const;

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

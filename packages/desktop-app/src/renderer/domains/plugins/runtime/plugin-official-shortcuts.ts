import type {
	PluginOfficialApi,
	PluginOfficialQuickPanelSettings,
	PluginOfficialShortcutBinding,
} from "@vetta-org/plugin-sdk";
import {
	findShortcutBindingConflict,
	getShortcutActionDef,
	isShortcutActionId,
	isValidShortcutCombo,
	listShortcutBindingsSnapshot,
	normalizeShortcutCombo,
	SHORTCUT_ACTIONS,
	type ShortcutActionId,
	type ShortcutBindings,
} from "../../../../shared/shortcuts";

function snapshotQuickPanel(
	config: Awaited<ReturnType<typeof window.vetta.config.get>>,
): PluginOfficialQuickPanelSettings {
	const trigger =
		config.quickPanel?.trigger === "mod" ||
		config.quickPanel?.trigger === "alt" ||
		config.quickPanel?.trigger === "shift"
			? config.quickPanel.trigger
			: "none";
	const postSendBehavior = config.quickPanel?.postSendBehavior === "background" ? "background" : "foreground";
	return { trigger, postSendBehavior };
}

function readBindings(config: Awaited<ReturnType<typeof window.vetta.config.get>>): ShortcutBindings {
	const raw = config.shortcuts?.bindings ?? {};
	const result: ShortcutBindings = {};
	for (const action of SHORTCUT_ACTIONS) {
		const value = raw[action.id];
		if (typeof value === "string" && value.length > 0) result[action.id] = value;
	}
	return result;
}

function bindingsSnapshot(bindings: ShortcutBindings): PluginOfficialShortcutBinding[] {
	return listShortcutBindingsSnapshot(bindings);
}

export function createOfficialShortcutsApi(assertOfficial: () => void): PluginOfficialApi["shortcuts"] {
	return {
		listAvailableActions: () => {
			assertOfficial();
			return SHORTCUT_ACTIONS.map((action) => ({
				id: action.id,
				defaultShortcut: action.defaultShortcut,
			}));
		},
		get: async () => {
			assertOfficial();
			const config = await window.vetta.config.get();
			return {
				bindings: bindingsSnapshot(readBindings(config)),
				quickPanel: snapshotQuickPanel(config),
			};
		},
		setBinding: async (id, shortcut) => {
			assertOfficial();
			if (!isShortcutActionId(id)) throw new Error(`Unknown shortcut action id: ${id}`);
			const normalized = normalizeShortcutCombo(shortcut);
			if (!isValidShortcutCombo(normalized)) throw new Error(`Invalid shortcut combo: ${shortcut}`);
			const config = await window.vetta.config.get();
			const current = readBindings(config);
			const conflict = findShortcutBindingConflict(id, normalized, current);
			if (conflict) {
				throw new Error(`Shortcut ${JSON.stringify(normalized)} is already bound to ${JSON.stringify(conflict)}.`);
			}
			const next: ShortcutBindings = { ...current };
			const def = getShortcutActionDef(id);
			if (normalized === def.defaultShortcut) delete next[id];
			else next[id] = normalized;
			await window.vetta.config.set({ shortcuts: { bindings: next as Record<string, string> } });
			return { bindings: bindingsSnapshot(next) };
		},
		resetBinding: async (id) => {
			assertOfficial();
			if (!isShortcutActionId(id)) throw new Error(`Unknown shortcut action id: ${id}`);
			const config = await window.vetta.config.get();
			const current = readBindings(config);
			const next: ShortcutBindings = { ...current };
			delete next[id as ShortcutActionId];
			await window.vetta.config.set({ shortcuts: { bindings: next as Record<string, string> } });
			return {
				bindings: bindingsSnapshot(next),
				shortcut: getShortcutActionDef(id).defaultShortcut,
			};
		},
		resetAllBindings: async () => {
			assertOfficial();
			await window.vetta.config.set({ shortcuts: { bindings: {} } });
			return { bindings: bindingsSnapshot({}) };
		},
		setQuickPanelTrigger: async (trigger) => {
			assertOfficial();
			const config = await window.vetta.config.get();
			const current = snapshotQuickPanel(config);
			await window.vetta.config.set({
				quickPanel: { trigger, postSendBehavior: current.postSendBehavior },
			});
			await window.vetta.quickPanel.reloadHotkey();
			return snapshotQuickPanel(await window.vetta.config.get());
		},
		setQuickPanelBehavior: async (behavior) => {
			assertOfficial();
			const config = await window.vetta.config.get();
			const current = snapshotQuickPanel(config);
			await window.vetta.config.set({
				quickPanel: { trigger: current.trigger, postSendBehavior: behavior },
			});
			await window.vetta.quickPanel.reloadHotkey();
			return snapshotQuickPanel(await window.vetta.config.get());
		},
	};
}

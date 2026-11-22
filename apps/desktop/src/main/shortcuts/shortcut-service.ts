import type { ShortcutBindingResetResult, ShortcutBindingsResult, ShortcutSettings } from "@vetta-org/capability-sdk";
import { BrowserWindow } from "electron";
import {
	findShortcutBindingConflict,
	getShortcutActionDef,
	isShortcutActionId,
	isValidShortcutCombo,
	listShortcutBindingsSnapshot,
	normalizeShortcutBindings,
	normalizeShortcutCombo,
	type ShortcutBindings,
} from "../../shared/shortcuts.js";
import { SHORTCUTS_CHANNELS } from "../../shared/shortcuts-ipc.js";
import {
	type DesktopConfig,
	type DesktopConfigUpdater,
	readDesktopConfig,
	updateDesktopConfig,
} from "../config/desktop-config-store.js";

export interface ShortcutServiceOptions {
	readonly readConfig: () => Promise<DesktopConfig>;
	readonly updateConfig: (update: DesktopConfigUpdater) => Promise<DesktopConfig>;
	readonly broadcastBindings: (bindings: Record<string, string>) => void;
}

function readBindings(config: DesktopConfig): ShortcutBindings {
	return normalizeShortcutBindings(config.shortcuts?.bindings);
}

export class ShortcutService {
	constructor(private readonly options: ShortcutServiceOptions) {}

	async getSettings(): Promise<ShortcutSettings> {
		const config = await this.options.readConfig();
		return {
			bindings: listShortcutBindingsSnapshot(readBindings(config)),
		};
	}

	async setBinding(id: string, shortcut: string): Promise<ShortcutBindingsResult> {
		if (!isShortcutActionId(id)) throw new Error(`Unknown shortcut action id: ${id}`);
		const normalized = normalizeShortcutCombo(shortcut);
		if (!isValidShortcutCombo(normalized)) throw new Error(`Invalid shortcut combo: ${shortcut}`);

		let next: ShortcutBindings = {};
		await this.options.updateConfig((config) => {
			const current = readBindings(config);
			const conflict = findShortcutBindingConflict(id, normalized, current);
			if (conflict) {
				throw new Error(`Shortcut ${JSON.stringify(normalized)} is already bound to ${JSON.stringify(conflict)}.`);
			}
			next = { ...current };
			const definition = getShortcutActionDef(id);
			if (normalized === definition.defaultShortcut) delete next[id];
			else next[id] = normalized;
			return { ...config, shortcuts: { bindings: next } };
		});
		this.options.broadcastBindings(next);
		return { bindings: listShortcutBindingsSnapshot(next) };
	}

	async resetBinding(id: string): Promise<ShortcutBindingResetResult> {
		if (!isShortcutActionId(id)) throw new Error(`Unknown shortcut action id: ${id}`);
		let next: ShortcutBindings = {};
		await this.options.updateConfig((config) => {
			next = { ...readBindings(config) };
			delete next[id];
			return { ...config, shortcuts: { bindings: next } };
		});
		this.options.broadcastBindings(next);
		return {
			bindings: listShortcutBindingsSnapshot(next),
			shortcut: getShortcutActionDef(id).defaultShortcut,
		};
	}

	async resetAllBindings(): Promise<ShortcutBindingsResult> {
		await this.options.updateConfig((config) => ({ ...config, shortcuts: { bindings: {} } }));
		this.options.broadcastBindings({});
		return { bindings: listShortcutBindingsSnapshot({}) };
	}

	notifyBindingsChanged(bindings: Record<string, string>): void {
		this.options.broadcastBindings(bindings);
	}
}

function broadcastBindings(bindings: Record<string, string>): void {
	const payload = { bindings };
	for (const win of BrowserWindow.getAllWindows()) {
		if (win.isDestroyed()) continue;
		win.webContents.send(SHORTCUTS_CHANNELS.CHANGED, payload);
	}
}

const desktopShortcutService = new ShortcutService({
	readConfig: readDesktopConfig,
	updateConfig: updateDesktopConfig,
	broadcastBindings,
});

export function getDesktopShortcutService(): ShortcutService {
	return desktopShortcutService;
}

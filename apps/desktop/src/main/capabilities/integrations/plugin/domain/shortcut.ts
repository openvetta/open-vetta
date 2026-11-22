import {
	DOMAIN_SHORTCUT_CAPABILITIES,
	type ShortcutBindingResetResult,
	type ShortcutBindingsResult,
	type ShortcutSettings,
} from "@vetta-org/capability-sdk";
import type { PluginCapabilitySessionAccess } from "../types.js";

export const pluginShortcutMethods = {
	getShortcutSettings(this: PluginCapabilitySessionAccess, sessionId: string): Promise<ShortcutSettings> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SHORTCUT_CAPABILITIES.GET_SETTINGS, {});
	},

	setShortcutBinding(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		id: string,
		shortcut: string,
	): Promise<ShortcutBindingsResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SHORTCUT_CAPABILITIES.SET_BINDING, {
			id,
			shortcut,
		});
	},

	resetShortcutBinding(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		id: string,
	): Promise<ShortcutBindingResetResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SHORTCUT_CAPABILITIES.RESET_BINDING, {
			id,
		});
	},

	resetAllShortcutBindings(this: PluginCapabilitySessionAccess, sessionId: string): Promise<ShortcutBindingsResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_SHORTCUT_CAPABILITIES.RESET_ALL_BINDINGS, {});
	},
};

export type PluginShortcutMethods = typeof pluginShortcutMethods;

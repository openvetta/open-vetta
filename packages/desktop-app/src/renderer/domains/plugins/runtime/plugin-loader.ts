import { createInstance, type ModuleFederation } from "@module-federation/enhanced/runtime";
import type { InstalledPlugin } from "@preload/api";
import type { ActivityTabKey } from "@shared/lib/project-profile";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	attachedPluginTabsAtom,
} from "@shared/store/atoms";
import type {
	Disposable,
	PluginActivityTabContribution,
	PluginContext,
	PluginConversationApi,
	PluginDefinition,
	PluginFilePreviewContribution,
	PluginGlobalSlotContribution,
	PluginImagesApi,
	PluginInputActionContribution,
	PluginMessageSlotContribution,
	PluginPermission,
	PluginSettingsApi,
} from "@vetta/plugin-sdk";
import * as pluginSdk from "@vetta/plugin-sdk";
import { getDefaultStore } from "jotai";
import type { ComponentType } from "react";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import { pluginHostBridge } from "./plugin-host-bridge";

export interface LoadedPlugin {
	id: string;
	name: string;
	version: string;
	slots: PluginGlobalSlotContribution[];
	filePreviews: PluginFilePreviewContribution[];
	activityTabs: PluginActivityTabContribution[];
	inputActions: PluginInputActionContribution[];
	messageSlots: PluginMessageSlotContribution[];
	dispose(): Promise<void>;
}

/**
 * Attach + activate a plugin's own activity tab and open the panel, driven
 * directly off the jotai store so it works regardless of whether the activity
 * panel component is currently mounted/expanded. Keyed by the active
 * conversation's cwd (same key the attach records use, see ADR-0026).
 */
function openPluginActivityTab(pluginId: string, tabId: string): void {
	const store = getDefaultStore();
	const cwd = store.get(activeSessionAtom)?.cwd ?? null;
	if (!cwd) {
		console.warn("[plugin] openActivityTab: no active conversation cwd");
		return;
	}
	const key = `${pluginId}:${tabId}`;
	const attached = store.get(attachedPluginTabsAtom);
	const list = attached.get(cwd) ?? [];
	if (!list.includes(key)) {
		const next = new Map(attached);
		next.set(cwd, [...list, key]);
		store.set(attachedPluginTabsAtom, next);
	}
	const active = new Map(store.get(activityPanelTabByProjectAtom));
	active.set(cwd, `plugin:${key}` as ActivityTabKey);
	store.set(activityPanelTabByProjectAtom, active);
	store.set(activityPanelOpenAtom, true);
}

interface PluginModule {
	default?: PluginDefinition;
	activate?: PluginDefinition["activate"];
	deactivate?: PluginDefinition["deactivate"];
}

let moduleFederationHost: ModuleFederation | undefined;
const registeredRemotes = new Map<string, { alias: string; entry: string }>();

function getModuleFederationHost(): ModuleFederation {
	moduleFederationHost ??= createInstance({
		name: "vetta_plugin_host",
		remotes: [],
		shared: {
			"@vetta/plugin-sdk": {
				version: "1.0.0",
				lib: () => pluginSdk,
				shareConfig: {
					singleton: true,
					requiredVersion: false,
				},
			},
			react: {
				version: React.version,
				lib: () => React,
				shareConfig: {
					singleton: true,
					requiredVersion: false,
				},
			},
			"react-dom": {
				version: ReactDom.version,
				lib: () => ReactDom,
				shareConfig: {
					singleton: true,
					requiredVersion: false,
				},
			},
			"react/jsx-runtime": {
				version: React.version,
				lib: () => jsxRuntime,
				shareConfig: {
					singleton: true,
					requiredVersion: false,
				},
			},
		},
		shareStrategy: "loaded-first",
	});
	return moduleFederationHost;
}

function assertPluginModule(value: unknown): PluginModule {
	if (value == null || typeof value !== "object") {
		throw new Error("Plugin module must export a plugin definition");
	}
	return value as PluginModule;
}

function normalizePluginDefinition(module: PluginModule): PluginDefinition {
	if (module.default) return module.default;
	if (module.activate) {
		return {
			activate: module.activate,
			deactivate: module.deactivate,
		};
	}
	throw new Error("Plugin module must export default definePlugin(...) or activate()");
}

function hasPermission(plugin: InstalledPlugin, permission: PluginPermission): boolean {
	return plugin.permissions.includes(permission) && plugin.grantedPermissions.includes(permission);
}

function createPermissionApi(plugin: InstalledPlugin): PluginContext["permissions"] {
	return {
		has: (permission) => hasPermission(plugin, permission),
		require: (permission) => {
			if (!hasPermission(plugin, permission)) {
				throw new Error(`Plugin permission denied: ${permission}`);
			}
		},
	};
}

function loadPluginStyles(plugin: InstalledPlugin): Disposable {
	const links = plugin.styleUrls.map((href) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = href;
		link.dataset.vettaPluginId = plugin.id;
		document.head.append(link);
		return link;
	});
	return {
		dispose: () => {
			for (const link of links) link.remove();
		},
	};
}

function createConversationApi(plugin: InstalledPlugin): PluginConversationApi {
	const permissions = createPermissionApi(plugin);
	return {
		sendPrompt: async (text) => {
			permissions.require("agent.session.write");
			await pluginHostBridge.conversation.sendPrompt(text);
		},
		insertText: (text) => {
			permissions.require("agent.session.write");
			pluginHostBridge.conversation.insertText(text);
		},
		abort: async () => {
			permissions.require("agent.session.write");
			await pluginHostBridge.conversation.abort();
		},
		on: (listener) => {
			permissions.require("agent.session.read");
			return pluginHostBridge.conversation.on(listener);
		},
	};
}

function createSettingsApi(
	plugin: InstalledPlugin,
	initial: Record<string, unknown>,
	disposers: Array<() => void>,
): PluginSettingsApi {
	let values = initial;
	const listeners = new Set<(values: Record<string, unknown>) => void>();
	const unsub = window.vetta.plugins.onSettingsChanged((payload) => {
		if (payload.pluginId !== plugin.id) return;
		values = payload.values;
		for (const listener of listeners) listener(values);
	});
	disposers.push(() => {
		unsub();
		listeners.clear();
	});
	return {
		get<T = unknown>(key: string): T | undefined {
			return values[key] as T | undefined;
		},
		getAll(): Record<string, unknown> {
			return { ...values };
		},
		onChange(listener: (values: Record<string, unknown>) => void): Disposable {
			listeners.add(listener);
			return { dispose: () => listeners.delete(listener) };
		},
	};
}

function createImagesApi(plugin: InstalledPlugin): PluginImagesApi {
	const guard = (): void => createPermissionApi(plugin).require("images.generate");
	return {
		generate: (input) => {
			guard();
			return window.vetta.plugins.generateImage(plugin.id, input);
		},
		edit: (input) => {
			guard();
			return window.vetta.plugins.editImage(plugin.id, input);
		},
		lineage: (imageId) => {
			guard();
			return window.vetta.plugins.imageLineage(plugin.id, imageId);
		},
	};
}

function createContext(
	plugin: InstalledPlugin,
	slots: PluginGlobalSlotContribution[],
	filePreviews: PluginFilePreviewContribution[],
	activityTabs: PluginActivityTabContribution[],
	inputActions: PluginInputActionContribution[],
	messageSlots: PluginMessageSlotContribution[],
	settingsApi: PluginSettingsApi,
	onChanged: () => void,
): PluginContext {
	const registerGlobalSlot = (contribution: PluginGlobalSlotContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.global");
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Global slot id is required");
		}
		const component = contribution.component as ComponentType;
		if (typeof component !== "function" && typeof component !== "object") {
			throw new Error("Global slot component is invalid");
		}
		const normalized = {
			id: `${plugin.id}:${contribution.id}`,
			component,
		};
		slots.push(normalized);
		onChanged();
		const disposable = {
			dispose: () => {
				const index = slots.findIndex((slot) => slot.id === normalized.id);
				if (index >= 0) slots.splice(index, 1);
				onChanged();
			},
		};
		return disposable;
	};
	const registerFilePreview = (contribution: PluginFilePreviewContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.file-preview");
		const extensions = Array.isArray(contribution.extensions)
			? contribution.extensions.map((ext) => ext.trim().toLowerCase()).filter(Boolean)
			: [];
		if (extensions.length === 0) {
			throw new Error("File preview must declare at least one extension");
		}
		if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
			throw new Error("File preview component is invalid");
		}
		const normalized: PluginFilePreviewContribution = { extensions, component: contribution.component };
		filePreviews.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = filePreviews.indexOf(normalized);
				if (index >= 0) filePreviews.splice(index, 1);
				onChanged();
			},
		};
	};
	const registerActivityTab = (contribution: PluginActivityTabContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.activity-tab");
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Activity tab id is required");
		}
		if (typeof contribution.label !== "string" || contribution.label.trim().length === 0) {
			throw new Error("Activity tab label is required");
		}
		if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
			throw new Error("Activity tab component is invalid");
		}
		const normalized: PluginActivityTabContribution = {
			id: contribution.id,
			label: contribution.label,
			icon: contribution.icon,
			component: contribution.component,
		};
		activityTabs.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = activityTabs.indexOf(normalized);
				if (index >= 0) activityTabs.splice(index, 1);
				onChanged();
			},
		};
	};
	const registerInputAction = (contribution: PluginInputActionContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.input-action");
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Input action id is required");
		}
		if (typeof contribution.label !== "string" || contribution.label.trim().length === 0) {
			throw new Error("Input action label is required");
		}
		const normalized: PluginInputActionContribution = {
			id: `${plugin.id}:${contribution.id}`,
			label: contribution.label,
			icon: contribution.icon,
			defaultActive: contribution.defaultActive,
			onToggle: contribution.onToggle,
			decoratePrompt: contribution.decoratePrompt,
		};
		inputActions.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = inputActions.findIndex((action) => action.id === normalized.id);
				if (index >= 0) inputActions.splice(index, 1);
				onChanged();
			},
		};
	};
	const registerMessageSlot = (contribution: PluginMessageSlotContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.message");
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Message slot id is required");
		}
		if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
			throw new Error("Message slot component is invalid");
		}
		const normalized: PluginMessageSlotContribution = {
			id: `${plugin.id}:${contribution.id}`,
			component: contribution.component,
		};
		messageSlots.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = messageSlots.findIndex((slot) => slot.id === normalized.id);
				if (index >= 0) messageSlots.splice(index, 1);
				onChanged();
			},
		};
	};
	const openActivityTab = (tabId: string): void => {
		createPermissionApi(plugin).require("ui.slot.activity-tab");
		if (typeof tabId !== "string" || tabId.trim().length === 0) {
			throw new Error("Activity tab id is required");
		}
		openPluginActivityTab(plugin.id, tabId);
	};
	return {
		plugin: {
			id: plugin.id,
			version: plugin.activeVersion,
		},
		permissions: createPermissionApi(plugin),
		ui: {
			registerGlobalSlot,
			registerFilePreview,
			registerActivityTab,
			registerInputAction,
			registerMessageSlot,
			openActivityTab,
		},
		conversation: createConversationApi(plugin),
		images: createImagesApi(plugin),
		settings: settingsApi,
	};
}

async function assertPluginEntryFetchable(plugin: InstalledPlugin): Promise<void> {
	try {
		const response = await fetch(plugin.entryUrl, { cache: "no-store" });
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
		}
		const contentType = response.headers.get("content-type") ?? "";
		const expectedContentType = plugin.runtime === "module-federation" ? "json" : "javascript";
		if (!contentType.includes(expectedContentType)) {
			throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Plugin entry is not fetchable: ${plugin.entryUrl}; ${message}`);
	}
}

async function loadPluginModule(plugin: InstalledPlugin): Promise<PluginModule> {
	if (plugin.runtime !== "module-federation") {
		return assertPluginModule(await import(/* @vite-ignore */ plugin.entryUrl));
	}
	const moduleFederation = plugin.moduleFederation;
	if (!moduleFederation) {
		throw new Error("Module Federation plugin is missing moduleFederation metadata");
	}
	const host = getModuleFederationHost();
	const remote = {
		name: moduleFederation.remoteName,
		alias: plugin.id,
		entry: plugin.entryUrl,
	};
	const registeredRemote = registeredRemotes.get(remote.name);
	if (!registeredRemote || registeredRemote.alias !== remote.alias || registeredRemote.entry !== remote.entry) {
		host.registerRemotes([remote], registeredRemote ? { force: true } : undefined);
		registeredRemotes.set(remote.name, {
			alias: remote.alias,
			entry: remote.entry,
		});
	}
	const expose = moduleFederation.expose.replace(/^\.\//, "");
	const loaded = await host.loadRemote<unknown>(`${moduleFederation.remoteName}/${expose}`, { from: "runtime" });
	if (loaded == null) {
		throw new Error(`Module Federation remote returned null: ${moduleFederation.remoteName}/${expose}`);
	}
	return assertPluginModule(loaded);
}

export async function loadPlugin(plugin: InstalledPlugin, onChanged: () => void): Promise<LoadedPlugin> {
	const slots: PluginGlobalSlotContribution[] = [];
	const filePreviews: PluginFilePreviewContribution[] = [];
	const activityTabs: PluginActivityTabContribution[] = [];
	const inputActions: PluginInputActionContribution[] = [];
	const messageSlots: PluginMessageSlotContribution[] = [];
	const disposers: Array<() => void> = [];
	const styleHandle = loadPluginStyles(plugin);
	await assertPluginEntryFetchable(plugin);
	const module = await loadPluginModule(plugin);
	const definition = normalizePluginDefinition(module);
	const initialSettings = plugin.settingsSchema?.length
		? await window.vetta.plugins.getSettings(plugin.id).catch(() => ({}))
		: {};
	const settingsApi = createSettingsApi(plugin, initialSettings, disposers);
	const context = createContext(
		plugin,
		slots,
		filePreviews,
		activityTabs,
		inputActions,
		messageSlots,
		settingsApi,
		onChanged,
	);
	await definition.activate(context);
	return {
		id: plugin.id,
		name: plugin.name,
		version: plugin.activeVersion,
		slots,
		filePreviews,
		activityTabs,
		inputActions,
		messageSlots,
		dispose: async () => {
			await definition.deactivate?.();
			styleHandle.dispose();
			for (const dispose of disposers) dispose();
			slots.splice(0, slots.length);
			filePreviews.splice(0, filePreviews.length);
			activityTabs.splice(0, activityTabs.length);
			inputActions.splice(0, inputActions.length);
			messageSlots.splice(0, messageSlots.length);
			onChanged();
		},
	};
}

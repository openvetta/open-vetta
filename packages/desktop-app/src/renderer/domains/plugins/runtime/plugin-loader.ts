import { createInstance, type ModuleFederation } from "@module-federation/enhanced/runtime";
import type { InstalledPlugin } from "@preload/api";
import type {
	Disposable,
	PluginContext,
	PluginDefinition,
	PluginGlobalSlotContribution,
	PluginPermission,
} from "@vetta/plugin-sdk";
import * as pluginSdk from "@vetta/plugin-sdk";
import type { ComponentType } from "react";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";

export interface LoadedPlugin {
	id: string;
	name: string;
	version: string;
	slots: PluginGlobalSlotContribution[];
	dispose(): Promise<void>;
}

interface PluginModule {
	default?: PluginDefinition;
	activate?: PluginDefinition["activate"];
	deactivate?: PluginDefinition["deactivate"];
}

let moduleFederationHost: ModuleFederation | undefined;

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

function createContext(
	plugin: InstalledPlugin,
	slots: PluginGlobalSlotContribution[],
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
	return {
		plugin: {
			id: plugin.id,
			version: plugin.activeVersion,
		},
		permissions: createPermissionApi(plugin),
		ui: {
			registerGlobalSlot,
		},
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
	host.registerRemotes(
		[
			{
				name: moduleFederation.remoteName,
				alias: plugin.id,
				entry: plugin.entryUrl,
			},
		],
		{ force: true },
	);
	const expose = moduleFederation.expose.replace(/^\.\//, "");
	const loaded = await host.loadRemote<unknown>(`${moduleFederation.remoteName}/${expose}`, { from: "runtime" });
	if (loaded == null) {
		throw new Error(`Module Federation remote returned null: ${moduleFederation.remoteName}/${expose}`);
	}
	return assertPluginModule(loaded);
}

export async function loadPlugin(plugin: InstalledPlugin, onChanged: () => void): Promise<LoadedPlugin> {
	const slots: PluginGlobalSlotContribution[] = [];
	const styleHandle = loadPluginStyles(plugin);
	await assertPluginEntryFetchable(plugin);
	const module = await loadPluginModule(plugin);
	const definition = normalizePluginDefinition(module);
	const context = createContext(plugin, slots, onChanged);
	await definition.activate(context);
	return {
		id: plugin.id,
		name: plugin.name,
		version: plugin.activeVersion,
		slots,
		dispose: async () => {
			await definition.deactivate?.();
			styleHandle.dispose();
			slots.splice(0, slots.length);
			onChanged();
		},
	};
}

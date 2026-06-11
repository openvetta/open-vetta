import type { InstalledPlugin, PluginPermission } from "@preload/api";
import type { Disposable, PluginContext, PluginDefinition, PluginGlobalSlotContribution } from "@shared/plugin-sdk";
import type { ComponentType } from "react";

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

export async function loadPlugin(plugin: InstalledPlugin, onChanged: () => void): Promise<LoadedPlugin> {
	const slots: PluginGlobalSlotContribution[] = [];
	const styleHandle = loadPluginStyles(plugin);
	const module = assertPluginModule(await import(/* @vite-ignore */ plugin.entryUrl));
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

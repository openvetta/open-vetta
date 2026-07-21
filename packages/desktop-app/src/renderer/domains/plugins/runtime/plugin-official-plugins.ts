import type { InstalledPlugin } from "@preload/api";
import type { PluginOfficialApi, PluginOfficialPluginSummary } from "@vetta-org/plugin-sdk";

function summarizePlugin(plugin: InstalledPlugin): PluginOfficialPluginSummary {
	return {
		id: plugin.id,
		name: plugin.name,
		version: plugin.version,
		enabled: plugin.enabled,
		required: plugin.required,
		source: plugin.source,
		permissions: plugin.grantedPermissions,
		description: plugin.description,
		devWatch: plugin.devWatch,
	};
}

export function createOfficialPluginsApi(assertOfficial: () => void): PluginOfficialApi["plugins"] {
	return {
		list: async () => {
			assertOfficial();
			return (await window.vetta.plugins.list()).map(summarizePlugin);
		},
		get: async (id) => {
			assertOfficial();
			const plugin = (await window.vetta.plugins.list()).find((item) => item.id === id);
			if (!plugin) throw new Error(`Plugin not found: ${id}`);
			return summarizePlugin(plugin);
		},
		setEnabled: async (id, enabled) => {
			assertOfficial();
			await window.vetta.plugins.setEnabled(id, enabled);
			const plugin = (await window.vetta.plugins.list()).find((item) => item.id === id);
			if (!plugin) throw new Error(`Plugin not found: ${id}`);
			return summarizePlugin(plugin);
		},
		installFromUrl: async (url) => {
			assertOfficial();
			return summarizePlugin(await window.vetta.plugins.installFromUrl(url));
		},
		installFromPath: async (path, options) => {
			assertOfficial();
			let installed = await window.vetta.plugins.installFromPath(path, {
				grantedPermissions: options?.grantedPermissions as never,
				enable: options?.enable !== false,
				source: "archive",
			});
			if (
				(!options?.grantedPermissions || options.grantedPermissions.length === 0) &&
				installed.permissions.length > 0
			) {
				installed = await window.vetta.plugins.grantPermissions(installed.id, installed.permissions);
			}
			await window.vetta.plugins.setEnabled(installed.id, options?.enable !== false);
			const latest = (await window.vetta.plugins.list()).find((item) => item.id === installed.id) ?? installed;
			return summarizePlugin(latest);
		},
		uninstall: async (id) => {
			assertOfficial();
			await window.vetta.plugins.uninstall(id);
		},
		reload: async (id) => {
			assertOfficial();
			return summarizePlugin(await window.vetta.plugins.reload(id));
		},
	};
}

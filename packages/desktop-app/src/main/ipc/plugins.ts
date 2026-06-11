import { ipcMain } from "electron";
import type { PluginInstallOptions, PluginPermission } from "../../preload/api-types/plugins.js";
import {
	grantPluginPermissions,
	installPluginFromArchive,
	installPluginFromUrl,
	listPlugins,
	reloadPlugin,
	revokePluginPermissions,
	setPluginEnabled,
	uninstallPlugin,
} from "../plugins/plugin-store.js";

function asArchiveBuffer(value: unknown): ArrayBuffer | Buffer {
	if (value instanceof ArrayBuffer || Buffer.isBuffer(value)) return value;
	throw new Error("Invalid plugin archive buffer");
}

function asOptions(value: unknown): PluginInstallOptions | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object") throw new Error("Invalid plugin install options");
	const input = value as Record<string, unknown>;
	const source = input.source === "remote" ? "remote" : input.source === "archive" ? "archive" : undefined;
	const grantedPermissions =
		Array.isArray(input.grantedPermissions) && input.grantedPermissions.every((item) => typeof item === "string")
			? (input.grantedPermissions as PluginPermission[])
			: undefined;
	return { source, grantedPermissions };
}

function asPluginId(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error("Invalid plugin id");
	}
	return value.trim();
}

function asPermissions(value: unknown): PluginPermission[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error("Invalid plugin permissions");
	}
	return value as PluginPermission[];
}

export function registerPluginsIpc(): () => void {
	ipcMain.handle("vetta:plugins:list", () => listPlugins());
	ipcMain.handle("vetta:plugins:install-from-archive", (_event, archiveBuffer: unknown, options: unknown) =>
		installPluginFromArchive(asArchiveBuffer(archiveBuffer), asOptions(options)),
	);
	ipcMain.handle("vetta:plugins:install-from-url", (_event, url: unknown, options: unknown) => {
		if (typeof url !== "string" || url.trim().length === 0) {
			throw new Error("Invalid plugin URL");
		}
		return installPluginFromUrl(url.trim(), asOptions(options));
	});
	ipcMain.handle("vetta:plugins:uninstall", (_event, id: unknown) => {
		uninstallPlugin(asPluginId(id));
	});
	ipcMain.handle("vetta:plugins:set-enabled", (_event, id: unknown, enabled: unknown) =>
		setPluginEnabled(asPluginId(id), enabled === true),
	);
	ipcMain.handle("vetta:plugins:grant-permissions", (_event, id: unknown, permissions: unknown) =>
		grantPluginPermissions(asPluginId(id), asPermissions(permissions)),
	);
	ipcMain.handle("vetta:plugins:revoke-permissions", (_event, id: unknown, permissions: unknown) =>
		revokePluginPermissions(asPluginId(id), asPermissions(permissions)),
	);
	ipcMain.handle("vetta:plugins:reload", (_event, id: unknown) => reloadPlugin(asPluginId(id)));

	return () => {
		ipcMain.removeHandler("vetta:plugins:list");
		ipcMain.removeHandler("vetta:plugins:install-from-archive");
		ipcMain.removeHandler("vetta:plugins:install-from-url");
		ipcMain.removeHandler("vetta:plugins:uninstall");
		ipcMain.removeHandler("vetta:plugins:set-enabled");
		ipcMain.removeHandler("vetta:plugins:grant-permissions");
		ipcMain.removeHandler("vetta:plugins:revoke-permissions");
		ipcMain.removeHandler("vetta:plugins:reload");
	};
}

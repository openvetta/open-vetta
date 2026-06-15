import { ipcMain, webContents } from "electron";
import type {
	PluginEditImageInput,
	PluginGenerateImageInput,
	PluginInstallOptions,
	PluginPermission,
} from "../../preload/api-types/plugins.js";
import { editImage, generateImage, imageLineage } from "../plugins/image-service.js";
import {
	getPluginSettings,
	grantPluginPermissions,
	installPluginFromArchive,
	installPluginFromUrl,
	listPlugins,
	reloadPlugin,
	revokePluginPermissions,
	setPluginEnabled,
	setPluginSettings,
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
	ipcMain.handle("vetta:plugins:get-settings", (_event, id: unknown) => getPluginSettings(asPluginId(id)));
	ipcMain.handle("vetta:plugins:set-settings", (_event, id: unknown, values: unknown) => {
		const pluginId = asPluginId(id);
		if (values == null || typeof values !== "object" || Array.isArray(values)) {
			throw new Error("Invalid plugin settings values");
		}
		const effective = setPluginSettings(pluginId, values as Record<string, unknown>);
		// Broadcast so the plugin host (and any open settings view) can react live.
		for (const contents of webContents.getAllWebContents()) {
			contents.send("vetta:plugins:settings-changed", { pluginId, values: effective });
		}
	});
	ipcMain.handle("vetta:plugins:images:generate", (_event, id: unknown, input: unknown) =>
		generateImage(asPluginId(id), input as PluginGenerateImageInput),
	);
	ipcMain.handle("vetta:plugins:images:edit", (_event, id: unknown, input: unknown) =>
		editImage(asPluginId(id), input as PluginEditImageInput),
	);
	ipcMain.handle("vetta:plugins:images:lineage", (_event, id: unknown, imageId: unknown) => {
		if (typeof imageId !== "string" || imageId.trim().length === 0) {
			throw new Error("Invalid image id");
		}
		return imageLineage(asPluginId(id), imageId.trim());
	});

	return () => {
		ipcMain.removeHandler("vetta:plugins:list");
		ipcMain.removeHandler("vetta:plugins:install-from-archive");
		ipcMain.removeHandler("vetta:plugins:install-from-url");
		ipcMain.removeHandler("vetta:plugins:uninstall");
		ipcMain.removeHandler("vetta:plugins:set-enabled");
		ipcMain.removeHandler("vetta:plugins:grant-permissions");
		ipcMain.removeHandler("vetta:plugins:revoke-permissions");
		ipcMain.removeHandler("vetta:plugins:reload");
		ipcMain.removeHandler("vetta:plugins:get-settings");
		ipcMain.removeHandler("vetta:plugins:set-settings");
		ipcMain.removeHandler("vetta:plugins:images:generate");
		ipcMain.removeHandler("vetta:plugins:images:edit");
		ipcMain.removeHandler("vetta:plugins:images:lineage");
	};
}

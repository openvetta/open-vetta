export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "ui.slot.activity-tab"
	| "agent.session.read"
	| "agent.session.write"
	| "agent.command.run"
	| "fs.read"
	| "fs.write"
	| "network.fetch"
	| "settings.read"
	| "settings.write";

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	pluginApiVersion: string;
	entry: string;
	runtime?: "esm" | "module-federation";
	moduleFederation?: {
		remoteName: string;
		expose: string;
	};
	styles?: string[];
	permissions?: PluginPermission[];
	description?: string;
	author?: string;
}

export interface InstalledPlugin {
	id: string;
	name: string;
	version: string;
	activeVersion: string;
	pluginApiVersion: string;
	runtime: "esm" | "module-federation";
	entryUrl: string;
	moduleFederation?: {
		remoteName: string;
		expose: string;
	};
	styleUrls: string[];
	permissions: PluginPermission[];
	grantedPermissions: PluginPermission[];
	description?: string;
	author?: string;
	enabled: boolean;
	installedAt: string;
	updatedAt: string;
	source: "archive" | "remote" | "system";
	availableVersion?: string;
	pendingVersion?: string;
}

export interface PluginInstallOptions {
	source?: "archive" | "remote";
	grantedPermissions?: PluginPermission[];
}

export interface DesktopPluginsApi {
	list(): Promise<InstalledPlugin[]>;
	installFromArchive(archiveBuffer: ArrayBuffer, options?: PluginInstallOptions): Promise<InstalledPlugin>;
	installFromUrl(url: string, options?: PluginInstallOptions): Promise<InstalledPlugin>;
	uninstall(id: string): Promise<void>;
	setEnabled(id: string, enabled: boolean): Promise<void>;
	grantPermissions(id: string, permissions: PluginPermission[]): Promise<InstalledPlugin>;
	revokePermissions(id: string, permissions: PluginPermission[]): Promise<InstalledPlugin>;
	reload(id: string): Promise<InstalledPlugin>;
}

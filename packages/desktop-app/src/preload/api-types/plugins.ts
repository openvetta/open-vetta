export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "ui.slot.activity-tab"
	| "ui.slot.input-action"
	| "ui.slot.message"
	| "agent.session.read"
	| "agent.session.write"
	| "agent.command.run"
	| "fs.read"
	| "fs.write"
	| "network.fetch"
	| "images.generate"
	| "settings.read"
	| "settings.write";

/**
 * A single declarative setting a plugin contributes via plugin.json's
 * `contributes.settings`. The host renders a form field from it (VSCode-style)
 * and persists the value namespaced by plugin id. `secret` masks the input but
 * stores plaintext, consistent with how models config stores apiKey.
 */
export interface PluginSettingSchema {
	key: string;
	/**
	 * `desc` is a read-only informational item: it stores no value and renders
	 * its `description` as a note (URLs become clickable external links). Useful
	 * with `visibleWhen` to show provider-specific guidance.
	 */
	type: "string" | "number" | "boolean" | "enum" | "secret" | "desc";
	/** Required for input types; optional for `desc` (which is text-only). */
	title?: string;
	description?: string;
	default?: string | number | boolean;
	/** Allowed values when type is "enum". */
	enum?: string[];
	/**
	 * Conditional visibility: only render this field when the setting named
	 * `key` currently holds one of the values in `in`. Lets a plugin show
	 * different fields per selected provider/mode.
	 */
	visibleWhen?: { key: string; in: string[] };
}

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
	contributes?: {
		settings?: PluginSettingSchema[];
	};
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
	settingsSchema?: PluginSettingSchema[];
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
	/** Effective setting values for a plugin (schema defaults merged with stored). */
	getSettings(id: string): Promise<Record<string, unknown>>;
	/** Persist setting values for a plugin (merged over existing). */
	setSettings(id: string, values: Record<string, unknown>): Promise<void>;
	/** Subscribe to setting changes for any plugin. Returns an unsubscribe fn. */
	onSettingsChanged(listener: (payload: { pluginId: string; values: Record<string, unknown> }) => void): () => void;
	/** Text-to-image via the main-process image service (out-of-band stored). */
	generateImage(pluginId: string, input: PluginGenerateImageInput): Promise<PluginImageResult[]>;
	/** Image-to-image edit, producing the next version in a lineage. */
	editImage(pluginId: string, input: PluginEditImageInput): Promise<PluginImageResult[]>;
	/** The edit lineage (base image + its edits, oldest first) for an image. */
	imageLineage(pluginId: string, imageId: string): Promise<PluginImageResult[]>;
}

export interface PluginImageResult {
	id: string;
	url: string;
	mimeType: string;
}

export interface PluginGenerateImageInput {
	prompt: string;
	/** Output size (e.g. "1024x1024"), decided by the agent and forwarded to the model. */
	size?: string;
	sessionId?: string;
}

export interface PluginEditImageInput {
	prompt: string;
	source: { imageId: string } | { data: string; mimeType: string };
	sessionId?: string;
}

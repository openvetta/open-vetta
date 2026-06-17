export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "ui.slot.activity-tab"
	| "ui.slot.input-action"
	| "ui.slot.message"
	| "agent.session.read"
	| "agent.session.write"
	| "agent.command.run"
	| "agent.systemPrompt.read"
	| "agent.systemPrompt.write"
	| "agent.systemPrompt.fullControl"
	| "agent.skills.control"
	| "agent.tools.control"
	| "agent.tools.register"
	| "agent.toolHandler.execute"
	| "agent.state.read"
	| "agent.state.write"
	| "agent.followUp.write"
	| "agent.runtime.configure"
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

export interface PluginAgentManifest {
	systemPrompt?: {
		/**
		 * Plugin-packaged prompt contribution file paths. Main-process aggregation
		 * resolves these relative to the installed plugin root.
		 */
		promptPaths?: string[];
	};
	/** Plugin-packaged skill files or directories to add to the agent resource graph. */
	skillPaths?: string[];
	/** Declarative tool visibility policy. Names are tool ids after registration. */
	toolPolicy?: {
		allow?: string[];
		deny?: string[];
	};
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
	agent?: PluginAgentManifest;
	styles?: string[];
	permissions?: PluginPermission[];
	contributes?: {
		settings?: PluginSettingSchema[];
	};
	description?: string;
	author?: string;
	/**
	 * 声明式引导词：开新会话欢迎页主动建议的提示语。点击即以该文本立即发起一轮。
	 * 与命令式 `ctx.ui.register*` 不同——纯静态清单数据、无权限位、无运行时注册（ADR-0003）。
	 */
	guidingWords?: string[];
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
	agent?: PluginAgentManifest;
	styleUrls: string[];
	permissions: PluginPermission[];
	grantedPermissions: PluginPermission[];
	settingsSchema?: PluginSettingSchema[];
	description?: string;
	author?: string;
	/** 见 PluginManifest.guidingWords —— NewSessionPage 欢迎页消费。 */
	guidingWords?: string[];
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

export interface PluginAgentToolRegistration {
	id: string;
	name: string;
	label?: string;
	description: string;
	parameters: Record<string, unknown>;
	handlerId: string;
	activationId?: string;
	timeoutMs?: number;
}

export interface PluginAgentToolInvocationRequest {
	requestId: string;
	sessionId: string;
	cwd: string;
	pluginId: string;
	toolId: string;
	toolName: string;
	handlerId: string;
	input: unknown;
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
	beginAgentToolsLoad(pluginId: string, activationId: string): Promise<void>;
	registerAgentTool(pluginId: string, registration: PluginAgentToolRegistration): Promise<void>;
	unregisterAgentTool(pluginId: string, toolId: string, activationId?: string): Promise<void>;
	clearAgentTools(pluginId: string, activationId?: string): Promise<void>;
	onAgentToolRequest(handler: (request: PluginAgentToolInvocationRequest) => void): () => void;
	respondAgentTool(requestId: string, result: unknown): Promise<void>;
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
	/** Every edit lineage this session touched, newest first; each lineage oldest→newest. */
	sessionLineages(pluginId: string, sessionId: string): Promise<PluginImageResult[][]>;
}

export interface PluginImageResult {
	id: string;
	url: string;
	mimeType: string;
	/** Edit-lineage root id (base image + all its edits share one rootId). */
	rootId: string;
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
	/** Output size (e.g. "1024x1024"); defaults to the service default when omitted. */
	size?: string;
	sessionId?: string;
}

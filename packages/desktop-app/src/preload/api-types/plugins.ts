export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "ui.slot.activity-tab"
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
	| "settings.read"
	| "settings.write";

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
	agent?: PluginAgentManifest;
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

export interface PluginAgentToolRegistration {
	id: string;
	name: string;
	label?: string;
	description: string;
	parameters: Record<string, unknown>;
	handlerId: string;
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
	registerAgentTool(pluginId: string, registration: PluginAgentToolRegistration): Promise<void>;
	unregisterAgentTool(pluginId: string, toolId: string): Promise<void>;
	clearAgentTools(pluginId: string): Promise<void>;
	onAgentToolRequest(handler: (request: PluginAgentToolInvocationRequest) => void): () => void;
	respondAgentTool(requestId: string, result: unknown): Promise<void>;
}

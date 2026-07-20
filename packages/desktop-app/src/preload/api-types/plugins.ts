export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "ui.slot.activity-tab"
	| "ui.slot.input-action"
	| "ui.slot.message"
	| "ui.slot.tool-call"
	| "ui.slot.turn-card"
	| "agent.session.read"
	| "agent.session.write"
	| "agent.command.run"
	| "agent.systemPrompt.read"
	| "agent.systemPrompt.write"
	| "agent.systemPrompt.fullControl"
	| "agent.skills.control"
	| "agent.mcp.control"
	| "agent.tools.control"
	| "agent.tools.register"
	| "agent.toolHandler.execute"
	| "agent.state.read"
	| "agent.state.write"
	| "agent.continuation.register"
	| "agent.runtime.configure"
	| "app.actions.register"
	| "app.actionHandler.execute"
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

export type PluginMcpServerConfig =
	| {
			type?: "stdio";
			command: string;
			args?: string[];
			env?: Record<string, string>;
			cwd?: string;
			disabled?: boolean;
			autoApprove?: string[];
			startupTimeout?: number;
			debug?: boolean;
			displayName?: string;
			description?: string;
	  }
	| {
			type: "http";
			url: string;
			headers?: Record<string, string>;
			oauthClientId?: string;
			oauthDeviceFlow?: boolean;
			oauthScopes?: string;
			disabled?: boolean;
			autoApprove?: string[];
			startupTimeout?: number;
			debug?: boolean;
			displayName?: string;
			description?: string;
	  };

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
	/**
	 * Plugin-scoped MCP: relative path to `.mcp.json` or inline server map.
	 * Requires `agent.mcp.control`. Not written to user mcp.json.
	 */
	mcpServers?: string | Record<string, PluginMcpServerConfig>;
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
	/**
	 * Executable names this plugin may run via `ctx.command.run` (granularity =
	 * binary name, e.g. `["git"]`). Anything not declared is hard-rejected. The
	 * user toggles each declared command on/off in plugin settings.
	 */
	commands?: string[];
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
	/**
	 * 缺译时的回退 locale（fallback 链：当前 locale → defaultLocale → 裸 key）。
	 * 省略默认 "zh"（与宿主一致，见 ADR-0033）。译文文件本身在 `locales/<lang>.json`，
	 * 由宿主加载、不在 manifest 内联。
	 */
	defaultLocale?: string;
	/**
	 * When hardIsolation is true, agent contributions stay stripped until the
	 * matching input-action mode is toggled on (ADR-0041). Declared in manifest
	 * so the gate applies before the plugin UI activates.
	 */
	contributionMode?: {
		hardIsolation?: boolean;
	};
}

/** 一份扁平 catalog：翻译 key → 本地化字符串。 */
export type PluginLocaleCatalog = Record<string, string>;
/** 插件随包发的全部 catalog，按 locale code 归集（如 "zh"、"en"）。 */
export type PluginLocales = Record<string, PluginLocaleCatalog>;

/**
 * Dev 热更新（插件工作台）：内存态 dev 链接快照，不落注册表。
 * 存在即表示该插件资源正从开发工程目录（而非安装目录）加载。
 */
export interface PluginDevWatchState {
	/** 开发工程根目录（含 plugin.json 与 dist/）。 */
	projectDir: string;
	/** starting = vite watch 已拉起但未产出首个构建；error 详见 error 字段。 */
	status: "starting" | "running" | "error";
	error?: string;
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
	/** Executable names declared in plugin.json `commands`. */
	declaredCommands: string[];
	/** Subset of declaredCommands the user currently allows (toggleable per command). */
	grantedCommandNames: string[];
	settingsSchema?: PluginSettingSchema[];
	description?: string;
	author?: string;
	/** 见 PluginManifest.guidingWords —— NewSessionPage 欢迎页消费。 */
	guidingWords?: string[];
	/** 缺译回退 locale（见 PluginManifest.defaultLocale）。 */
	defaultLocale: string;
	/**
	 * 宿主加载的全部语言 catalog（main 读 `locales/<lang>.json`，随本对象一次性下发）。
	 * 同时服务 manifest 占位符解析与运行期组件 `t()`（ADR-0033）。
	 */
	locales: PluginLocales;
	enabled: boolean;
	installedAt: string;
	updatedAt: string;
	source: "archive" | "remote" | "system";
	availableVersion?: string;
	pendingVersion?: string;
	/**
	 * Absolute filesystem root of the active plugin package
	 * (system staging dir, or `~/.vetta/plugins/<id>/versions/<activeVersion>`).
	 */
	rootPath: string;
	/** 存在即该插件处于 dev 热更新链接（资源改从工程目录加载）。 */
	devWatch?: PluginDevWatchState;
}

export interface PluginInstallOptions {
	source?: "archive" | "remote";
	grantedPermissions?: PluginPermission[];
	/** When true, enable the plugin after install (default false for GUI parity; agent path may set true). */
	enable?: boolean;
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
	/** 允许出现的对话场景 slug（fail-closed：缺省/空 = 所有场景都不激活）。 */
	scope_use?: readonly string[];
	/** 需要的会话能力 slug。 */
	requires?: string[];
	context?: { conversation?: "summary" | "messages" };
}

export type PluginAppActionEffect = "read" | "write" | "execute";

export interface PluginAppActionRegistration {
	id: string;
	title: string;
	summary: string;
	description?: string;
	keywords?: string[];
	effect: PluginAppActionEffect;
	inputSchema: Record<string, unknown>;
	examples: Array<{ description: string; input: unknown }>;
	handlerId: string;
	activationId: string;
	timeoutMs?: number;
}

export interface PluginAppActionInvocationRequest {
	requestId: string;
	pluginId: string;
	actionId: string;
	localActionId: string;
	handlerId: string;
	settings: Record<string, unknown>;
	input: unknown;
}

export interface PluginAppActionCancelRequest {
	requestId: string;
}

export interface PluginHandlerInvocationBase {
	requestId: string;
	pluginId: string;
	handlerId: string;
	settings: Record<string, unknown>;
	session: { id: string; cwd: string; scenario: string };
	model: {
		provider: string;
		id: string;
		api: string;
		input: string[];
		contextWindow?: number;
		maxTokens?: number;
	};
	conversation: {
		messages: Array<{ role: string; text: string; timestamp?: number; toolName?: string }>;
		messageCount: number;
	};
	runtime: { activeToolNames: string[]; availableToolNames: string[]; runIndex: number };
}

export interface PluginAgentToolInvocationRequest extends PluginHandlerInvocationBase {
	toolId: string;
	toolName: string;
	input: unknown;
	trigger: { kind: "tool-call"; timestamp: number; toolCallId: string };
}

export interface PluginContinuationRegistration {
	id: string;
	handlerId: string;
	activationId?: string;
	timeoutMs?: number;
	context?: { conversation?: "summary" | "messages" };
}

export interface PluginContinuationInvocationRequest extends PluginHandlerInvocationBase {
	providerId: string;
	trigger: { kind: "continuation"; timestamp: number };
}

export interface PluginContinuationInvocationResult {
	text: string;
	idempotencyKey?: string;
}

export interface PluginSystemPromptProviderRegistration {
	id: string;
	handlerId: string;
	activationId?: string;
	timeoutMs?: number;
	context?: {
		systemPrompt?: "none" | "blocks" | "rendered" | "full";
		conversation?: "summary" | "messages";
	};
}

export interface SystemPromptBlockInput {
	id: string;
	content: string;
	priority?: number;
	enabled?: boolean;
}

export type PluginDynamicSystemPromptOperation =
	| { type: "addBlock"; block: SystemPromptBlockInput }
	| { type: "replaceBlock"; blockId: string; block: Omit<SystemPromptBlockInput, "id"> }
	| {
			type: "updateBlock";
			blockId: string;
			patch: Partial<Pick<SystemPromptBlockInput, "content" | "priority" | "enabled">>;
	  }
	| { type: "removeBlock"; blockId: string }
	| { type: "setBlockEnabled"; blockId: string; enabled: boolean }
	| { type: "setToolEnabled"; toolName: string; enabled: boolean }
	| { type: "requestContinuation"; result: PluginContinuationInvocationResult };

export interface PluginSystemPromptInvocationRequest extends PluginHandlerInvocationBase {
	providerId: string;
	trigger: { kind: "agent-run"; timestamp: number };
	systemPrompt?: {
		base: { blocks?: SystemPromptBlockView[]; rendered?: string };
		current: { blocks?: SystemPromptBlockView[]; rendered?: string };
	};
}

export interface SystemPromptBlockView extends SystemPromptBlockInput {
	type: string;
	source: { kind: "core" | "plugin"; pluginId?: string };
	priority: number;
	enabled: boolean;
}

export interface PluginHandlerInvocationResult<T> {
	value: T;
	effects: PluginDynamicSystemPromptOperation[];
}

export interface DesktopPluginsApi {
	list(): Promise<InstalledPlugin[]>;
	installFromArchive(archiveBuffer: ArrayBuffer, options?: PluginInstallOptions): Promise<InstalledPlugin>;
	installFromUrl(url: string, options?: PluginInstallOptions): Promise<InstalledPlugin>;
	/** Install from a local zip absolute path (ADR-0042). */
	installFromPath(path: string, options?: PluginInstallOptions): Promise<InstalledPlugin>;
	uninstall(id: string): Promise<void>;
	setEnabled(id: string, enabled: boolean): Promise<void>;
	grantPermissions(id: string, permissions: PluginPermission[]): Promise<InstalledPlugin>;
	revokePermissions(id: string, permissions: PluginPermission[]): Promise<InstalledPlugin>;
	/** Enable declared command names for a plugin (intersected with declaredCommands). */
	grantCommands(id: string, names: string[]): Promise<InstalledPlugin>;
	/** Disable declared command names for a plugin. */
	revokeCommands(id: string, names: string[]): Promise<InstalledPlugin>;
	/** Run an allowed command for a plugin via the main process (execFile, no shell). */
	runCommand(
		pluginId: string,
		file: string,
		args?: string[],
		options?: PluginCommandRunOptions,
	): Promise<PluginCommandRunResult>;
	reload(id: string): Promise<InstalledPlugin>;
	/**
	 * 开启 dev 热更新：把插件 dev 链接到 projectDir（资源改从工程 dist 加载），
	 * 宿主常驻 `vite build --watch` 并监听 dist，产物变化自动重载。要求插件已安装过一次。
	 */
	startDevWatch(id: string, projectDir: string): Promise<InstalledPlugin>;
	/** 关闭 dev 热更新：停掉 vite watch 与文件监听，资源回落已安装目录。 */
	stopDevWatch(id: string): Promise<void>;
	/**
	 * Mark a plugin as contribution-mode-gated (ADR-0041). Until
	 * {@link setContributionMode} enables it, agent contributions are stripped.
	 */
	registerModeGate(pluginId: string): Promise<void>;
	/** Enable/disable a mode-gated plugin's agent contributions (ADR-0041). */
	setContributionMode(pluginId: string, active: boolean): Promise<void>;
	beginAgentContributionsLoad(pluginId: string, activationId: string): Promise<void>;
	registerAgentTool(pluginId: string, registration: PluginAgentToolRegistration): Promise<void>;
	unregisterAgentTool(pluginId: string, toolId: string, activationId?: string): Promise<void>;
	clearAgentContributions(pluginId: string, activationId?: string): Promise<void>;
	onAgentToolRequest(handler: (request: PluginAgentToolInvocationRequest) => void): () => void;
	respondAgentTool(requestId: string, result: unknown): Promise<void>;
	registerAppAction(pluginId: string, registration: PluginAppActionRegistration): Promise<void>;
	unregisterAppAction(pluginId: string, actionId: string, activationId?: string): Promise<void>;
	onAppActionRequest(handler: (request: PluginAppActionInvocationRequest) => void): () => void;
	onAppActionCancel(handler: (request: PluginAppActionCancelRequest) => void): () => void;
	respondAppAction(requestId: string, result: unknown): Promise<void>;
	registerContinuationProvider(pluginId: string, registration: PluginContinuationRegistration): Promise<void>;
	unregisterContinuationProvider(pluginId: string, providerId: string, activationId?: string): Promise<void>;
	onContinuationRequest(handler: (request: PluginContinuationInvocationRequest) => void): () => void;
	respondContinuation(
		requestId: string,
		result:
			| PluginHandlerInvocationResult<PluginContinuationInvocationResult | null>
			| {
					error: string;
			  },
	): Promise<void>;
	registerSystemPromptProvider(pluginId: string, registration: PluginSystemPromptProviderRegistration): Promise<void>;
	unregisterSystemPromptProvider(pluginId: string, providerId: string, activationId?: string): Promise<void>;
	onSystemPromptRequest(handler: (request: PluginSystemPromptInvocationRequest) => void): () => void;
	respondSystemPrompt(
		requestId: string,
		result: PluginHandlerInvocationResult<PluginDynamicSystemPromptOperation[]> | { error: string },
	): Promise<void>;
	/** Effective setting values for a plugin (schema defaults merged with stored). */
	getSettings(id: string): Promise<Record<string, unknown>>;
	/** Persist setting values for a plugin (merged over existing). */
	setSettings(id: string, values: Record<string, unknown>): Promise<void>;
	/** Subscribe to setting changes for any plugin. Returns an unsubscribe fn. */
	onSettingsChanged(listener: (payload: { pluginId: string; values: Record<string, unknown> }) => void): () => void;
	/** Fired when plugins are installed/uninstalled/enabled/reloaded (host should re-load remotes). */
	onPluginsChanged(listener: () => void): () => void;
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

export interface PluginCommandRunOptions {
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
}

export interface PluginCommandRunResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
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

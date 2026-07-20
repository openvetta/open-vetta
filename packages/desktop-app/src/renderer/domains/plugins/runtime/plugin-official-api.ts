import type { InstalledPlugin } from "@preload/api";
import type {
	PluginOfficialApi,
	PluginOfficialExperimentalSettings,
	PluginOfficialInstalledSkill,
	PluginOfficialKnowledgeProcessingSettings,
	PluginOfficialMcpServerDetail,
	PluginOfficialPluginSummary,
	PluginOfficialProjectEntry,
	PluginOfficialProviderDetail,
	PluginOfficialProviderUpsertData,
	PluginOfficialQuickPanelSettings,
	PluginOfficialShortcutBinding,
	PluginOfficialWebhookEndpoint,
} from "@vetta-org/plugin-sdk";
import {
	findShortcutBindingConflict,
	getShortcutActionDef,
	isShortcutActionId,
	isValidShortcutCombo,
	listShortcutBindingsSnapshot,
	normalizeShortcutCombo,
	SHORTCUT_ACTIONS,
	type ShortcutActionId,
	type ShortcutBindings,
} from "../../../../shared/shortcuts";
import {
	getOfficialAppearanceHelp,
	getOfficialAppearanceState,
	listOfficialThemeIds,
	setOfficialAppearance,
	setOfficialLanguage,
} from "./plugin-official-appearance";
import {
	getOfficialNavigationHelp,
	openOfficialHashPath,
	resolveOfficialNavigationOpen,
} from "./plugin-official-navigation";

function normalizeExperimental(
	config: Awaited<ReturnType<typeof window.vetta.config.get>>,
): PluginOfficialExperimentalSettings {
	return {
		vettaCli: config.experimental?.vettaCli !== false,
		promptPrediction: config.experimental?.promptPrediction !== false,
		agentSkills: config.experimental?.agentSkills !== false,
	};
}

function requireWebhookEndpoint(
	result: Awaited<ReturnType<typeof window.vetta.webhook.create>>,
): PluginOfficialWebhookEndpoint {
	if (!result.ok || !result.endpoint) throw new Error(result.error ?? "Webhook operation failed");
	return result.endpoint;
}

function maskSecret(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	if (value.length === 0) return "";
	return "***";
}

function redactRecordSecrets(
	record: Record<string, string> | undefined,
	secretKeys: readonly string[] = ["authorization", "api-key", "apikey", "x-api-key", "token", "secret", "password"],
): Record<string, string> | undefined {
	if (!record) return undefined;
	const next: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		const lower = key.toLowerCase();
		next[key] = secretKeys.some((secretKey) => lower.includes(secretKey)) ? "***" : value;
	}
	return next;
}

function redactProvider(provider: {
	baseUrl?: string;
	apiKey?: string;
	api?: string;
	displayName?: string;
	authHeader?: boolean;
	headers?: Record<string, string>;
	models?: Array<{
		id: string;
		name?: string;
		api?: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}>;
}): PluginOfficialProviderDetail {
	return {
		baseUrl: provider.baseUrl,
		apiKey: maskSecret(provider.apiKey),
		api: provider.api,
		displayName: provider.displayName,
		authHeader: provider.authHeader,
		headers: redactRecordSecrets(provider.headers),
		models: provider.models,
	};
}

function redactMcpServer(name: string, server: Record<string, unknown>): PluginOfficialMcpServerDetail {
	const type = server.type === "http" ? "http" : "stdio";
	if (type === "http") {
		return {
			name,
			type: "http",
			url: typeof server.url === "string" ? server.url : undefined,
			headers: redactRecordSecrets(
				server.headers && typeof server.headers === "object" && !Array.isArray(server.headers)
					? (server.headers as Record<string, string>)
					: undefined,
			),
			disabled: Boolean(server.disabled),
			autoApprove: Array.isArray(server.autoApprove) ? (server.autoApprove as string[]) : undefined,
			startupTimeout: typeof server.startupTimeout === "number" ? server.startupTimeout : undefined,
			debug: typeof server.debug === "boolean" ? server.debug : undefined,
		};
	}
	return {
		name,
		type: "stdio",
		command: typeof server.command === "string" ? server.command : undefined,
		args: Array.isArray(server.args) ? (server.args as string[]) : undefined,
		env: redactRecordSecrets(
			server.env && typeof server.env === "object" && !Array.isArray(server.env)
				? (server.env as Record<string, string>)
				: undefined,
			["token", "key", "secret", "password", "authorization"],
		),
		cwd: typeof server.cwd === "string" ? server.cwd : undefined,
		disabled: Boolean(server.disabled),
		autoApprove: Array.isArray(server.autoApprove) ? (server.autoApprove as string[]) : undefined,
		startupTimeout: typeof server.startupTimeout === "number" ? server.startupTimeout : undefined,
		debug: typeof server.debug === "boolean" ? server.debug : undefined,
	};
}

function snapshotQuickPanel(
	config: Awaited<ReturnType<typeof window.vetta.config.get>>,
): PluginOfficialQuickPanelSettings {
	const trigger =
		config.quickPanel?.trigger === "mod" ||
		config.quickPanel?.trigger === "alt" ||
		config.quickPanel?.trigger === "shift"
			? config.quickPanel.trigger
			: "none";
	const postSendBehavior = config.quickPanel?.postSendBehavior === "background" ? "background" : "foreground";
	return { trigger, postSendBehavior };
}

function readBindings(config: Awaited<ReturnType<typeof window.vetta.config.get>>): ShortcutBindings {
	const raw = config.shortcuts?.bindings ?? {};
	const result: ShortcutBindings = {};
	for (const action of SHORTCUT_ACTIONS) {
		const value = raw[action.id];
		if (typeof value === "string" && value.length > 0) result[action.id] = value;
	}
	return result;
}

function bindingsSnapshot(bindings: ShortcutBindings): PluginOfficialShortcutBinding[] {
	return listShortcutBindingsSnapshot(bindings);
}

function isAbsolutePath(path: string): boolean {
	return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function joinPath(base: string, name: string): string {
	const sep = base.includes("\\") ? "\\" : "/";
	return `${base.replace(/[\\/]+$/, "")}${sep}${name}`;
}

function pathBasename(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const parts = normalized.split(/[\\/]/);
	return parts[parts.length - 1] || path;
}

function samePath(a: string, b: string): boolean {
	const normalize = (value: string) => value.replace(/[\\/]+$/, "").toLowerCase();
	return normalize(a) === normalize(b);
}

function findProject(entries: PluginOfficialProjectEntry[], path: string): PluginOfficialProjectEntry | undefined {
	return entries.find((entry) => samePath(entry.path, path));
}

function summarizePlugin(plugin: {
	id: string;
	name: string;
	version: string;
	enabled: boolean;
	source: string;
	permissions: string[];
	grantedPermissions?: string[];
	description?: string;
	devWatch?: unknown;
}): PluginOfficialPluginSummary {
	return {
		id: plugin.id,
		name: plugin.name,
		version: plugin.version,
		enabled: plugin.enabled,
		source: plugin.source,
		permissions: plugin.grantedPermissions ?? plugin.permissions,
		description: plugin.description,
		devWatch: plugin.devWatch,
	};
}

function knowledgeProcessing(
	config: Awaited<ReturnType<typeof window.vetta.config.get>>,
): PluginOfficialKnowledgeProcessingSettings {
	return { ...(config.knowledgeBase ?? {}) };
}

export function createPluginOfficialApi(plugin: InstalledPlugin): PluginOfficialApi {
	const assertOfficial = (): void => {
		if (plugin.trustLevel !== "official") {
			throw new Error(`Plugin ${plugin.id} is not allowed to use official host capabilities`);
		}
	};

	const assertModelKeyExists = async (modelKey: string, operation = "set-default"): Promise<void> => {
		const slash = modelKey.indexOf("/");
		if (slash <= 0) {
			throw new Error(
				`Refused operation "${operation}": invalid modelKey=${JSON.stringify(modelKey)}. Expected "provider/modelId".`,
			);
		}
		const providerId = modelKey.slice(0, slash);
		const modelId = modelKey.slice(slash + 1);
		const config = await window.vetta.models.get();
		const provider = config.providers[providerId];
		if (!provider) {
			throw new Error(
				`Refused operation "${operation}": model provider ${JSON.stringify(providerId)} not found. Call models.query list.`,
			);
		}
		const models = provider.models ?? [];
		if (models.length > 0 && !models.some((model) => model.id === modelId)) {
			throw new Error(
				`Refused operation "${operation}": model ${JSON.stringify(modelKey)} not found on provider ${JSON.stringify(providerId)}.`,
			);
		}
	};

	return {
		general: {
			getSettings: async () => {
				assertOfficial();
				const config = await window.vetta.config.get();
				return {
					workspacePath: config.workspacePath,
					defaultExecutionMode: config.defaultExecutionMode,
					notificationsEnabled: config.notificationsEnabled !== false,
					debugMode: Boolean(config.debugMode),
					sandbox: config.sandbox ?? config.linuxSandbox,
				};
			},
			setSettings: async (input) => {
				assertOfficial();
				if (input.operation === "set-notifications") {
					if (typeof input.enabled !== "boolean") throw new Error("enabled must be a boolean");
					await window.vetta.config.set({ notificationsEnabled: input.enabled });
					return { operation: input.operation, enabled: input.enabled };
				}
				if (input.operation === "set-execution-mode") {
					if (input.mode !== "sandbox" && input.mode !== "full-access") {
						throw new Error("mode must be sandbox or full-access");
					}
					await window.vetta.config.set({ defaultExecutionMode: input.mode });
					return { operation: input.operation, mode: input.mode };
				}
				if (input.operation === "set-workspace") {
					const path = typeof input.path === "string" ? input.path.trim() : "";
					if (!isAbsolutePath(path)) throw new Error("workspace path must be absolute");
					await window.vetta.config.set({ workspacePath: path });
					return { operation: input.operation, path };
				}
				throw new Error("Unsupported general settings operation");
			},
		},
		agent: {
			getExperimental: async () => {
				assertOfficial();
				return normalizeExperimental(await window.vetta.config.get());
			},
			setExperimental: async (input) => {
				assertOfficial();
				await window.vetta.config.set({ experimental: input });
				return normalizeExperimental(await window.vetta.config.get());
			},
		},
		downloads: {
			list: async () => {
				assertOfficial();
				return window.vetta.downloads.list();
			},
			cancel: async (id) => {
				assertOfficial();
				await window.vetta.downloads.cancel(id);
			},
		},
		updater: {
			getState: async () => {
				assertOfficial();
				return window.vetta.updater.getState();
			},
			getCurrentVersion: async () => {
				assertOfficial();
				return window.vetta.updater.getCurrentVersion();
			},
			check: async () => {
				assertOfficial();
				return window.vetta.updater.check();
			},
			download: async () => {
				assertOfficial();
				return window.vetta.updater.download();
			},
			install: async () => {
				assertOfficial();
				await window.vetta.updater.install();
			},
			dismiss: async () => {
				assertOfficial();
				await window.vetta.updater.dismiss();
			},
			cancel: async () => {
				assertOfficial();
				await window.vetta.updater.cancel();
			},
		},
		webhook: {
			list: async () => {
				assertOfficial();
				return window.vetta.webhook.list();
			},
			listProviders: async () => {
				assertOfficial();
				return window.vetta.webhook.listProviders();
			},
			create: async (input) => {
				assertOfficial();
				return requireWebhookEndpoint(await window.vetta.webhook.create(input));
			},
			update: async (id, input) => {
				assertOfficial();
				return requireWebhookEndpoint(await window.vetta.webhook.update(id, input));
			},
			setEnabled: async (id, enabled) => {
				assertOfficial();
				return requireWebhookEndpoint(await window.vetta.webhook.toggle(id, enabled));
			},
			delete: async (id) => {
				assertOfficial();
				await window.vetta.webhook.delete(id);
			},
			test: async (id) => {
				assertOfficial();
				return window.vetta.webhook.test(id);
			},
			send: async (id, message) => {
				assertOfficial();
				return window.vetta.webhook.send(id, message);
			},
		},
		skills: {
			list: async (cwd) => {
				assertOfficial();
				return window.vetta.skills.list(cwd);
			},
			getManifest: async () => {
				assertOfficial();
				return (await window.vetta.skills.getMarketManifest()) as Record<string, PluginOfficialInstalledSkill>;
			},
			setEnabled: async (name, enabled) => {
				assertOfficial();
				const manifest = await window.vetta.skills.getMarketManifest();
				const entry = manifest[name];
				if (!entry) throw new Error(`Installed skill/scene not found: ${name}`);
				if (Boolean(entry.enabled) !== enabled) {
					await window.vetta.skills.toggle(name);
				}
				return { name, enabled };
			},
			uninstall: async (name, type) => {
				assertOfficial();
				const manifest = await window.vetta.skills.getMarketManifest();
				const entry = manifest[name];
				if (!entry) throw new Error(`Installed skill/scene not found: ${name}`);
				const resolvedType = type ?? (entry.type === "scene" ? "scene" : "skill");
				await window.vetta.skills.uninstall(name, resolvedType);
			},
		},
		shortcuts: {
			listAvailableActions: () => {
				assertOfficial();
				return SHORTCUT_ACTIONS.map((action) => ({
					id: action.id,
					defaultShortcut: action.defaultShortcut,
				}));
			},
			get: async () => {
				assertOfficial();
				const config = await window.vetta.config.get();
				return {
					bindings: bindingsSnapshot(readBindings(config)),
					quickPanel: snapshotQuickPanel(config),
				};
			},
			setBinding: async (id, shortcut) => {
				assertOfficial();
				if (!isShortcutActionId(id)) throw new Error(`Unknown shortcut action id: ${id}`);
				const normalized = normalizeShortcutCombo(shortcut);
				if (!isValidShortcutCombo(normalized)) throw new Error(`Invalid shortcut combo: ${shortcut}`);
				const config = await window.vetta.config.get();
				const current = readBindings(config);
				const conflict = findShortcutBindingConflict(id, normalized, current);
				if (conflict) {
					throw new Error(
						`Shortcut ${JSON.stringify(normalized)} is already bound to ${JSON.stringify(conflict)}.`,
					);
				}
				const next: ShortcutBindings = { ...current };
				const def = getShortcutActionDef(id);
				if (normalized === def.defaultShortcut) delete next[id];
				else next[id] = normalized;
				await window.vetta.config.set({ shortcuts: { bindings: next as Record<string, string> } });
				return { bindings: bindingsSnapshot(next) };
			},
			resetBinding: async (id) => {
				assertOfficial();
				if (!isShortcutActionId(id)) throw new Error(`Unknown shortcut action id: ${id}`);
				const config = await window.vetta.config.get();
				const current = readBindings(config);
				const next: ShortcutBindings = { ...current };
				delete next[id as ShortcutActionId];
				await window.vetta.config.set({ shortcuts: { bindings: next as Record<string, string> } });
				return {
					bindings: bindingsSnapshot(next),
					shortcut: getShortcutActionDef(id).defaultShortcut,
				};
			},
			resetAllBindings: async () => {
				assertOfficial();
				await window.vetta.config.set({ shortcuts: { bindings: {} } });
				return { bindings: bindingsSnapshot({}) };
			},
			setQuickPanelTrigger: async (trigger) => {
				assertOfficial();
				const config = await window.vetta.config.get();
				const current = snapshotQuickPanel(config);
				await window.vetta.config.set({
					quickPanel: { trigger, postSendBehavior: current.postSendBehavior },
				});
				await window.vetta.quickPanel.reloadHotkey();
				return snapshotQuickPanel(await window.vetta.config.get());
			},
			setQuickPanelBehavior: async (behavior) => {
				assertOfficial();
				const config = await window.vetta.config.get();
				const current = snapshotQuickPanel(config);
				await window.vetta.config.set({
					quickPanel: { trigger: current.trigger, postSendBehavior: behavior },
				});
				await window.vetta.quickPanel.reloadHotkey();
				return snapshotQuickPanel(await window.vetta.config.get());
			},
		},
		im: {
			getStatus: async () => {
				assertOfficial();
				const [config, runtime] = await Promise.all([window.vetta.im.getConfig(), window.vetta.im.getStatus()]);
				return {
					enabled: config.enabled,
					transport: config.transport,
					agentModel: config.agentModel ?? null,
					wechatBound: config.wechat.bound,
					feishuAppId: config.feishu.appId || null,
					runtime,
				};
			},
			getLogs: async (limit = 50) => {
				assertOfficial();
				const logs = await window.vetta.im.getRecentLogs();
				return logs.slice(-limit).map((log) => ({
					level: log.level,
					msg: log.msg,
					time: log.time,
					fields: log.fields,
				}));
			},
			setEnabled: async (enabled) => {
				assertOfficial();
				const result = await window.vetta.im.setConfig({ enabled });
				if (!result.ok) throw new Error(result.error ?? "Failed to update IM config");
				return { status: await window.vetta.im.getStatus() };
			},
			restart: async () => {
				assertOfficial();
				await window.vetta.im.restart();
				return { status: await window.vetta.im.getStatus() };
			},
			setAgentModel: async (modelKey, reasoningLevel) => {
				assertOfficial();
				const config = await window.vetta.im.getConfig();
				const agentModel =
					modelKey === null
						? null
						: (() => {
								const slash = modelKey.indexOf("/");
								return {
									provider: modelKey.slice(0, slash),
									model: modelKey.slice(slash + 1),
									...(reasoningLevel ? { reasoningLevel } : {}),
								};
							})();
				const result = await window.vetta.im.setConfig({
					enabled: config.enabled,
					agentModel,
				});
				if (!result.ok) throw new Error(result.error ?? "Failed to set IM agent model");
				return { status: await window.vetta.im.getStatus() };
			},
			assertModelKeyExists: async (modelKey) => {
				assertOfficial();
				await assertModelKeyExists(modelKey, "set-agent-model");
			},
		},
		mcp: {
			list: async () => {
				assertOfficial();
				const config = await window.vetta.mcp.get();
				return Object.entries(config.mcpServers).map(([name, server]) => ({
					name,
					type: server.type === "http" ? ("http" as const) : ("stdio" as const),
					disabled: Boolean(server.disabled),
					command: server.type === "http" ? undefined : server.command,
					url: server.type === "http" ? server.url : undefined,
				}));
			},
			get: async (name) => {
				assertOfficial();
				const config = await window.vetta.mcp.get();
				const server = config.mcpServers[name];
				if (!server) throw new Error(`MCP server not found: ${name}`);
				return redactMcpServer(name, server as unknown as Record<string, unknown>);
			},
			listNames: async () => {
				assertOfficial();
				const config = await window.vetta.mcp.get();
				return Object.keys(config.mcpServers);
			},
			upsert: async (name, data) => {
				assertOfficial();
				const config = await window.vetta.mcp.get();
				const existing = config.mcpServers[name] as unknown as Record<string, unknown> | undefined;
				let next: Record<string, unknown>;
				if (data.type === "http") {
					const prev = existing?.type === "http" ? existing : {};
					next = {
						...prev,
						...data,
						type: "http",
						url: data.url ?? (existing?.type === "http" ? existing.url : undefined),
					};
					if (!next.url) throw new Error("HTTP MCP server requires url.");
				} else {
					const prev = existing && existing.type !== "http" ? existing : {};
					next = {
						...prev,
						...data,
						type: data.type,
						command: data.command ?? (typeof prev.command === "string" ? prev.command : undefined),
					};
					if (!next.command) throw new Error("stdio MCP server requires command.");
				}
				config.mcpServers[name] = next as unknown as (typeof config.mcpServers)[string];
				await window.vetta.mcp.set(config);
				return redactMcpServer(name, next);
			},
			setEnabled: async (name, enabled) => {
				assertOfficial();
				const config = await window.vetta.mcp.get();
				const existing = config.mcpServers[name];
				if (!existing) throw new Error(`MCP server not found: ${name}`);
				existing.disabled = !enabled;
				config.mcpServers[name] = existing;
				await window.vetta.mcp.set(config);
			},
			remove: async (name) => {
				assertOfficial();
				const config = await window.vetta.mcp.get();
				if (!config.mcpServers[name]) throw new Error(`MCP server not found: ${name}`);
				delete config.mcpServers[name];
				await window.vetta.mcp.set(config);
			},
		},
		models: {
			list: async () => {
				assertOfficial();
				const config = await window.vetta.models.get();
				return {
					defaultModel: config.defaultModel ?? null,
					providers: Object.entries(config.providers ?? {}).map(([id, provider]) => ({
						id,
						displayName: provider.displayName ?? id,
						baseUrl: provider.baseUrl,
						api: provider.api,
						hasApiKey: Boolean(provider.apiKey),
						modelCount: provider.models?.length ?? 0,
						models: (provider.models ?? []).map((model) => ({
							id: model.id,
							name: model.name,
							api: model.api,
							reasoning: model.reasoning,
						})),
					})),
				};
			},
			get: async (provider) => {
				assertOfficial();
				const config = await window.vetta.models.get();
				if (provider) {
					const item = config.providers[provider];
					if (!item) throw new Error(`Provider not found: ${provider}`);
					return { provider, ...redactProvider(item) };
				}
				const providers: Record<string, PluginOfficialProviderDetail> = {};
				for (const [key, value] of Object.entries(config.providers ?? {})) {
					providers[key] = redactProvider(value);
				}
				return { ...config, providers };
			},
			probe: async (provider, model) => {
				assertOfficial();
				return window.vetta.models.probe({ provider, model });
			},
			listProviderIds: async () => {
				assertOfficial();
				const config = await window.vetta.models.get();
				return Object.keys(config.providers ?? {});
			},
			assertModelKeyExists: async (modelKey, operation) => {
				assertOfficial();
				await assertModelKeyExists(modelKey, operation);
			},
			setDefault: async (modelKey) => {
				assertOfficial();
				await assertModelKeyExists(modelKey, "set-default");
				const config = await window.vetta.models.get();
				config.defaultModel = modelKey;
				await window.vetta.models.set(config);
				return { defaultModel: modelKey };
			},
			upsertProvider: async (provider, data: PluginOfficialProviderUpsertData) => {
				assertOfficial();
				const config = await window.vetta.models.get();
				const existing = config.providers[provider] ?? {};
				const next = { ...existing };
				if (data.baseUrl !== undefined) next.baseUrl = data.baseUrl;
				if (data.apiKey !== undefined) next.apiKey = data.apiKey;
				if (data.api !== undefined) next.api = data.api;
				if (data.displayName !== undefined) next.displayName = data.displayName;
				if (data.authHeader !== undefined) next.authHeader = data.authHeader;
				if (data.headers !== undefined) next.headers = data.headers;
				if (data.models !== undefined) next.models = data.models;
				config.providers[provider] = next;
				await window.vetta.models.set(config);
				return redactProvider(next);
			},
			removeProvider: async (provider) => {
				assertOfficial();
				const config = await window.vetta.models.get();
				if (!config.providers[provider]) throw new Error(`Provider not found: ${provider}`);
				delete config.providers[provider];
				if (config.defaultModel?.startsWith(`${provider}/`)) delete config.defaultModel;
				await window.vetta.models.set(config);
			},
		},
		projects: {
			list: async () => {
				assertOfficial();
				const config = await window.vetta.config.get();
				return {
					workspacePath: config.workspacePath,
					projects: config.projects,
					archivedProjects: config.archivedProjects,
				};
			},
			listSessions: async (cwd) => {
				assertOfficial();
				return window.vetta.session.listSessions(cwd);
			},
			listRuntimeProjects: async () => {
				assertOfficial();
				return window.vetta.session.listProjects();
			},
			create: async (name, path) => {
				assertOfficial();
				const trimmed = name.trim();
				if (trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
					throw new Error("Invalid project name.");
				}
				const config = await window.vetta.config.get();
				const projectPath = path?.trim() ? path.trim() : joinPath(config.workspacePath, trimmed);
				if (!isAbsolutePath(projectPath)) throw new Error("Project path must be absolute.");
				await window.vetta.fs.createDirectory(projectPath);
				const projects = [...config.projects];
				const archived = [...(config.archivedProjects ?? [])];
				if (!findProject(projects, projectPath) && !findProject(archived, projectPath)) {
					projects.push({ path: projectPath, name: trimmed });
					await window.vetta.config.set({ projects });
				}
				return { path: projectPath, name: trimmed };
			},
			open: async (path, name) => {
				assertOfficial();
				if (!isAbsolutePath(path)) throw new Error("Project path must be absolute.");
				const config = await window.vetta.config.get();
				const projects = [...config.projects];
				const archived = (config.archivedProjects ?? []).filter((entry) => !samePath(entry.path, path));
				const entry = { path, name: name?.trim() || pathBasename(path) };
				if (!findProject(projects, path)) projects.push(entry);
				await window.vetta.config.set({ projects, archivedProjects: archived });
				return entry;
			},
			rename: async (path, name) => {
				assertOfficial();
				const config = await window.vetta.config.get();
				const projects = [...config.projects];
				const archived = [...(config.archivedProjects ?? [])];
				const entry = findProject(projects, path) ?? findProject(archived, path);
				if (!entry) throw new Error(`Project not found: ${path}`);
				entry.name = name;
				await window.vetta.config.set({ projects, archivedProjects: archived });
				return entry;
			},
			archive: async (path) => {
				assertOfficial();
				const config = await window.vetta.config.get();
				const entry = findProject(config.projects, path);
				if (!entry) throw new Error(`Active project not found: ${path}`);
				const projects = config.projects.filter((item) => !samePath(item.path, path));
				const archived = [...(config.archivedProjects ?? [])];
				if (!findProject(archived, path)) archived.push(entry);
				await window.vetta.config.set({ projects, archivedProjects: archived });
			},
			unarchive: async (path) => {
				assertOfficial();
				const config = await window.vetta.config.get();
				const entry = findProject(config.archivedProjects ?? [], path);
				if (!entry) throw new Error(`Archived project not found: ${path}`);
				const archived = (config.archivedProjects ?? []).filter((item) => !samePath(item.path, path));
				const projects = [...config.projects];
				if (!findProject(projects, path)) projects.push(entry);
				await window.vetta.config.set({ projects, archivedProjects: archived });
			},
			remove: async (path) => {
				assertOfficial();
				const config = await window.vetta.config.get();
				const projects = config.projects.filter((item) => !samePath(item.path, path));
				const archived = (config.archivedProjects ?? []).filter((item) => !samePath(item.path, path));
				if (
					projects.length === config.projects.length &&
					archived.length === (config.archivedProjects ?? []).length
				) {
					throw new Error(`Project not found: ${path}`);
				}
				await window.vetta.config.set({ projects, archivedProjects: archived });
			},
		},
		plugins: {
			list: async () => {
				assertOfficial();
				return (await window.vetta.plugins.list()).map(summarizePlugin);
			},
			get: async (id) => {
				assertOfficial();
				const pluginItem = (await window.vetta.plugins.list()).find((item) => item.id === id);
				if (!pluginItem) throw new Error(`Plugin not found: ${id}`);
				return summarizePlugin(pluginItem);
			},
			setEnabled: async (id, enabled) => {
				assertOfficial();
				await window.vetta.plugins.setEnabled(id, enabled);
				const pluginItem = (await window.vetta.plugins.list()).find((item) => item.id === id);
				if (!pluginItem) throw new Error(`Plugin not found: ${id}`);
				return summarizePlugin(pluginItem);
			},
			installFromUrl: async (url) => {
				assertOfficial();
				const installed = await window.vetta.plugins.installFromUrl(url);
				return summarizePlugin(installed);
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
		},
		knowledge: {
			list: async () => {
				assertOfficial();
				return window.vetta.knowledge.list();
			},
			fileStatuses: async () => {
				assertOfficial();
				return window.vetta.knowledge.fileStatuses();
			},
			isProcessing: async () => {
				assertOfficial();
				return window.vetta.knowledge.isProcessing();
			},
			getProcessing: async () => {
				assertOfficial();
				return knowledgeProcessing(await window.vetta.config.get());
			},
			create: async (name) => {
				assertOfficial();
				await window.vetta.knowledge.create(name);
			},
			rename: async (name, newName) => {
				assertOfficial();
				await window.vetta.knowledge.rename(name, newName);
			},
			delete: async (name) => {
				assertOfficial();
				await window.vetta.knowledge.delete(name);
			},
			addFiles: async (kbId, paths, move = false) => {
				assertOfficial();
				await window.vetta.knowledge.addFiles(kbId, paths, move);
			},
			deleteEntry: async (kbId, relPath) => {
				assertOfficial();
				await window.vetta.knowledge.deleteEntry(kbId, relPath);
			},
			scanNow: async () => {
				assertOfficial();
				return window.vetta.knowledge.scanNow();
			},
			retryFailed: async () => {
				assertOfficial();
				return window.vetta.knowledge.retryFailed();
			},
			setProcessing: async (data) => {
				assertOfficial();
				const config = await window.vetta.config.get();
				const kb = { ...config.knowledgeBase };
				if (data.enabled !== undefined) kb.enabled = data.enabled;
				if (data.pollIntervalMinutes !== undefined) kb.pollIntervalMinutes = data.pollIntervalMinutes;
				if (data.processingModelKey === null) delete kb.processingModelKey;
				else if (data.processingModelKey !== undefined) kb.processingModelKey = data.processingModelKey;
				if (data.processingModelReasoningLevel === null) delete kb.processingModelReasoningLevel;
				else if (data.processingModelReasoningLevel !== undefined) {
					kb.processingModelReasoningLevel = data.processingModelReasoningLevel;
				}
				if (data.agentConcurrency !== undefined) kb.agentConcurrency = data.agentConcurrency;
				if (data.ocrConcurrency !== undefined) kb.ocrConcurrency = data.ocrConcurrency;
				await window.vetta.config.set({ knowledgeBase: kb });
				await window.vetta.knowledge.reload();
				return knowledgeProcessing(await window.vetta.config.get());
			},
		},
		batchTasks: {
			listProjects: async () => {
				assertOfficial();
				return window.vetta.batchTasks.getProjects();
			},
			getProject: async (projectId) => {
				assertOfficial();
				const projects = await window.vetta.batchTasks.getProjects();
				const project = projects.find((item) => item.id === projectId);
				if (!project) throw new Error(`Batch project not found: ${projectId}`);
				return project;
			},
			listProjectIds: async () => {
				assertOfficial();
				return (await window.vetta.batchTasks.getProjects()).map((item) => item.id);
			},
			createProject: async (data) => {
				assertOfficial();
				return window.vetta.batchTasks.createProject(data as never);
			},
			updateProject: async (projectId, data) => {
				assertOfficial();
				await window.vetta.batchTasks.updateProject(projectId, data as never);
				const projects = await window.vetta.batchTasks.getProjects();
				const project = projects.find((item) => item.id === projectId);
				if (!project) throw new Error(`Batch project not found: ${projectId}`);
				return project;
			},
			deleteProject: async (projectId) => {
				assertOfficial();
				await window.vetta.batchTasks.deleteProject(projectId);
				return { projectId, operation: "delete" };
			},
			runTask: async (projectId, taskId) => {
				assertOfficial();
				await window.vetta.batchTasks.runTask(projectId, taskId);
				return { projectId, taskId, operation: "run" };
			},
			retryTask: async (projectId, taskId) => {
				assertOfficial();
				await window.vetta.batchTasks.retryTask(projectId, taskId);
				return { projectId, taskId, operation: "retry" };
			},
			stopTask: async (projectId, taskId) => {
				assertOfficial();
				await window.vetta.batchTasks.stopTask(projectId, taskId);
				return { projectId, taskId, operation: "stop" };
			},
			deleteTask: async (projectId, taskId) => {
				assertOfficial();
				await window.vetta.batchTasks.deleteTask(projectId, taskId);
				return { projectId, taskId, operation: "delete" };
			},
			resumeTask: async (projectId, taskId) => {
				assertOfficial();
				await window.vetta.batchTasks.resumeTask(projectId, taskId);
				return { projectId, taskId, operation: "resume" };
			},
			resumeTaskWithText: async (projectId, taskId, text) => {
				assertOfficial();
				await window.vetta.batchTasks.resumeTaskWithText(projectId, taskId, text);
				return { projectId, taskId, operation: "resume-with-text" };
			},
			deleteTaskSession: async (projectId, taskId) => {
				assertOfficial();
				const projects = await window.vetta.batchTasks.getProjects();
				const project = projects.find((item) => item.id === projectId);
				if (!project) throw new Error(`Batch project not found: ${projectId}`);
				const task = project.tasks.find((item) => item.id === taskId);
				if (!task) throw new Error(`Batch task not found: ${taskId}`);
				if (!task.sessionPath) return { projectId, taskId, operation: "delete-session", status: "noop" };
				await window.vetta.batchTasks.deleteSession(task.sessionPath);
				return { projectId, taskId, operation: "delete-session" };
			},
			batchDelete: async (projectId) => {
				assertOfficial();
				await window.vetta.batchTasks.batchDelete(projectId);
				return { projectId, operation: "delete-all" };
			},
			batchStart: async (projectId) => {
				assertOfficial();
				await window.vetta.batchTasks.batchStart(projectId);
				return { projectId, operation: "start" };
			},
			batchStop: async (projectId) => {
				assertOfficial();
				await window.vetta.batchTasks.batchStop(projectId);
				return { projectId, operation: "stop" };
			},
			batchReset: async (projectId) => {
				assertOfficial();
				await window.vetta.batchTasks.batchReset(projectId);
				return { projectId, operation: "reset" };
			},
			batchResetFailed: async (projectId, taskIds) => {
				assertOfficial();
				await window.vetta.batchTasks.batchResetFailed(projectId, taskIds);
				return { projectId, taskIds, operation: "reset-failed" };
			},
		},
		scheduler: {
			listTasks: async () => {
				assertOfficial();
				return window.vetta.scheduler.getTasks();
			},
			getTask: async (taskId) => {
				assertOfficial();
				const tasks = await window.vetta.scheduler.getTasks();
				const task = tasks.find((item) => item.id === taskId);
				if (!task) throw new Error(`Scheduled task not found: ${taskId}`);
				return task;
			},
			listTaskIds: async () => {
				assertOfficial();
				return (await window.vetta.scheduler.getTasks()).map((item) => item.id);
			},
			getHistory: async (taskId) => {
				assertOfficial();
				return window.vetta.scheduler.getRecords(taskId);
			},
			createTask: async (data) => {
				assertOfficial();
				return window.vetta.scheduler.createTask(data as never);
			},
			updateTask: async (taskId, data) => {
				assertOfficial();
				const patch = { ...data } as Record<string, unknown>;
				if ("modelKey" in patch && patch.modelKey === null) patch.modelKey = undefined;
				if ("skill" in patch && patch.skill === null) patch.skill = undefined;
				await window.vetta.scheduler.updateTask(taskId, patch as never);
				const tasks = await window.vetta.scheduler.getTasks();
				const task = tasks.find((item) => item.id === taskId);
				if (!task) throw new Error(`Scheduled task not found: ${taskId}`);
				return task;
			},
			deleteTask: async (taskId) => {
				assertOfficial();
				await window.vetta.scheduler.deleteTask(taskId);
				return { taskId, operation: "delete" };
			},
			setEnabled: async (taskId, enabled) => {
				assertOfficial();
				if (enabled) {
					await window.vetta.scheduler.updateTask(taskId, { enabled: true });
				} else {
					await window.vetta.scheduler.disableTask(taskId);
				}
				const tasks = await window.vetta.scheduler.getTasks();
				const task = tasks.find((item) => item.id === taskId);
				if (!task) throw new Error(`Scheduled task not found: ${taskId}`);
				return task;
			},
			runNow: async (taskId) => {
				assertOfficial();
				await window.vetta.scheduler.runTaskNow(taskId);
				return { taskId, operation: "run-now" };
			},
			abort: async (taskId) => {
				assertOfficial();
				await window.vetta.scheduler.abortTask(taskId);
				return { taskId, operation: "abort" };
			},
		},
		appearance: {
			help: async () => {
				assertOfficial();
				return getOfficialAppearanceHelp();
			},
			get: async () => {
				assertOfficial();
				return getOfficialAppearanceState();
			},
			set: async (input) => {
				assertOfficial();
				return setOfficialAppearance(input);
			},
			setLanguage: async (language) => {
				assertOfficial();
				return setOfficialLanguage(language);
			},
			listThemeIds: () => {
				assertOfficial();
				return listOfficialThemeIds();
			},
		},
		navigation: {
			help: () => {
				assertOfficial();
				return getOfficialNavigationHelp();
			},
			resolveOpen: (input) => {
				assertOfficial();
				return resolveOfficialNavigationOpen(input);
			},
			open: async (input) => {
				assertOfficial();
				const target = resolveOfficialNavigationOpen(input);
				openOfficialHashPath(target.hashPath);
				return { type: "open", resolved: target.resolved };
			},
		},
	};
}

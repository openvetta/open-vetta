import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import type {
	AgentPluginContinuationContribution,
	AgentPluginRuntimeConfig,
	AgentPluginToolContribution,
	SystemPromptBlock,
} from "@vetta/runtime-core";
import AdmZip from "adm-zip";
import { app } from "electron";
import type {
	InstalledPlugin,
	PluginAgentManifest,
	PluginInstallOptions,
	PluginManifest,
	PluginPermission,
	PluginSettingSchema,
} from "../../preload/api-types/plugins.js";
import { getAppLogger } from "../logger.js";

const PLUGIN_API_VERSION = "1.0.0";
const pluginsBaseDir = join(homedir(), ".vetta", "plugins");
const manifestPath = join(homedir(), ".vetta", "plugins-manifest.json");
const tmpBaseDir = join(homedir(), ".vetta", "tmp", "plugins");
// 系统插件的用户态偏好（目前仅停用开关），与用户插件注册表分离（ADR-0024）。
const systemPrefsPath = join(homedir(), ".vetta", "system-plugin-prefs.json");

type PluginManifestFile = Record<string, InstalledPlugin>;
type SystemPluginPrefs = Record<string, { enabled: boolean; disabledCommands?: string[] }>;
type RegisteredAgentTool = Omit<AgentPluginToolContribution, "pluginId"> & { activationId?: string };
type RegisteredContinuationProvider = Omit<AgentPluginContinuationContribution, "pluginId"> & {
	activationId?: string;
};

const pluginLog = getAppLogger("plugin");
const dynamicAgentTools = new Map<string, Map<string, RegisteredAgentTool>>();
const dynamicContinuationProviders = new Map<string, Map<string, RegisteredContinuationProvider>>();
const dynamicAgentActivations = new Map<string, string>();

function debugPluginAgent(message: string, data?: Record<string, unknown>): void {
	pluginLog.debug(message, data ?? {});
}

function summarizeRuntimeConfig(config: AgentPluginRuntimeConfig | undefined): Record<string, unknown> {
	return {
		systemPromptPlugins: config?.systemPromptContributions?.map((item) => item.pluginId) ?? [],
		skillPlugins: config?.skillPathContributions?.map((item) => item.pluginId) ?? [],
		toolPolicyPlugins: config?.toolPolicyContributions?.map((item) => item.pluginId) ?? [],
		toolContributions: config?.toolContributions?.map((tool) => `${tool.pluginId}:${tool.name}`) ?? [],
		continuationContributions:
			config?.continuationContributions?.map((provider) => `${provider.pluginId}:${provider.id}`) ?? [],
	};
}

export function summarizeAgentPluginRuntimeConfig(
	config: AgentPluginRuntimeConfig | undefined,
): Record<string, unknown> {
	return summarizeRuntimeConfig(config);
}

function ensureDir(dir: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readRegistry(): PluginManifestFile {
	if (!existsSync(manifestPath)) return {};
	try {
		const registry = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifestFile;
		for (const plugin of Object.values(registry)) {
			plugin.runtime ??= "esm";
			plugin.permissions ??= [];
			plugin.grantedPermissions ??= [];
			plugin.declaredCommands ??= [];
			plugin.grantedCommandNames ??= [];
			plugin.styleUrls ??= [];
			plugin.activeVersion ??= plugin.version;
		}
		return registry;
	} catch {
		return {};
	}
}

function writeRegistry(registry: PluginManifestFile): void {
	ensureDir(dirname(manifestPath));
	writeFileSync(manifestPath, JSON.stringify(registry, null, 2), "utf-8");
}

function assertString(value: unknown, fieldName: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid plugin ${fieldName}`);
	}
	return value.trim();
}

function assertStringArray(value: unknown, fieldName: string): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
		throw new Error(`Invalid plugin ${fieldName}`);
	}
	return value.map((item) => item.trim());
}

function assertPermissionArray(value: unknown): PluginPermission[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
		throw new Error("Invalid plugin permissions");
	}
	return Array.from(new Set(value.map((item) => item.trim() as PluginPermission)));
}

const SETTING_TYPES = new Set(["string", "number", "boolean", "enum", "secret", "desc"]);

function parseVisibleWhen(raw: unknown, key: string): PluginSettingSchema["visibleWhen"] {
	if (raw === undefined) return undefined;
	if (raw == null || typeof raw !== "object") {
		throw new Error(`Invalid plugin setting visibleWhen for ${key}`);
	}
	const condition = raw as Record<string, unknown>;
	return {
		key: assertString(condition.key, "setting.visibleWhen.key"),
		in: assertStringArray(condition.in, "setting.visibleWhen.in"),
	};
}

function parseSettingsSchema(raw: unknown): PluginSettingSchema[] | undefined {
	if (raw == null || typeof raw !== "object") return undefined;
	const settings = (raw as Record<string, unknown>).settings;
	if (settings === undefined) return undefined;
	if (!Array.isArray(settings)) {
		throw new Error("Invalid plugin contributes.settings");
	}
	const parsed = settings.map((item): PluginSettingSchema => {
		if (item == null || typeof item !== "object") {
			throw new Error("Invalid plugin setting entry");
		}
		const setting = item as Record<string, unknown>;
		const key = assertString(setting.key, "setting.key");
		if (typeof setting.type !== "string" || !SETTING_TYPES.has(setting.type)) {
			throw new Error(`Invalid plugin setting type for ${key}`);
		}
		const def = setting.default;
		if (def !== undefined && typeof def !== "string" && typeof def !== "number" && typeof def !== "boolean") {
			throw new Error(`Invalid plugin setting default for ${key}`);
		}
		// `desc` is text-only: title is optional (the note lives in description).
		const title =
			setting.type === "desc"
				? typeof setting.title === "string"
					? setting.title
					: undefined
				: assertString(setting.title, "setting.title");
		return {
			key,
			type: setting.type as PluginSettingSchema["type"],
			title,
			description: typeof setting.description === "string" ? setting.description : undefined,
			default: def,
			enum: setting.enum === undefined ? undefined : assertStringArray(setting.enum, "setting.enum"),
			visibleWhen: parseVisibleWhen(setting.visibleWhen, key),
		};
	});
	return parsed.length > 0 ? parsed : undefined;
}

function validatePluginId(id: string): void {
	if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
		throw new Error("Plugin id must be 1-64 chars: lowercase letters, numbers, dot, underscore, or dash");
	}
}

/** Command declarations are bare executable names — no path separators, no shell metacharacters. */
function parseCommands(value: unknown): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error("Invalid plugin commands");
	}
	const names = value.map((item) => {
		if (typeof item !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(item)) {
			throw new Error("Invalid plugin command name (must be a bare executable name)");
		}
		return item;
	});
	return Array.from(new Set(names));
}

function validatePluginVersion(version: string): void {
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(version)) {
		throw new Error("Plugin version must be 1-64 chars and cannot contain path separators");
	}
}

function validateRelativePath(value: string, fieldName: string): string {
	const normalized = normalize(value).replace(/\\/g, "/");
	if (normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/") || /^[a-zA-Z]:/.test(value)) {
		throw new Error(`Invalid plugin ${fieldName}`);
	}
	return normalized;
}

function parseManifest(raw: unknown): PluginManifest {
	if (raw == null || typeof raw !== "object") {
		throw new Error("Missing plugin.json");
	}
	const input = raw as Record<string, unknown>;
	const id = assertString(input.id, "id");
	const version = assertString(input.version, "version");
	validatePluginId(id);
	validatePluginVersion(version);
	const entry = validateRelativePath(assertString(input.entry, "entry"), "entry");
	const runtime =
		input.runtime === undefined || input.runtime === "esm" || input.runtime === "module-federation"
			? input.runtime
			: undefined;
	if (input.runtime !== undefined && runtime === undefined) {
		throw new Error("Invalid plugin runtime");
	}
	const moduleFederation =
		runtime === "module-federation" ? parseModuleFederationManifest(input.moduleFederation) : undefined;
	const agent = parseAgentManifest(input.agent);
	const styles = assertStringArray(input.styles, "styles").map((style) => validateRelativePath(style, "styles"));
	const permissions = assertPermissionArray(input.permissions);
	const commands = parseCommands(input.commands);
	const settings = parseSettingsSchema(input.contributes);
	return {
		id,
		name: assertString(input.name, "name"),
		version,
		pluginApiVersion: assertString(input.pluginApiVersion, "pluginApiVersion"),
		entry,
		runtime: runtime ?? "esm",
		moduleFederation,
		agent,
		styles,
		permissions,
		commands: commands.length > 0 ? commands : undefined,
		contributes: settings ? { settings } : undefined,
		description: typeof input.description === "string" ? input.description : undefined,
		author: typeof input.author === "string" ? input.author : undefined,
		guidingWords:
			input.guidingWords === undefined ? undefined : assertStringArray(input.guidingWords, "guidingWords"),
	};
}

function parseModuleFederationManifest(raw: unknown): PluginManifest["moduleFederation"] {
	if (raw == null || typeof raw !== "object") {
		throw new Error("Missing plugin moduleFederation");
	}
	const input = raw as Record<string, unknown>;
	const remoteName = assertString(input.remoteName, "moduleFederation.remoteName");
	if (!/^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/.test(remoteName)) {
		throw new Error("Invalid plugin moduleFederation.remoteName");
	}
	const expose = assertString(input.expose, "moduleFederation.expose");
	if (!expose.startsWith("./") || expose.includes("..") || expose.includes("\\")) {
		throw new Error("Invalid plugin moduleFederation.expose");
	}
	return {
		remoteName,
		expose,
	};
}

function parseToolPolicy(raw: unknown): PluginAgentManifest["toolPolicy"] {
	if (raw === undefined) return undefined;
	if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Invalid plugin agent.toolPolicy");
	}
	const input = raw as Record<string, unknown>;
	return {
		allow: assertStringArray(input.allow, "agent.toolPolicy.allow"),
		deny: assertStringArray(input.deny, "agent.toolPolicy.deny"),
	};
}

function parseAgentManifest(raw: unknown): PluginAgentManifest | undefined {
	if (raw === undefined) return undefined;
	if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Invalid plugin agent");
	}
	const input = raw as Record<string, unknown>;
	const systemPrompt =
		input.systemPrompt === undefined
			? undefined
			: (() => {
					if (
						input.systemPrompt == null ||
						typeof input.systemPrompt !== "object" ||
						Array.isArray(input.systemPrompt)
					) {
						throw new Error("Invalid plugin agent.systemPrompt");
					}
					const promptInput = input.systemPrompt as Record<string, unknown>;
					return {
						promptPaths: assertStringArray(promptInput.promptPaths, "agent.systemPrompt.promptPaths").map(
							(path) => validateRelativePath(path, "agent.systemPrompt.promptPaths"),
						),
					};
				})();
	return {
		systemPrompt,
		skillPaths: assertStringArray(input.skillPaths, "agent.skillPaths").map((path) =>
			validateRelativePath(path, "agent.skillPaths"),
		),
		toolPolicy: parseToolPolicy(input.toolPolicy),
	};
}

function supportsPluginApi(range: string): boolean {
	if (range === PLUGIN_API_VERSION) return true;
	if (range === "^1.0.0" || range === "^1") return true;
	if (range === "1.x" || range === ">=1.0.0") return true;
	return false;
}

function versionedPath(version: string, relativePath: string): string {
	validatePluginVersion(version);
	return `versions/${encodeURIComponent(version)}/${validateRelativePath(relativePath, "path")}`;
}

function toPluginUrl(pluginId: string, version: string, relativePath: string): string {
	const normalized = validateRelativePath(relativePath, "path");
	return `vetta-plugin://${pluginId}/${versionedPath(version, normalized)}?v=${encodeURIComponent(version)}`;
}

function installedFromManifest(
	manifest: PluginManifest,
	options: PluginInstallOptions | undefined,
	previous: InstalledPlugin | undefined,
): InstalledPlugin {
	if (!supportsPluginApi(manifest.pluginApiVersion)) {
		throw new Error(`Unsupported plugin API version: ${manifest.pluginApiVersion}`);
	}
	const now = new Date().toISOString();
	const activeVersion = previous?.activeVersion ?? manifest.version;
	const entryUrl = previous?.entryUrl ?? toPluginUrl(manifest.id, activeVersion, manifest.entry);
	const styleUrls =
		previous?.styleUrls ?? (manifest.styles ?? []).map((style) => toPluginUrl(manifest.id, activeVersion, style));
	const grantedPermissions = Array.from(
		new Set(
			(options?.grantedPermissions ?? previous?.grantedPermissions ?? []).filter((p) =>
				manifest.permissions?.includes(p),
			),
		),
	);
	const declaredCommands = manifest.commands ?? [];
	// Fresh install enables all declared commands by default; the user can toggle
	// any of them off later. A reinstall preserves the prior allow set.
	const grantedCommandNames = Array.from(
		new Set((previous?.grantedCommandNames ?? declaredCommands).filter((name) => declaredCommands.includes(name))),
	);
	return {
		id: manifest.id,
		name: manifest.name,
		version: manifest.version,
		activeVersion,
		pluginApiVersion: manifest.pluginApiVersion,
		runtime: previous?.runtime ?? manifest.runtime ?? "esm",
		entryUrl,
		moduleFederation: previous?.moduleFederation ?? manifest.moduleFederation,
		agent: previous?.agent ?? manifest.agent,
		styleUrls,
		permissions: manifest.permissions ?? [],
		grantedPermissions,
		declaredCommands,
		grantedCommandNames,
		settingsSchema: manifest.contributes?.settings,
		description: manifest.description,
		author: manifest.author,
		guidingWords: manifest.guidingWords,
		enabled: previous?.enabled ?? false,
		installedAt: previous?.installedAt ?? now,
		updatedAt: now,
		source: options?.source ?? "archive",
		availableVersion: previous && previous.version !== manifest.version ? manifest.version : undefined,
		pendingVersion: previous && previous.version !== manifest.version ? manifest.version : undefined,
	};
}

async function extractArchive(buffer: Buffer, targetDir: string): Promise<void> {
	await rm(targetDir, { recursive: true, force: true });
	await mkdir(targetDir, { recursive: true });
	const zip = new AdmZip(buffer);
	zip.extractAllTo(targetDir, true);
}

async function getManifestFromDir(extractDir: string): Promise<{ manifest: PluginManifest; sourceDir: string }> {
	const directManifest = join(extractDir, "plugin.json");
	if (existsSync(directManifest)) {
		return {
			manifest: parseManifest(JSON.parse(readFileSync(directManifest, "utf-8"))),
			sourceDir: extractDir,
		};
	}
	const entries = await readdir(extractDir);
	const directories = entries
		.map((entry) => join(extractDir, entry))
		.filter((entryPath) => statSync(entryPath).isDirectory());
	if (directories.length === 1) {
		const manifestPathInCandidate = join(directories[0], "plugin.json");
		if (existsSync(manifestPathInCandidate)) {
			return {
				manifest: parseManifest(JSON.parse(readFileSync(manifestPathInCandidate, "utf-8"))),
				sourceDir: directories[0],
			};
		}
	}
	throw new Error("plugin.json not found at archive root");
}

async function copyExtractedPlugin(sourceDir: string, pluginId: string, version: string): Promise<void> {
	validatePluginVersion(version);
	const targetDir = join(pluginsBaseDir, pluginId, "versions", version);
	await rm(targetDir, { recursive: true, force: true });
	await mkdir(dirname(targetDir), { recursive: true });
	await cp(sourceDir, targetDir, { recursive: true });
}

// =============================================================================
// 系统插件（ADR-0024）—— 随 App 发布、用户不可删改，源在 packages/plugins/presets
// =============================================================================

/** 系统插件只读根目录：打包后在 Resources，dev 下读取 zip 解压后的 staging。 */
function systemPluginsBaseDir(): string {
	return app.isPackaged
		? join(process.resourcesPath, "system-plugins")
		: join(process.cwd(), ".artifacts", "system-plugins");
}

function readSystemPrefs(): SystemPluginPrefs {
	if (!existsSync(systemPrefsPath)) return {};
	try {
		return JSON.parse(readFileSync(systemPrefsPath, "utf-8")) as SystemPluginPrefs;
	} catch {
		return {};
	}
}

function writeSystemPrefs(prefs: SystemPluginPrefs): void {
	ensureDir(dirname(systemPrefsPath));
	writeFileSync(systemPrefsPath, JSON.stringify(prefs, null, 2), "utf-8");
}

/** 系统插件资源 URL：无 versions/ 段（版本随 App，文件直接在 <base>/<id>/ 下）。 */
function toSystemPluginUrl(pluginId: string, relativePath: string, version: string): string {
	const normalized = validateRelativePath(relativePath, "path");
	const cacheVersion = app.isPackaged ? version : getSystemPluginResourceCacheVersion(pluginId, normalized, version);
	return `vetta-plugin://${pluginId}/${normalized}?v=${encodeURIComponent(cacheVersion)}`;
}

function getSystemPluginResourceCacheVersion(pluginId: string, relativePath: string, version: string): string {
	try {
		const resourcePath = join(systemPluginsBaseDir(), pluginId, relativePath);
		return `${version}-${Math.floor(statSync(resourcePath).mtimeMs)}`;
	} catch {
		return version;
	}
}

function hasGrantedPermission(plugin: InstalledPlugin, permission: PluginPermission): boolean {
	return plugin.permissions.includes(permission) && plugin.grantedPermissions.includes(permission);
}

function pluginResourceRelativePath(plugin: InstalledPlugin, relativePath: string): string {
	return plugin.source === "system" ? relativePath : versionedPath(plugin.activeVersion, relativePath);
}

function resolveInstalledPluginResource(plugin: InstalledPlugin, relativePath: string): string {
	return resolvePluginFilePath(plugin.id, pluginResourceRelativePath(plugin, relativePath));
}

function readPromptBlock(plugin: InstalledPlugin, relativePath: string, index: number): SystemPromptBlock {
	const content = readFileSync(resolveInstalledPluginResource(plugin, relativePath), "utf-8");
	return {
		id: `plugin.${plugin.id}.systemPrompt.${index + 1}`,
		type: "plugin",
		source: { kind: "plugin", pluginId: plugin.id },
		content,
		priority: 850,
		enabled: content.trim().length > 0,
	};
}

export function buildAgentPluginRuntimeConfig(): AgentPluginRuntimeConfig | undefined {
	const enabledPlugins = listPlugins().filter((plugin) => plugin.enabled && plugin.agent);
	const enabledToolPlugins = listPlugins().filter((plugin) => plugin.enabled);
	debugPluginAgent("build runtime config start", {
		agentPlugins: enabledPlugins.map((plugin) => plugin.id),
		enabledPlugins: enabledToolPlugins.map((plugin) => plugin.id),
		dynamicToolPlugins: Array.from(dynamicAgentTools.entries()).map(([pluginId, tools]) => ({
			pluginId,
			tools: Array.from(tools.values()).map((tool) => tool.name),
		})),
	});
	const systemPromptContributions: NonNullable<AgentPluginRuntimeConfig["systemPromptContributions"]> = [];
	const skillPathContributions: NonNullable<AgentPluginRuntimeConfig["skillPathContributions"]> = [];
	const toolPolicyContributions: NonNullable<AgentPluginRuntimeConfig["toolPolicyContributions"]> = [];
	const toolContributions: NonNullable<AgentPluginRuntimeConfig["toolContributions"]> = [];
	const continuationContributions: NonNullable<AgentPluginRuntimeConfig["continuationContributions"]> = [];

	for (const plugin of enabledPlugins) {
		try {
			const agent = plugin.agent;
			if (!agent) continue;
			if (
				agent.systemPrompt?.promptPaths &&
				(hasGrantedPermission(plugin, "agent.systemPrompt.write") ||
					hasGrantedPermission(plugin, "agent.systemPrompt.fullControl"))
			) {
				systemPromptContributions.push({
					pluginId: plugin.id,
					operations: agent.systemPrompt.promptPaths.map((path, index) => ({
						type: "addBlock",
						block: readPromptBlock(plugin, path, index),
					})),
				});
			}
			if (agent.skillPaths && hasGrantedPermission(plugin, "agent.skills.control")) {
				skillPathContributions.push({
					pluginId: plugin.id,
					paths: agent.skillPaths.map((path) => resolveInstalledPluginResource(plugin, path)),
				});
			}
			if (agent.toolPolicy && hasGrantedPermission(plugin, "agent.tools.control")) {
				toolPolicyContributions.push({
					pluginId: plugin.id,
					allow: agent.toolPolicy.allow,
					deny: agent.toolPolicy.deny,
				});
			}
		} catch (error) {
			pluginLog.warn(`Skipping agent contribution for ${plugin.id}:`, error);
		}
	}

	for (const plugin of enabledToolPlugins) {
		if (!hasGrantedPermission(plugin, "agent.tools.register")) {
			debugPluginAgent("skip tool contributions: missing register permission", { pluginId: plugin.id });
			continue;
		}
		if (!hasGrantedPermission(plugin, "agent.toolHandler.execute")) {
			debugPluginAgent("skip tool contributions: missing execute permission", { pluginId: plugin.id });
			continue;
		}
		const registeredTools = dynamicAgentTools.get(plugin.id);
		if (!registeredTools) {
			debugPluginAgent("skip tool contributions: no dynamic tools registered", { pluginId: plugin.id });
			continue;
		}
		for (const tool of registeredTools.values()) {
			const { activationId: _activationId, ...contribution } = tool;
			toolContributions.push({ ...contribution, pluginId: plugin.id });
		}
	}

	for (const plugin of enabledToolPlugins) {
		if (!hasGrantedPermission(plugin, "agent.continuation.register")) continue;
		const registeredProviders = dynamicContinuationProviders.get(plugin.id);
		if (!registeredProviders) continue;
		for (const provider of registeredProviders.values()) {
			const { activationId: _activationId, ...contribution } = provider;
			continuationContributions.push({ ...contribution, pluginId: plugin.id });
		}
	}

	const config: AgentPluginRuntimeConfig = {};
	if (systemPromptContributions.length > 0) config.systemPromptContributions = systemPromptContributions;
	if (skillPathContributions.length > 0) config.skillPathContributions = skillPathContributions;
	if (toolPolicyContributions.length > 0) config.toolPolicyContributions = toolPolicyContributions;
	if (toolContributions.length > 0) config.toolContributions = toolContributions;
	if (continuationContributions.length > 0) config.continuationContributions = continuationContributions;
	const result = Object.keys(config).length > 0 ? config : undefined;
	debugPluginAgent("build runtime config done", summarizeRuntimeConfig(result));
	return result;
}

export function beginDynamicAgentContributionLoad(pluginId: string, activationId: string): void {
	validatePluginId(pluginId);
	const plugin = listPlugins().find((candidate) => candidate.id === pluginId);
	if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
	dynamicAgentActivations.set(pluginId, activationId);
	const previousToolCount = dynamicAgentTools.get(pluginId)?.size ?? 0;
	const previousContinuationCount = dynamicContinuationProviders.get(pluginId)?.size ?? 0;
	dynamicAgentTools.delete(pluginId);
	dynamicContinuationProviders.delete(pluginId);
	debugPluginAgent("dynamic agent contribution activation began", {
		pluginId,
		activationId,
		previousToolCount,
		previousContinuationCount,
	});
}

export function registerDynamicAgentTool(pluginId: string, tool: RegisteredAgentTool): void {
	validatePluginId(pluginId);
	const plugin = listPlugins().find((candidate) => candidate.id === pluginId);
	if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
	if (!hasGrantedPermission(plugin, "agent.tools.register")) {
		throw new Error(`Plugin permission denied: agent.tools.register`);
	}
	const currentActivationId = dynamicAgentActivations.get(pluginId);
	if (tool.activationId && currentActivationId && tool.activationId !== currentActivationId) {
		debugPluginAgent("ignore stale dynamic tool register", {
			pluginId,
			toolId: tool.id,
			toolName: tool.name,
			activationId: tool.activationId,
			currentActivationId,
		});
		return;
	}
	let tools = dynamicAgentTools.get(pluginId);
	if (!tools) {
		tools = new Map();
		dynamicAgentTools.set(pluginId, tools);
	}
	tools.set(tool.id, tool);
	debugPluginAgent("dynamic tool registered", {
		pluginId,
		toolId: tool.id,
		toolName: tool.name,
		handlerId: tool.handlerId,
		activationId: tool.activationId,
		pluginToolCount: tools.size,
	});
}

export function unregisterDynamicAgentTool(pluginId: string, toolId: string, activationId?: string): void {
	validatePluginId(pluginId);
	const currentActivationId = dynamicAgentActivations.get(pluginId);
	if (activationId && currentActivationId && activationId !== currentActivationId) {
		debugPluginAgent("ignore stale dynamic tool unregister", {
			pluginId,
			toolId,
			activationId,
			currentActivationId,
		});
		return;
	}
	const tools = dynamicAgentTools.get(pluginId);
	if (!tools) return;
	const tool = tools.get(toolId);
	if (activationId && tool?.activationId && tool.activationId !== activationId) {
		debugPluginAgent("ignore mismatched dynamic tool unregister", {
			pluginId,
			toolId,
			activationId,
			toolActivationId: tool.activationId,
		});
		return;
	}
	tools.delete(toolId);
	if (tools.size === 0) dynamicAgentTools.delete(pluginId);
	debugPluginAgent("dynamic tool unregistered", {
		pluginId,
		toolId,
		remainingPluginToolCount: dynamicAgentTools.get(pluginId)?.size ?? 0,
	});
}

export function registerDynamicContinuationProvider(pluginId: string, provider: RegisteredContinuationProvider): void {
	validatePluginId(pluginId);
	const plugin = listPlugins().find((candidate) => candidate.id === pluginId);
	if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
	if (!hasGrantedPermission(plugin, "agent.continuation.register")) {
		throw new Error("Plugin permission denied: agent.continuation.register");
	}
	const currentActivationId = dynamicAgentActivations.get(pluginId);
	if (provider.activationId && currentActivationId && provider.activationId !== currentActivationId) return;
	let providers = dynamicContinuationProviders.get(pluginId);
	if (!providers) {
		providers = new Map();
		dynamicContinuationProviders.set(pluginId, providers);
	}
	providers.set(provider.id, provider);
}

export function unregisterDynamicContinuationProvider(
	pluginId: string,
	providerId: string,
	activationId?: string,
): void {
	validatePluginId(pluginId);
	const currentActivationId = dynamicAgentActivations.get(pluginId);
	if (activationId && currentActivationId && activationId !== currentActivationId) return;
	const providers = dynamicContinuationProviders.get(pluginId);
	if (!providers) return;
	const provider = providers.get(providerId);
	if (activationId && provider?.activationId && provider.activationId !== activationId) return;
	providers.delete(providerId);
	if (providers.size === 0) dynamicContinuationProviders.delete(pluginId);
}

export function clearDynamicAgentContributions(pluginId: string, activationId?: string): void {
	validatePluginId(pluginId);
	const currentActivationId = dynamicAgentActivations.get(pluginId);
	if (activationId && currentActivationId && activationId !== currentActivationId) {
		debugPluginAgent("ignore stale dynamic tools clear", {
			pluginId,
			activationId,
			currentActivationId,
		});
		return;
	}
	const previousToolCount = dynamicAgentTools.get(pluginId)?.size ?? 0;
	const previousContinuationCount = dynamicContinuationProviders.get(pluginId)?.size ?? 0;
	dynamicAgentTools.delete(pluginId);
	dynamicContinuationProviders.delete(pluginId);
	if (!activationId || currentActivationId === activationId) {
		dynamicAgentActivations.delete(pluginId);
	}
	debugPluginAgent("dynamic agent contributions cleared", {
		pluginId,
		activationId,
		previousToolCount,
		previousContinuationCount,
	});
}

function systemInstalledFromManifest(
	manifest: PluginManifest,
	enabled: boolean,
	disabledCommands: string[] = [],
): InstalledPlugin {
	const now = new Date().toISOString();
	const declaredCommands = manifest.commands ?? [];
	// System plugins auto-grant declared commands; the user may still disable any
	// of them (persisted in system-plugin-prefs.json, not the user registry).
	const grantedCommandNames = declaredCommands.filter((name) => !disabledCommands.includes(name));
	return {
		id: manifest.id,
		name: manifest.name,
		version: manifest.version,
		activeVersion: manifest.version,
		pluginApiVersion: manifest.pluginApiVersion,
		runtime: manifest.runtime ?? "esm",
		entryUrl: toSystemPluginUrl(manifest.id, manifest.entry, manifest.version),
		moduleFederation: manifest.moduleFederation,
		agent: manifest.agent,
		styleUrls: (manifest.styles ?? []).map((style) => toSystemPluginUrl(manifest.id, style, manifest.version)),
		permissions: manifest.permissions ?? [],
		// 系统插件随包发的可信代码：声明权限全部自动授予，用户不可撤（ADR-0024）。
		grantedPermissions: manifest.permissions ?? [],
		declaredCommands,
		grantedCommandNames,
		settingsSchema: manifest.contributes?.settings,
		description: manifest.description,
		author: manifest.author,
		guidingWords: manifest.guidingWords,
		enabled,
		installedAt: now,
		updatedAt: now,
		source: "system",
	};
}

let systemPluginsCache: InstalledPlugin[] | null = null;
const systemPluginIds = new Set<string>();

/** 扫描系统插件根目录，合成只读记录并缓存 id 集合（供解析器与冲突门控用）。 */
export function discoverSystemPlugins(force = false): InstalledPlugin[] {
	if (systemPluginsCache && !force) return systemPluginsCache;
	const baseDir = systemPluginsBaseDir();
	const result: InstalledPlugin[] = [];
	systemPluginIds.clear();
	if (existsSync(baseDir)) {
		const prefs = readSystemPrefs();
		for (const entry of readdirSync(baseDir)) {
			const dir = join(baseDir, entry);
			try {
				if (!statSync(dir).isDirectory()) continue;
				const manifestFile = join(dir, "plugin.json");
				if (!existsSync(manifestFile)) continue;
				const manifest = parseManifest(JSON.parse(readFileSync(manifestFile, "utf-8")));
				// staging 不完整时跳过并告警，不阻断启动。
				if (!existsSync(join(dir, manifest.entry))) {
					pluginLog.warn(`discover: 跳过 ${manifest.id}：staging 缺少入口 (${manifest.entry})`);
					continue;
				}
				result.push(
					systemInstalledFromManifest(
						manifest,
						prefs[manifest.id]?.enabled ?? true,
						prefs[manifest.id]?.disabledCommands ?? [],
					),
				);
				systemPluginIds.add(manifest.id);
			} catch (err) {
				pluginLog.warn(`discover: 跳过 ${entry}：`, err);
			}
		}
	}
	systemPluginsCache = result;
	return result;
}

export function isSystemPluginId(id: string): boolean {
	if (!systemPluginsCache) discoverSystemPlugins();
	return systemPluginIds.has(id);
}

export function getPluginsBaseDir(): string {
	return pluginsBaseDir;
}

// =============================================================================
// 插件设置（VSCode 式）—— 按 plugin id 命名空间存值，与声明 schema 分离。
// =============================================================================

const pluginSettingsPath = join(homedir(), ".vetta", "plugin-settings.json");
type PluginSettingsStore = Record<string, Record<string, unknown>>;

function readPluginSettingsStore(): PluginSettingsStore {
	if (!existsSync(pluginSettingsPath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(pluginSettingsPath, "utf-8")) as PluginSettingsStore;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function writePluginSettingsStore(store: PluginSettingsStore): void {
	ensureDir(dirname(pluginSettingsPath));
	writeFileSync(pluginSettingsPath, JSON.stringify(store, null, 2), "utf-8");
}

/** Effective values: schema defaults merged with stored values (stored wins). */
export function getPluginSettings(pluginId: string): Record<string, unknown> {
	validatePluginId(pluginId);
	const stored = readPluginSettingsStore()[pluginId] ?? {};
	const schema = listPlugins().find((plugin) => plugin.id === pluginId)?.settingsSchema ?? [];
	const defaults: Record<string, unknown> = {};
	for (const setting of schema) {
		if (setting.default !== undefined) defaults[setting.key] = setting.default;
	}
	return { ...defaults, ...stored };
}

/** Merge values over the stored namespace; returns the new effective values. */
export function setPluginSettings(pluginId: string, values: Record<string, unknown>): Record<string, unknown> {
	validatePluginId(pluginId);
	if (values == null || typeof values !== "object" || Array.isArray(values)) {
		throw new Error("Invalid plugin settings values");
	}
	const store = readPluginSettingsStore();
	store[pluginId] = { ...(store[pluginId] ?? {}), ...values };
	writePluginSettingsStore(store);
	return getPluginSettings(pluginId);
}

export function listPlugins(): InstalledPlugin[] {
	const system = discoverSystemPlugins();
	const reserved = new Set(system.map((plugin) => plugin.id));
	// id 冲突时系统插件遮蔽用户插件（ADR-0024）。
	const userPlugins = Object.values(readRegistry()).filter((plugin) => !reserved.has(plugin.id));
	return [...system, ...userPlugins].sort((a, b) => a.name.localeCompare(b.name));
}

export async function installPluginFromArchive(
	archiveBuffer: ArrayBuffer | Buffer,
	options?: PluginInstallOptions,
): Promise<InstalledPlugin> {
	const buffer = Buffer.isBuffer(archiveBuffer) ? archiveBuffer : Buffer.from(archiveBuffer);
	const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const extractDir = join(tmpBaseDir, `_install_${stamp}`);
	await extractArchive(buffer, extractDir);
	try {
		const { manifest, sourceDir } = await getManifestFromDir(extractDir);
		if (isSystemPluginId(manifest.id)) {
			throw new Error(`Cannot install over a system plugin: ${manifest.id}`);
		}
		const registry = readRegistry();
		const previous = registry[manifest.id];
		await copyExtractedPlugin(sourceDir, manifest.id, manifest.version);
		const installed = installedFromManifest(manifest, options, previous);
		registry[manifest.id] = installed;
		writeRegistry(registry);
		return installed;
	} finally {
		await rm(extractDir, { recursive: true, force: true }).catch(() => {});
	}
}

export async function installPluginFromUrl(url: string, options?: PluginInstallOptions): Promise<InstalledPlugin> {
	const parsed = new URL(url);
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new Error("Plugin URL must use http or https");
	}
	const response = await fetch(parsed);
	if (!response.ok) {
		throw new Error(`Failed to download plugin: ${response.status}`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	return installPluginFromArchive(buffer, { ...options, source: "remote" });
}

export function uninstallPlugin(id: string): void {
	validatePluginId(id);
	if (isSystemPluginId(id)) throw new Error(`Cannot uninstall a system plugin: ${id}`);
	const registry = readRegistry();
	delete registry[id];
	writeRegistry(registry);
	rmSync(join(pluginsBaseDir, id), { recursive: true, force: true });
}

export function setPluginEnabled(id: string, enabled: boolean): InstalledPlugin {
	validatePluginId(id);
	// 系统插件可停用但不可删改：偏好写进独立的 prefs 文件，本体不入注册表（ADR-0024）。
	if (isSystemPluginId(id)) {
		const prefs = readSystemPrefs();
		prefs[id] = { ...prefs[id], enabled };
		writeSystemPrefs(prefs);
		const refreshed = discoverSystemPlugins(true).find((plugin) => plugin.id === id);
		if (!refreshed) throw new Error(`Plugin not found: ${id}`);
		return refreshed;
	}
	const registry = readRegistry();
	const plugin = registry[id];
	if (!plugin) throw new Error(`Plugin not found: ${id}`);
	plugin.enabled = enabled;
	plugin.updatedAt = new Date().toISOString();
	writeRegistry(registry);
	return plugin;
}

export function grantPluginPermissions(id: string, permissions: PluginPermission[]): InstalledPlugin {
	validatePluginId(id);
	if (isSystemPluginId(id)) throw new Error(`System plugin permissions are managed automatically: ${id}`);
	const registry = readRegistry();
	const plugin = registry[id];
	if (!plugin) throw new Error(`Plugin not found: ${id}`);
	const allowed = new Set(plugin.permissions);
	plugin.grantedPermissions = Array.from(
		new Set([...plugin.grantedPermissions, ...permissions.filter((p) => allowed.has(p))]),
	);
	plugin.updatedAt = new Date().toISOString();
	writeRegistry(registry);
	return plugin;
}

export function revokePluginPermissions(id: string, permissions: PluginPermission[]): InstalledPlugin {
	validatePluginId(id);
	if (isSystemPluginId(id)) throw new Error(`System plugin permissions are managed automatically: ${id}`);
	const registry = readRegistry();
	const plugin = registry[id];
	if (!plugin) throw new Error(`Plugin not found: ${id}`);
	const revoked = new Set(permissions);
	plugin.grantedPermissions = plugin.grantedPermissions.filter((permission) => !revoked.has(permission));
	plugin.updatedAt = new Date().toISOString();
	writeRegistry(registry);
	return plugin;
}

/**
 * Enable declared command names. User plugins update the registry's
 * grantedCommandNames; system plugins clear those names from the prefs'
 * disabledCommands list (declared commands are auto-granted).
 */
export function grantPluginCommands(id: string, names: string[]): InstalledPlugin {
	validatePluginId(id);
	const requested = parseCommands(names);
	if (isSystemPluginId(id)) {
		const current = discoverSystemPlugins().find((plugin) => plugin.id === id);
		if (!current) throw new Error(`Plugin not found: ${id}`);
		const declared = new Set(current.declaredCommands);
		const prefs = readSystemPrefs();
		const prev = prefs[id]?.disabledCommands ?? [];
		const next = prev.filter((name) => !requested.includes(name) && declared.has(name));
		prefs[id] = { enabled: prefs[id]?.enabled ?? current.enabled, disabledCommands: next };
		writeSystemPrefs(prefs);
		const refreshed = discoverSystemPlugins(true).find((plugin) => plugin.id === id);
		if (!refreshed) throw new Error(`Plugin not found: ${id}`);
		return refreshed;
	}
	const registry = readRegistry();
	const plugin = registry[id];
	if (!plugin) throw new Error(`Plugin not found: ${id}`);
	const declared = new Set(plugin.declaredCommands);
	plugin.grantedCommandNames = Array.from(
		new Set([...plugin.grantedCommandNames, ...requested.filter((name) => declared.has(name))]),
	);
	plugin.updatedAt = new Date().toISOString();
	writeRegistry(registry);
	return plugin;
}

/** Disable declared command names. Inverse of {@link grantPluginCommands}. */
export function revokePluginCommands(id: string, names: string[]): InstalledPlugin {
	validatePluginId(id);
	const requested = parseCommands(names);
	if (isSystemPluginId(id)) {
		const current = discoverSystemPlugins().find((plugin) => plugin.id === id);
		if (!current) throw new Error(`Plugin not found: ${id}`);
		const declared = new Set(current.declaredCommands);
		const prefs = readSystemPrefs();
		const prev = prefs[id]?.disabledCommands ?? [];
		const next = Array.from(new Set([...prev, ...requested.filter((name) => declared.has(name))]));
		prefs[id] = { enabled: prefs[id]?.enabled ?? current.enabled, disabledCommands: next };
		writeSystemPrefs(prefs);
		const refreshed = discoverSystemPlugins(true).find((plugin) => plugin.id === id);
		if (!refreshed) throw new Error(`Plugin not found: ${id}`);
		return refreshed;
	}
	const registry = readRegistry();
	const plugin = registry[id];
	if (!plugin) throw new Error(`Plugin not found: ${id}`);
	const revoked = new Set(requested);
	plugin.grantedCommandNames = plugin.grantedCommandNames.filter((name) => !revoked.has(name));
	plugin.updatedAt = new Date().toISOString();
	writeRegistry(registry);
	return plugin;
}

export function reloadPlugin(id: string): InstalledPlugin {
	validatePluginId(id);
	// 系统插件版本随 App，无 pending 更新流（ADR-0024）。
	if (isSystemPluginId(id)) {
		const refreshed = discoverSystemPlugins(true).find((plugin) => plugin.id === id);
		if (!refreshed) throw new Error(`Plugin not found: ${id}`);
		return refreshed;
	}
	const registry = readRegistry();
	const plugin = registry[id];
	if (!plugin) throw new Error(`Plugin not found: ${id}`);
	plugin.activeVersion = plugin.pendingVersion ?? plugin.version;
	plugin.pendingVersion = undefined;
	plugin.availableVersion = undefined;
	const manifestFile = join(pluginsBaseDir, plugin.id, "versions", plugin.activeVersion, "plugin.json");
	const manifest = parseManifest(JSON.parse(readFileSync(manifestFile, "utf-8")));
	plugin.runtime = manifest.runtime ?? "esm";
	plugin.entryUrl = toPluginUrl(plugin.id, plugin.activeVersion, manifest.entry);
	plugin.moduleFederation = manifest.moduleFederation;
	plugin.agent = manifest.agent;
	plugin.styleUrls = (manifest.styles ?? []).map((style) => toPluginUrl(plugin.id, plugin.activeVersion, style));
	// 重载到新版本时同步命令声明，并把用户授权裁剪到新声明集合内（避免授权指向已移除的命令、
	// 或新增命令因 declaredCommands 陈旧而永远无法授权）。
	plugin.declaredCommands = manifest.commands ?? [];
	plugin.grantedCommandNames = (plugin.grantedCommandNames ?? []).filter((name) =>
		plugin.declaredCommands.includes(name),
	);
	plugin.updatedAt = new Date().toISOString();
	writeRegistry(registry);
	return plugin;
}

export function resolvePluginFilePath(pluginId: string, relativePath: string): string {
	validatePluginId(pluginId);
	const baseDir = isSystemPluginId(pluginId) ? systemPluginsBaseDir() : pluginsBaseDir;
	const root = resolve(baseDir, pluginId);
	const target = resolve(root, relativePath);
	if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) {
		throw new Error("Plugin file path escapes plugin directory");
	}
	return target;
}

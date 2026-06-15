import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import type { AgentPluginRuntimeConfig, SystemPromptBlock } from "@vetta/runtime-core";
import AdmZip from "adm-zip";
import { app } from "electron";
import type {
	InstalledPlugin,
	PluginAgentManifest,
	PluginInstallOptions,
	PluginManifest,
	PluginPermission,
} from "../../preload/api-types/plugins.js";

const PLUGIN_API_VERSION = "1.0.0";
const pluginsBaseDir = join(homedir(), ".vetta", "plugins");
const manifestPath = join(homedir(), ".vetta", "plugins-manifest.json");
const tmpBaseDir = join(homedir(), ".vetta", "tmp", "plugins");
// 系统插件的用户态偏好（目前仅停用开关），与用户插件注册表分离（ADR-0024）。
const systemPrefsPath = join(homedir(), ".vetta", "system-plugin-prefs.json");

type PluginManifestFile = Record<string, InstalledPlugin>;
type SystemPluginPrefs = Record<string, { enabled: boolean }>;

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

function validatePluginId(id: string): void {
	if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
		throw new Error("Plugin id must be 1-64 chars: lowercase letters, numbers, dot, underscore, or dash");
	}
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
		description: typeof input.description === "string" ? input.description : undefined,
		author: typeof input.author === "string" ? input.author : undefined,
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
		description: manifest.description,
		author: manifest.author,
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
	return `vetta-plugin://${pluginId}/${normalized}?v=${encodeURIComponent(version)}`;
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
	const systemPromptContributions: NonNullable<AgentPluginRuntimeConfig["systemPromptContributions"]> = [];
	const skillPathContributions: NonNullable<AgentPluginRuntimeConfig["skillPathContributions"]> = [];
	const toolPolicyContributions: NonNullable<AgentPluginRuntimeConfig["toolPolicyContributions"]> = [];

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
			console.warn(`[plugins] Skipping agent contribution for ${plugin.id}:`, error);
		}
	}

	const config: AgentPluginRuntimeConfig = {};
	if (systemPromptContributions.length > 0) config.systemPromptContributions = systemPromptContributions;
	if (skillPathContributions.length > 0) config.skillPathContributions = skillPathContributions;
	if (toolPolicyContributions.length > 0) config.toolPolicyContributions = toolPolicyContributions;
	return Object.keys(config).length > 0 ? config : undefined;
}

function systemInstalledFromManifest(manifest: PluginManifest, enabled: boolean): InstalledPlugin {
	const now = new Date().toISOString();
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
		description: manifest.description,
		author: manifest.author,
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
					console.warn(`[system-plugins] 跳过 ${manifest.id}：staging 缺少入口 (${manifest.entry})`);
					continue;
				}
				result.push(systemInstalledFromManifest(manifest, prefs[manifest.id]?.enabled ?? true));
				systemPluginIds.add(manifest.id);
			} catch (err) {
				console.warn(`[system-plugins] 跳过 ${entry}：`, err);
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
		prefs[id] = { enabled };
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

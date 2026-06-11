import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import AdmZip from "adm-zip";
import type {
	InstalledPlugin,
	PluginInstallOptions,
	PluginManifest,
	PluginPermission,
} from "../../preload/api-types/plugins.js";

const PLUGIN_API_VERSION = "1.0.0";
const pluginsBaseDir = join(homedir(), ".vetta", "plugins");
const manifestPath = join(homedir(), ".vetta", "plugins-manifest.json");
const tmpBaseDir = join(homedir(), ".vetta", "tmp", "plugins");

type PluginManifestFile = Record<string, InstalledPlugin>;

function ensureDir(dir: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readRegistry(): PluginManifestFile {
	if (!existsSync(manifestPath)) return {};
	try {
		const registry = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifestFile;
		for (const plugin of Object.values(registry)) {
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
	const styles = assertStringArray(input.styles, "styles").map((style) => validateRelativePath(style, "styles"));
	const permissions = assertPermissionArray(input.permissions);
	return {
		id,
		name: assertString(input.name, "name"),
		version,
		pluginApiVersion: assertString(input.pluginApiVersion, "pluginApiVersion"),
		entry,
		styles,
		permissions,
		description: typeof input.description === "string" ? input.description : undefined,
		author: typeof input.author === "string" ? input.author : undefined,
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
		entryUrl,
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

export function getPluginsBaseDir(): string {
	return pluginsBaseDir;
}

export function listPlugins(): InstalledPlugin[] {
	return Object.values(readRegistry()).sort((a, b) => a.name.localeCompare(b.name));
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
	const registry = readRegistry();
	delete registry[id];
	writeRegistry(registry);
	rmSync(join(pluginsBaseDir, id), { recursive: true, force: true });
}

export function setPluginEnabled(id: string, enabled: boolean): InstalledPlugin {
	validatePluginId(id);
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
	const registry = readRegistry();
	const plugin = registry[id];
	if (!plugin) throw new Error(`Plugin not found: ${id}`);
	plugin.activeVersion = plugin.pendingVersion ?? plugin.version;
	plugin.pendingVersion = undefined;
	plugin.availableVersion = undefined;
	const manifestFile = join(pluginsBaseDir, plugin.id, "versions", plugin.activeVersion, "plugin.json");
	const manifest = parseManifest(JSON.parse(readFileSync(manifestFile, "utf-8")));
	plugin.entryUrl = toPluginUrl(plugin.id, plugin.activeVersion, manifest.entry);
	plugin.styleUrls = (manifest.styles ?? []).map((style) => toPluginUrl(plugin.id, plugin.activeVersion, style));
	plugin.updatedAt = new Date().toISOString();
	writeRegistry(registry);
	return plugin;
}

export function resolvePluginFilePath(pluginId: string, relativePath: string): string {
	validatePluginId(pluginId);
	const root = resolve(pluginsBaseDir, pluginId);
	const target = resolve(root, relativePath);
	if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) {
		throw new Error("Plugin file path escapes plugin directory");
	}
	return target;
}

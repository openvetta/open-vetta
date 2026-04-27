import type { FSWatcher, Stats } from "node:fs";
import { readFileSync, watch } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import type { FsEntry } from "../../preload/fs-types.js";
import { getLinuxSandboxCapability } from "../sandbox/capability.js";
import { atomicWriteJSON } from "../utils/atomic-write.js";

// ─── Desktop app config ───

export interface ProjectEntry {
	path: string;
	name?: string;
}

export interface DesktopConfig {
	projects: ProjectEntry[];
	archivedProjects: ProjectEntry[];
	workspacePath: string;
	defaultExecutionMode: "sandbox" | "full-access";
	debugMode?: boolean;
}

export interface LinuxSandboxConfigState {
	status: "unknown" | "available" | "unavailable";
	backend: "bundled-bwrap" | "system-bwrap" | null;
	reason?: string;
	details?: string;
	checkedAt?: number;
}

export interface DesktopConfigSnapshot extends DesktopConfig {
	linuxSandbox: LinuxSandboxConfigState;
}

const CONFIG_PATH = join(homedir(), ".vetta", "desktop-config.json");
const MODELS_CONFIG_PATH = join(homedir(), ".vetta", "agent", "models.json");
const MCP_CONFIG_PATH = join(homedir(), ".vetta", "agent", "mcp.json");
const DEFAULT_CONFIG: DesktopConfig = {
	projects: [],
	archivedProjects: [],
	workspacePath: join(homedir(), ".vetta", "workspace"),
	defaultExecutionMode: "sandbox",
	debugMode: false,
};

/** Migrate legacy string[] format to ProjectEntry[] */
function migrateProjectEntries(entries: unknown): ProjectEntry[] {
	if (!Array.isArray(entries)) return [];
	if (entries.length === 0) return [];
	if (typeof entries[0] === "string") {
		return (entries as string[]).map((p) => ({ path: p }));
	}
	return entries as ProjectEntry[];
}

function normalizeExecutionMode(value: unknown): "sandbox" | "full-access" {
	return value === "full-access" ? "full-access" : "sandbox";
}

export async function readDesktopConfig(): Promise<DesktopConfig> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			projects: migrateProjectEntries(parsed.projects),
			archivedProjects: migrateProjectEntries(parsed.archivedProjects),
			workspacePath:
				typeof parsed.workspacePath === "string" ? expandTilde(parsed.workspacePath) : DEFAULT_CONFIG.workspacePath,
			defaultExecutionMode: normalizeExecutionMode(parsed.defaultExecutionMode),
			debugMode: typeof parsed.debugMode === "boolean" ? parsed.debugMode : false,
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

/** Sync version for use in hot paths (e.g. event callbacks) */
export function readConfigSync(): DesktopConfig {
	try {
		const raw = readFileSync(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			projects: migrateProjectEntries(parsed.projects),
			archivedProjects: migrateProjectEntries(parsed.archivedProjects),
			workspacePath:
				typeof parsed.workspacePath === "string" ? expandTilde(parsed.workspacePath) : DEFAULT_CONFIG.workspacePath,
			defaultExecutionMode: normalizeExecutionMode(parsed.defaultExecutionMode),
			debugMode: typeof parsed.debugMode === "boolean" ? parsed.debugMode : false,
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

async function writeConfig(config: DesktopConfig): Promise<void> {
	atomicWriteJSON(CONFIG_PATH, config);
}

function expandTilde(p: string): string {
	if (p.startsWith("~/") || p === "~") {
		return join(homedir(), p.slice(1));
	}
	return p;
}

// ─── Models config (providers & models) ───

export interface ModelsConfig {
	defaultModel?: string;
	providers: Record<string, ProviderConfig>;
}

export interface ProviderConfig {
	baseUrl?: string;
	apiKey?: string;
	api?: string;
	headers?: Record<string, string>;
	authHeader?: boolean;
	models?: ModelDefinition[];
	modelOverrides?: Record<string, Record<string, unknown>>;
}

export interface ModelDefinition {
	id: string;
	name?: string;
	api?: string;
	reasoning?: boolean;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
}

const DEFAULT_MODELS_CONFIG: ModelsConfig = { providers: {} };

// ─── MCP config ───

export interface McpServerConfig {
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	disabled?: boolean;
	autoApprove?: string[];
	startupTimeout?: number;
	debug?: boolean;
}

export interface McpConfig {
	mcpServers: Record<string, McpServerConfig>;
}

const DEFAULT_MCP_CONFIG: McpConfig = { mcpServers: {} };

async function readMcpConfig(): Promise<McpConfig> {
	try {
		const raw = await readFile(MCP_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<McpConfig>;
		return { ...DEFAULT_MCP_CONFIG, ...parsed };
	} catch {
		return { ...DEFAULT_MCP_CONFIG };
	}
}

async function writeMcpConfig(config: McpConfig): Promise<void> {
	atomicWriteJSON(MCP_CONFIG_PATH, config);
}

async function readModelsConfig(): Promise<ModelsConfig> {
	try {
		const raw = await readFile(MODELS_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<ModelsConfig>;
		return { ...DEFAULT_MODELS_CONFIG, ...parsed };
	} catch {
		return { ...DEFAULT_MODELS_CONFIG };
	}
}

async function writeModelsConfig(config: ModelsConfig): Promise<void> {
	atomicWriteJSON(MODELS_CONFIG_PATH, config);
}

const CHANNELS = {
	READ_DIR: "vetta:fs:read-dir",
	READ_FILE: "vetta:fs:read-file",
	WRITE_FILE: "vetta:fs:write-file",
	STAT: "vetta:fs:stat",
	RENAME: "vetta:fs:rename",
	DELETE: "vetta:fs:delete",
	MOVE: "vetta:fs:move",
	CREATE_DIRECTORY: "vetta:fs:create-directory",
	LIST_SUB_DIRS: "vetta:fs:list-sub-dirs",
	WATCH_DIR: "vetta:fs:watch-dir",
	UNWATCH_DIR: "vetta:fs:unwatch-dir",
	DIR_CHANGED: "vetta:fs:dir-changed",
	CONFIG_GET: "vetta:config:get",
	CONFIG_SET: "vetta:config:set",
	MODELS_GET: "vetta:models:get",
	MODELS_SET: "vetta:models:set",
	MCP_GET: "vetta:mcp:get",
	MCP_SET: "vetta:mcp:set",
} as const;

const BINARY_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "pdf", "docx"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const HIDDEN_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** Set of project CWDs that are allowed for file operations */
const allowedRoots = new Set<string>();

export function allowProjectRoot(cwd: string): void {
	allowedRoots.add(resolve(cwd));
}

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

function assertPathWithinProject(targetPath: string): void {
	const normalizeForComparison = (value: string): string => {
		const normalized = resolve(value);
		return process.platform === "win32" ? normalized.toLowerCase() : normalized;
	};
	const resolved = normalizeForComparison(targetPath);
	for (const root of allowedRoots) {
		const normalizedRoot = normalizeForComparison(root);
		const rel = relative(normalizedRoot, resolved);
		const isWithinRoot = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
		if (isWithinRoot) {
			return;
		}
	}
	throw new Error("Path is outside any known project directory");
}

export function registerFsIpc(): () => void {
	ipcMain.handle(CHANNELS.READ_DIR, async (_event, dirPath: unknown): Promise<FsEntry[]> => {
		assertNonEmptyString(dirPath, "dirPath");
		assertPathWithinProject(dirPath);

		const resolved = resolve(dirPath);
		const entries = await readdir(resolved, { withFileTypes: true });
		const results: FsEntry[] = [];

		for (const entry of entries) {
			if (HIDDEN_FILES.has(entry.name) || entry.name.startsWith(".")) continue;
			const fullPath = join(resolved, entry.name);
			try {
				const stats = await stat(fullPath);
				results.push({
					name: entry.name,
					path: fullPath,
					isDirectory: entry.isDirectory(),
					size: stats.size,
					modifiedAt: stats.mtimeMs,
				});
			} catch {
				// Skip entries we can't stat (permission errors, broken symlinks, etc.)
			}
		}

		// Sort: directories first, then by name (case-insensitive)
		results.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
		});

		return results;
	});

	ipcMain.handle(
		CHANNELS.READ_FILE,
		async (_event, filePath: unknown): Promise<{ content: string; encoding: "utf8" | "base64" }> => {
			assertNonEmptyString(filePath, "filePath");
			assertPathWithinProject(filePath);

			const resolved = resolve(filePath);
			let stats: Stats;
			try {
				stats = await stat(resolved);
			} catch (err: unknown) {
				if ((err as NodeJS.ErrnoException).code === "ENOENT") {
					return { content: "", encoding: "utf8" };
				}
				throw err;
			}
			if (stats.size > MAX_FILE_SIZE) {
				throw new Error("File too large to preview (>10 MB)");
			}

			const ext = extname(resolved).slice(1).toLowerCase();
			if (BINARY_EXTENSIONS.has(ext)) {
				const buffer = await readFile(resolved);
				return { content: buffer.toString("base64"), encoding: "base64" };
			}

			const content = await readFile(resolved, "utf8");
			return { content, encoding: "utf8" };
		},
	);

	ipcMain.handle(CHANNELS.WRITE_FILE, async (_event, filePath: unknown, content: unknown) => {
		assertNonEmptyString(filePath, "filePath");
		if (typeof content !== "string") throw new Error("Invalid content");
		assertPathWithinProject(filePath);
		const resolved = resolve(filePath);
		await mkdir(dirname(resolved), { recursive: true });
		await writeFile(resolved, content, "utf8");
	});

	ipcMain.handle(
		CHANNELS.STAT,
		async (_event, filePath: unknown): Promise<{ size: number; modifiedAt: number; createdAt: number } | null> => {
			assertNonEmptyString(filePath, "filePath");
			assertPathWithinProject(filePath);
			try {
				const stats = await stat(resolve(filePath));
				return { size: stats.size, modifiedAt: stats.mtimeMs, createdAt: stats.birthtimeMs };
			} catch {
				return null;
			}
		},
	);

	ipcMain.handle(CHANNELS.RENAME, async (_event, oldPath: unknown, newPath: unknown) => {
		assertNonEmptyString(oldPath, "oldPath");
		assertNonEmptyString(newPath, "newPath");
		assertPathWithinProject(oldPath);
		assertPathWithinProject(newPath);
		await rename(resolve(oldPath), resolve(newPath));
	});

	ipcMain.handle(CHANNELS.DELETE, async (_event, targetPath: unknown) => {
		assertNonEmptyString(targetPath, "targetPath");
		assertPathWithinProject(targetPath);
		await rm(resolve(targetPath), { recursive: true, force: true });
	});

	ipcMain.handle(CHANNELS.MOVE, async (_event, sourcePath: unknown, destDir: unknown) => {
		assertNonEmptyString(sourcePath, "sourcePath");
		assertNonEmptyString(destDir, "destDir");
		assertPathWithinProject(sourcePath);
		assertPathWithinProject(destDir);

		const resolvedSource = resolve(sourcePath);
		const resolvedDest = join(resolve(destDir), basename(resolvedSource));

		try {
			await rename(resolvedSource, resolvedDest);
		} catch (err: unknown) {
			// Cross-device move: copy + delete
			if ((err as NodeJS.ErrnoException).code === "EXDEV") {
				const srcStat = await stat(resolvedSource);
				if (srcStat.isDirectory()) {
					// For directories, use recursive copy
					await mkdir(resolvedDest, { recursive: true });
					const children = await readdir(resolvedSource, { withFileTypes: true });
					for (const child of children) {
						const childSrc = join(resolvedSource, child.name);
						const childDest = join(resolvedDest, child.name);
						await copyFile(childSrc, childDest);
					}
				} else {
					await copyFile(resolvedSource, resolvedDest);
				}
				await rm(resolvedSource, { recursive: true, force: true });
			} else {
				throw err;
			}
		}
	});

	ipcMain.handle(CHANNELS.CREATE_DIRECTORY, async (_event, dirPath: unknown) => {
		assertNonEmptyString(dirPath, "dirPath");
		await mkdir(resolve(expandTilde(dirPath)), { recursive: true });
	});

	ipcMain.handle(CHANNELS.LIST_SUB_DIRS, async (_event, dirPath: unknown): Promise<FsEntry[]> => {
		assertNonEmptyString(dirPath, "dirPath");
		const resolved = resolve(expandTilde(dirPath));
		allowProjectRoot(resolved);
		try {
			const entries = await readdir(resolved, { withFileTypes: true });
			const results: FsEntry[] = [];
			for (const entry of entries) {
				if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
				const fullPath = join(resolved, entry.name);
				allowProjectRoot(fullPath);
				try {
					const stats = await stat(fullPath);
					results.push({
						name: entry.name,
						path: fullPath,
						isDirectory: true,
						size: stats.size,
						modifiedAt: stats.mtimeMs,
					});
				} catch {
					// Skip entries we can't stat
				}
			}
			results.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
			return results;
		} catch {
			return [];
		}
	});

	// ─── Directory watchers ───

	const DEBOUNCE_MS = 300;
	const watchers = new Map<string, FSWatcher>();
	const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function broadcastDirChanged(dirPath: string): void {
		for (const win of BrowserWindow.getAllWindows()) {
			win.webContents.send(CHANNELS.DIR_CHANGED, dirPath);
		}
	}

	ipcMain.handle(CHANNELS.WATCH_DIR, async (_event, dirPath: unknown) => {
		assertNonEmptyString(dirPath, "dirPath");
		const resolved = resolve(dirPath);
		if (watchers.has(resolved)) return;
		try {
			const watcher = watch(resolved, (_eventType) => {
				// Debounce to avoid flooding on rapid changes
				const existing = debounceTimers.get(resolved);
				if (existing) clearTimeout(existing);
				debounceTimers.set(
					resolved,
					setTimeout(() => {
						debounceTimers.delete(resolved);
						broadcastDirChanged(resolved);
					}, DEBOUNCE_MS),
				);
			});
			watcher.on("error", () => {
				// Directory deleted or became inaccessible — clean up
				watchers.delete(resolved);
				watcher.close();
			});
			watchers.set(resolved, watcher);
		} catch {
			// Ignore errors (directory may not exist or no permission)
		}
	});

	ipcMain.handle(CHANNELS.UNWATCH_DIR, async (_event, dirPath: unknown) => {
		assertNonEmptyString(dirPath, "dirPath");
		const resolved = resolve(dirPath);
		const watcher = watchers.get(resolved);
		if (watcher) {
			watcher.close();
			watchers.delete(resolved);
		}
		const timer = debounceTimers.get(resolved);
		if (timer) {
			clearTimeout(timer);
			debounceTimers.delete(resolved);
		}
	});

	ipcMain.handle(CHANNELS.CONFIG_GET, async (): Promise<DesktopConfigSnapshot> => {
		const config = await readDesktopConfig();
		// Ensure all known paths are authorized for file operations
		for (const p of config.projects) allowProjectRoot(p.path);
		for (const p of config.archivedProjects) allowProjectRoot(p.path);
		if (config.workspacePath) allowProjectRoot(config.workspacePath);
		return {
			...config,
			linuxSandbox: getLinuxSandboxCapability(),
		};
	});

	ipcMain.handle(CHANNELS.CONFIG_SET, async (_event, config: unknown) => {
		if (typeof config !== "object" || config === null) throw new Error("Invalid config");
		const current = await readDesktopConfig();
		const patch = config as Partial<DesktopConfig>;
		const next: DesktopConfig = {
			projects: patch.projects ?? current.projects,
			archivedProjects: patch.archivedProjects ?? current.archivedProjects,
			workspacePath: patch.workspacePath ?? current.workspacePath,
			defaultExecutionMode:
				patch.defaultExecutionMode !== undefined
					? normalizeExecutionMode(patch.defaultExecutionMode)
					: current.defaultExecutionMode,
			debugMode: patch.debugMode ?? current.debugMode,
		};
		// Allow all known roots for file operations
		for (const p of next.projects) allowProjectRoot(p.path);
		for (const p of next.archivedProjects) allowProjectRoot(p.path);
		if (next.workspacePath) allowProjectRoot(next.workspacePath);
		await writeConfig(next);
	});

	ipcMain.handle(CHANNELS.MODELS_GET, async (): Promise<ModelsConfig> => {
		return readModelsConfig();
	});

	ipcMain.handle(CHANNELS.MODELS_SET, async (_event, config: unknown) => {
		if (typeof config !== "object" || config === null) throw new Error("Invalid models config");
		await writeModelsConfig(config as ModelsConfig);
	});

	ipcMain.handle(CHANNELS.MCP_GET, async (): Promise<McpConfig> => {
		return readMcpConfig();
	});

	ipcMain.handle(CHANNELS.MCP_SET, async (_event, config: unknown) => {
		if (typeof config !== "object" || config === null) throw new Error("Invalid MCP config");
		await writeMcpConfig(config as McpConfig);
	});

	return () => {
		// Close all directory watchers
		for (const watcher of watchers.values()) watcher.close();
		watchers.clear();
		for (const timer of debounceTimers.values()) clearTimeout(timer);
		debounceTimers.clear();

		ipcMain.removeHandler(CHANNELS.READ_DIR);
		ipcMain.removeHandler(CHANNELS.READ_FILE);
		ipcMain.removeHandler(CHANNELS.WRITE_FILE);
		ipcMain.removeHandler(CHANNELS.STAT);
		ipcMain.removeHandler(CHANNELS.RENAME);
		ipcMain.removeHandler(CHANNELS.DELETE);
		ipcMain.removeHandler(CHANNELS.MOVE);
		ipcMain.removeHandler(CHANNELS.READ_DIR);
		ipcMain.removeHandler(CHANNELS.CREATE_DIRECTORY);
		ipcMain.removeHandler(CHANNELS.LIST_SUB_DIRS);
		ipcMain.removeHandler(CHANNELS.WATCH_DIR);
		ipcMain.removeHandler(CHANNELS.UNWATCH_DIR);
		ipcMain.removeHandler(CHANNELS.CONFIG_GET);
		ipcMain.removeHandler(CHANNELS.CONFIG_SET);
		ipcMain.removeHandler(CHANNELS.MODELS_GET);
		ipcMain.removeHandler(CHANNELS.MODELS_SET);
		ipcMain.removeHandler(CHANNELS.MCP_GET);
		ipcMain.removeHandler(CHANNELS.MCP_SET);
	};
}

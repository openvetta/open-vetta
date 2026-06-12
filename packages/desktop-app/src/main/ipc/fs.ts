import type { Dirent, FSWatcher, Stats } from "node:fs";
import { readFileSync, watch } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import type { FsEntry, FsFileRef } from "../../preload/fs-types.js";
import { getLinuxSandboxCapability, getSandboxCapability, type SandboxCapability } from "../sandbox/capability.js";
import { atomicWriteJSON } from "../utils/atomic-write.js";

// ─── Desktop app config ───

export interface ProjectEntry {
	path: string;
	name?: string;
}

/** 实验性功能开关分组（设置页「Agent配置 → 扩展功能」）。新增实验项只加一个键。 */
export interface ExperimentalConfig {
	/** ask_user_question 工具：开启后仅对话会话可在执行途中向用户提多选题。缺省开。 */
	askUserQuestion?: boolean;
	/** Vetta CLI 提示词：开启后仅注入桌面端对话会话。缺省开。 */
	vettaCli?: boolean;
	/** 后台 bash 任务（run_in_background）：agent 可将耗时命令转入后台并在完成时被通知唤醒。缺省开；批量任务始终禁用。 */
	backgroundTasks?: boolean;
	/** 输入预测：每轮正常回答后预测用户下一个可能输入的 prompt。**缺省关**（区别于本组其他键的缺省开）；批量/流转会话不适用。 */
	promptPrediction?: boolean;
	/** 适配通用 Agent Skill：发现 `~/.agents/skills`、`<cwd>/.agents/skills` 下的通用 Agent Skill。缺省开。 */
	agentSkills?: boolean;
}

export interface DesktopConfig {
	projects: ProjectEntry[];
	archivedProjects: ProjectEntry[];
	workspacePath: string;
	defaultExecutionMode: "sandbox" | "full-access";
	debugMode?: boolean;
	vettaAppPath?: string;
	vettaCliAppPath?: string;
	/** 系统通知总开关（「通用设置」）。缺省视为开启。 */
	notificationsEnabled?: boolean;
	/** 实验性功能开关分组。缺省视为全部开启。 */
	experimental?: ExperimentalConfig;
}

export interface LinuxSandboxConfigState {
	status: "unknown" | "available" | "unavailable";
	backend: "bundled-bwrap" | "system-bwrap" | null;
	reason?: string;
	details?: string;
	checkedAt?: number;
}

export interface DesktopConfigSnapshot extends DesktopConfig {
	sandbox: SandboxCapability;
	linuxSandbox: LinuxSandboxConfigState;
	/** 默认「对话」项目的绝对路径（~/.vetta/conversation），主进程已确保目录存在。 */
	defaultConversationCwd: string;
	/** im-gateway 自己的 cwd（~/.vetta/im-gateway/conversation）。Claw tab 据此判定一条 session 是否来自 IM。 */
	defaultImConversationCwd: string;
}

export const DEFAULT_CONVERSATION_CWD = join(homedir(), ".vetta", "conversation");

/**
 * 默认「对话」项目的会话目录：仿照批量项目，把 session jsonl 放到 cwd 内部，
 * 避免 ~/.vetta/agent/sessions/<encoded-cwd>/ 的设备相关编码路径。
 */
export const DEFAULT_CONVERSATION_SESSION_DIR = join(DEFAULT_CONVERSATION_CWD, ".vetta", "sessions");

/**
 * im-gateway 自己的 cwd，跟桌面「对话」物理分离（ADR-0005）。Claw tab 只读
 * 列出此目录下的 session；im-gateway sidecar 启动时也注入此路径。
 */
export const DEFAULT_IM_CONVERSATION_CWD = join(homedir(), ".vetta", "im-gateway", "conversation");
export const DEFAULT_IM_CONVERSATION_SESSION_DIR = join(DEFAULT_IM_CONVERSATION_CWD, ".vetta", "sessions");

const CONFIG_PATH = join(homedir(), ".vetta", "desktop-config.json");
const MODELS_CONFIG_PATH = join(homedir(), ".vetta", "agent", "models.json");
const MCP_CONFIG_PATH = join(homedir(), ".vetta", "agent", "mcp.json");
const DEFAULT_CONFIG: DesktopConfig = {
	projects: [],
	archivedProjects: [],
	workspacePath: join(homedir(), ".vetta", "workspace"),
	defaultExecutionMode: "full-access",
	debugMode: false,
	notificationsEnabled: true,
	experimental: { askUserQuestion: true, vettaCli: true, backgroundTasks: true, agentSkills: true },
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
	return value === "sandbox" ? "sandbox" : "full-access";
}

function normalizeExperimental(value: unknown): ExperimentalConfig {
	// promptPrediction 缺省 false（区别于其他键缺省 true）。
	if (typeof value !== "object" || value === null)
		return {
			askUserQuestion: true,
			vettaCli: true,
			backgroundTasks: true,
			promptPrediction: false,
			agentSkills: true,
		};
	const v = value as Record<string, unknown>;
	return {
		askUserQuestion: typeof v.askUserQuestion === "boolean" ? v.askUserQuestion : true,
		vettaCli: typeof v.vettaCli === "boolean" ? v.vettaCli : true,
		backgroundTasks: typeof v.backgroundTasks === "boolean" ? v.backgroundTasks : true,
		promptPrediction: typeof v.promptPrediction === "boolean" ? v.promptPrediction : false,
		agentSkills: typeof v.agentSkills === "boolean" ? v.agentSkills : true,
	};
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
			vettaAppPath: typeof parsed.vettaAppPath === "string" ? parsed.vettaAppPath : undefined,
			vettaCliAppPath: typeof parsed.vettaCliAppPath === "string" ? parsed.vettaCliAppPath : undefined,
			notificationsEnabled: typeof parsed.notificationsEnabled === "boolean" ? parsed.notificationsEnabled : true,
			experimental: normalizeExperimental(parsed.experimental),
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
			vettaAppPath: typeof parsed.vettaAppPath === "string" ? parsed.vettaAppPath : undefined,
			vettaCliAppPath: typeof parsed.vettaCliAppPath === "string" ? parsed.vettaCliAppPath : undefined,
			notificationsEnabled: typeof parsed.notificationsEnabled === "boolean" ? parsed.notificationsEnabled : true,
			experimental: normalizeExperimental(parsed.experimental),
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export async function writeDesktopConfig(config: DesktopConfig): Promise<void> {
	atomicWriteJSON(CONFIG_PATH, config);
}

export async function persistVettaCliPaths(paths: { vettaAppPath: string; vettaCliAppPath: string }): Promise<void> {
	const config = await readDesktopConfig();
	if (config.vettaAppPath === paths.vettaAppPath && config.vettaCliAppPath === paths.vettaCliAppPath) return;
	await writeDesktopConfig({ ...config, ...paths });
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
	/** 供应商显示名(如 "DeepSeek"),UI 分组用;无则回退 provider 标识。 */
	displayName?: string;
	/** "template" = 由[[预设模板]]采纳而来,在线合并时会被服务端数据覆写(仅保留 apiKey)。 */
	source?: "template";
	/** 对应服务端模板的 provider 标识,仅 source==="template" 时存在。 */
	templateId?: string;
	/** 供应商图标 symbol(见 CONTEXT.md「icon symbol」)。 */
	icon?: string;
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
	/** 价格($/百万 tokens),见 [[预设模板]] 价格展示。 */
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

const DEFAULT_MODELS_CONFIG: ModelsConfig = { providers: {} };

// ─── MCP config ───

export interface McpServerCommonConfig {
	disabled?: boolean;
	autoApprove?: string[];
	startupTimeout?: number;
	debug?: boolean;
}

export interface McpStdioServerConfig extends McpServerCommonConfig {
	type?: "stdio";
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface McpHttpServerConfig extends McpServerCommonConfig {
	type: "http";
	url: string;
	headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

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

export async function readModelsConfig(): Promise<ModelsConfig> {
	try {
		const raw = await readFile(MODELS_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<ModelsConfig>;
		return { ...DEFAULT_MODELS_CONFIG, ...parsed };
	} catch {
		return { ...DEFAULT_MODELS_CONFIG };
	}
}

export async function writeModelsConfig(config: ModelsConfig): Promise<void> {
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
	LIST_FILES_RECURSIVE: "vetta:fs:list-files-recursive",
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

/** 递归列文件时跳过的重型/无关目录。 */
const RECURSIVE_IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	"target",
	"coverage",
	".next",
	".turbo",
	".cache",
]);
/** 递归列文件的上限，避免超大仓库一次性返回过多条目卡住 UI。 */
const MAX_RECURSIVE_FILES = 10000;

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

function normalizePathForComparison(value: string): string {
	const normalized = resolve(value);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/** 判断 targetPath 是否落在 root 目录内（含 root 本身）。 */
function isPathWithin(root: string, targetPath: string): boolean {
	const rel = relative(normalizePathForComparison(root), normalizePathForComparison(targetPath));
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isWithinAllowedRoots(targetPath: string): boolean {
	for (const root of allowedRoots) {
		if (isPathWithin(root, targetPath)) return true;
	}
	return false;
}

function assertPathWithinProject(targetPath: string): void {
	if (!isWithinAllowedRoots(targetPath)) {
		throw new Error("Path is outside any known project directory");
	}
}

/**
 * 预览读取专用的路径校验：比项目根更宽松。
 * 除已注册的项目根外，额外允许用户主目录（~）内的文件——
 * 这样 agent 写到 ~/Desktop 等位置的产物点击后也能预览，
 * 同时仍拦截 /etc、/System 等主目录之外的系统路径。
 * media-protocol（音频流式预览）与 READ_FILE 共用这道边界。
 */
export function assertPathReadableForPreview(targetPath: string): void {
	if (isWithinAllowedRoots(targetPath)) return;
	if (isPathWithin(homedir(), targetPath)) return;
	throw new Error("Path is outside any previewable directory");
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
			assertPathReadableForPreview(filePath);

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

	ipcMain.handle(CHANNELS.LIST_FILES_RECURSIVE, async (_event, rootPath: unknown): Promise<FsFileRef[]> => {
		assertNonEmptyString(rootPath, "rootPath");
		assertPathWithinProject(rootPath);

		const root = resolve(rootPath);
		const results: FsFileRef[] = [];

		async function walk(dir: string): Promise<void> {
			if (results.length >= MAX_RECURSIVE_FILES) return;
			let entries: Dirent[];
			try {
				entries = await readdir(dir, { withFileTypes: true });
			} catch {
				return; // 跳过无权限/已删除目录
			}
			for (const entry of entries) {
				if (results.length >= MAX_RECURSIVE_FILES) return;
				if (entry.name.startsWith(".") || HIDDEN_FILES.has(entry.name)) continue;
				const fullPath = join(dir, entry.name);
				if (entry.isDirectory()) {
					if (RECURSIVE_IGNORED_DIRS.has(entry.name)) continue;
					await walk(fullPath);
				} else if (entry.isFile()) {
					results.push({ name: entry.name, path: fullPath, relPath: relative(root, fullPath) });
				}
			}
		}

		await walk(root);
		return results;
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
	// Ref-counted: multiple consumers (file tree, plugin previews) may watch the
	// same directory. Only close the underlying watcher when the last releases it.
	const watchers = new Map<string, { watcher: FSWatcher; count: number }>();
	const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function broadcastDirChanged(dirPath: string): void {
		for (const win of BrowserWindow.getAllWindows()) {
			win.webContents.send(CHANNELS.DIR_CHANGED, dirPath);
		}
	}

	ipcMain.handle(CHANNELS.WATCH_DIR, async (_event, dirPath: unknown) => {
		assertNonEmptyString(dirPath, "dirPath");
		const resolved = resolve(dirPath);
		const existing = watchers.get(resolved);
		if (existing) {
			existing.count++;
			return;
		}
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
			watchers.set(resolved, { watcher, count: 1 });
		} catch {
			// Ignore errors (directory may not exist or no permission)
		}
	});

	ipcMain.handle(CHANNELS.UNWATCH_DIR, async (_event, dirPath: unknown) => {
		assertNonEmptyString(dirPath, "dirPath");
		const resolved = resolve(dirPath);
		const entry = watchers.get(resolved);
		if (entry) {
			entry.count--;
			if (entry.count <= 0) {
				entry.watcher.close();
				watchers.delete(resolved);
				const timer = debounceTimers.get(resolved);
				if (timer) {
					clearTimeout(timer);
					debounceTimers.delete(resolved);
				}
			}
		}
	});

	ipcMain.handle(CHANNELS.CONFIG_GET, async (): Promise<DesktopConfigSnapshot> => {
		const config = await readDesktopConfig();
		// Ensure all known paths are authorized for file operations
		for (const p of config.projects) allowProjectRoot(p.path);
		for (const p of config.archivedProjects) allowProjectRoot(p.path);
		if (config.workspacePath) allowProjectRoot(config.workspacePath);
		allowProjectRoot(DEFAULT_CONVERSATION_CWD);
		allowProjectRoot(DEFAULT_IM_CONVERSATION_CWD);
		return {
			...config,
			sandbox: getSandboxCapability(),
			linuxSandbox: getLinuxSandboxCapability(),
			defaultConversationCwd: DEFAULT_CONVERSATION_CWD,
			defaultImConversationCwd: DEFAULT_IM_CONVERSATION_CWD,
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
			vettaAppPath: patch.vettaAppPath ?? current.vettaAppPath,
			vettaCliAppPath: patch.vettaCliAppPath ?? current.vettaCliAppPath,
			notificationsEnabled: patch.notificationsEnabled ?? current.notificationsEnabled,
			experimental:
				patch.experimental !== undefined
					? normalizeExperimental({ ...current.experimental, ...patch.experimental })
					: current.experimental,
		};
		// Allow all known roots for file operations
		for (const p of next.projects) allowProjectRoot(p.path);
		for (const p of next.archivedProjects) allowProjectRoot(p.path);
		if (next.workspacePath) allowProjectRoot(next.workspacePath);
		await writeDesktopConfig(next);
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
		// 不再在保存时 fan-out 重建所有 session。改为每个 session 在用户发
		// prompt 时按需 diff-reload（见 AgentSession._maybeReloadMcpForPrompt）。
		// 这样未使用的 session 不付出代价，且批量任务也能自然感知到变化。
	});

	return () => {
		// Close all directory watchers
		for (const entry of watchers.values()) entry.watcher.close();
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
		ipcMain.removeHandler(CHANNELS.LIST_FILES_RECURSIVE);
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

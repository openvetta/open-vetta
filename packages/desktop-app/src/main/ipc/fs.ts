import type { Dirent, FSWatcher, Stats } from "node:fs";
import { readFileSync, watch } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import {
	clearMcpOAuthState,
	hasMcpOAuthTokens,
	loginHttpMcpServer,
	loginMcpDeviceFlow,
} from "@vetta/coding-agent/core/mcp/index.js";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";
import { BrowserWindow, ipcMain } from "electron";
import type {
	McpConfigData,
	McpHttpServerConfigData,
	McpServerCommonConfigData,
	McpServerConfigData,
	McpStdioServerConfigData,
} from "../../preload/api-types/mcp.js";
import type { FsEntry, FsFileRef } from "../../preload/fs-types.js";
import { isLanguagePreference, type LanguagePreference } from "../../shared/i18n/config.js";
import { normalizeShortcutsConfig, type ShortcutsConfig } from "../../shared/shortcuts.js";
import { SHORTCUTS_CHANNELS } from "../../shared/shortcuts-ipc.js";
import { validateMcpConfig } from "../mcp-config-validation.js";
import { probeModelProvider } from "../models/probe.js";
import { openExternalUrl } from "../open-external.js";
import { getLinuxSandboxCapability, getSandboxCapability, type SandboxCapability } from "../sandbox/capability.js";

// ─── Desktop app config ───

export interface ProjectEntry {
	path: string;
	name?: string;
}

/** 实验性功能开关分组（设置页「Agent配置 → 扩展功能」）。新增实验项只加一个键。 */
export interface ExperimentalConfig {
	/** Vetta CLI 提示词：开启后仅注入桌面端对话会话。缺省开。 */
	vettaCli?: boolean;
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
	/**
	 * 界面语言偏好（见 ADR-0031）：`system` | `zh` | `en`。
	 * 缺省（undefined）= 跟随系统（等价 system）。
	 */
	language?: LanguagePreference;
	/** 实验性功能开关分组。缺省视为全部开启。 */
	experimental?: ExperimentalConfig;
	/** 知识库加工设置。 */
	knowledgeBase?: KnowledgeBaseConfig;
	/**
	 * 全局应用快捷键自定义绑定（设置 → 快捷键 → 全局快捷键）。
	 * 与 quickPanel 无关，禁止混写。
	 */
	shortcuts?: ShortcutsConfig;
	/** 快捷面板（双击功能键唤出 Spotlight 式面板）设置。 */
	quickPanel?: QuickPanelConfig;
	/** Appshot（全局手势捕获前台应用窗口）设置。缺省关闭。 */
	appshot?: AppshotConfig;
	/** 新会话页元素显隐（设置 → 新会话页）。各项缺省 true。 */
	newSessionPage?: NewSessionPageConfig;
}

/** 新会话页欢迎区元素显隐。缺省全部显示。 */
export interface NewSessionPageConfig {
	/** 场景卡片 list。缺省 true。 */
	showSceneCards?: boolean;
	/** 技能 badge list。缺省 true。 */
	showSkillBadges?: boolean;
	/** 引导词轮播。缺省 true。 */
	showGuidingWords?: boolean;
}

/** Appshot 触发手势：双键同按（左右两侧同时按住）。both-shift=双 ⇧；both-mod=双 ⌘(mac)/Ctrl；both-alt=双 ⌥/Alt。 */
export type AppshotGesture = "both-shift" | "both-mod" | "both-alt";

export interface AppshotConfig {
	/** 是否启用。缺省 false。 */
	enabled?: boolean;
	/** 触发手势。缺省 "both-shift"。 */
	gesture?: AppshotGesture;
}

/** 快捷面板设置（设置页「快捷键 → 快捷面板」）。缺省关闭、无预设快捷键。 */
/** 快捷面板呼出触发：双击哪个功能键。none=不启用；mod=双击 ⌘(mac)/Ctrl(win)；alt=双击 ⌥/Alt；shift=双击 ⇧。 */
export type QuickPanelTrigger = "none" | "mod" | "alt" | "shift";

export interface QuickPanelConfig {
	/** 呼出触发（双击功能键）。缺省 none（不启用）。 */
	trigger?: QuickPanelTrigger;
	/** 发送后行为：foreground=打开主窗定位新会话；background=后台运行仅关面板。缺省 foreground。 */
	postSendBehavior?: "foreground" | "background";
}

export interface KnowledgeBaseConfig {
	/** 是否启用后台惰性加工。缺省关。 */
	enabled?: boolean;
	/** 轮询间隔（分钟）：3 / 5 / 10 / 30。缺省 5。 */
	pollIntervalMinutes?: number;
	/** 加工会话使用的模型 key（provider/modelId）。缺省跟随默认模型。 */
	processingModelKey?: string;
	/** 加工模型的推理档位；未设置时按模型自身默认档。"off" 关闭思考。 */
	processingModelReasoningLevel?: string;
	/** 并发加工会话数（网络/LLM 限流）。缺省 3。 */
	agentConcurrency?: number;
	/** 并发本地 OCR 子进程数（CPU 限流）。缺省 1（受 desktop 共享 OCR profile 制约）。 */
	ocrConcurrency?: number;
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
	/** 知识库加工特殊项目的绝对路径（~/.vetta/knowledges/processing_records）。 */
	knowledgeProcessingCwd: string;
}

export const DEFAULT_CONVERSATION_CWD = join(getVettaHomePath(), "conversation");

/**
 * 默认「对话」项目的会话目录：仿照批量项目，把 session jsonl 放到 cwd 内部，
 * 避免 ~/.vetta/agent/sessions/<encoded-cwd>/ 的设备相关编码路径。
 */
export const DEFAULT_CONVERSATION_SESSION_DIR = join(DEFAULT_CONVERSATION_CWD, ".vetta", "sessions");

/**
 * im-gateway 自己的 cwd，跟桌面「对话」物理分离（ADR-0005）。Claw tab 只读
 * 列出此目录下的 session；im-gateway sidecar 启动时也注入此路径。
 */
export const DEFAULT_IM_CONVERSATION_CWD = join(getVettaHomePath(), "im-gateway", "conversation");
export const DEFAULT_IM_CONVERSATION_SESSION_DIR = join(DEFAULT_IM_CONVERSATION_CWD, ".vetta", "sessions");

/**
 * 知识库加工特殊项目（仿「对话」项目）：cwd 是 ~/.vetta/knowledges/processing_records，
 * 每轮加工的 session jsonl 落在其本地 .vetta/sessions，自包含、可在 sidebar 回看。
 */
export const KB_PROCESSING_CWD = join(getVettaHomePath(), "knowledges", "processing_records");
export const KB_PROCESSING_SESSION_DIR = join(KB_PROCESSING_CWD, ".vetta", "sessions");

const CONFIG_PATH = join(getVettaHomePath(), "desktop-config.json");
const MODELS_CONFIG_PATH = join(getVettaHomePath(), "agent", "models.json");
const MCP_CONFIG_PATH = join(getVettaHomePath(), "agent", "mcp.json");
const DEFAULT_CONFIG: DesktopConfig = {
	projects: [],
	archivedProjects: [],
	workspacePath: join(getVettaHomePath(), "workspace"),
	defaultExecutionMode: "full-access",
	debugMode: false,
	notificationsEnabled: true,
	experimental: { vettaCli: true, agentSkills: true },
	shortcuts: { bindings: {} },
	quickPanel: { trigger: "none", postSendBehavior: "foreground" },
	appshot: { enabled: false, gesture: "both-shift" },
	newSessionPage: { showSceneCards: true, showSkillBadges: true, showGuidingWords: true },
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

const KB_POLL_INTERVALS = [3, 5, 10, 30];

function normalizeKnowledgeBase(value: unknown): KnowledgeBaseConfig {
	// 总开关缺省视为关闭（知识库消耗大量 Token，改为用户主动开启）；后台加工跟随总开关。
	if (typeof value !== "object" || value === null) {
		return { enabled: false, pollIntervalMinutes: 5 };
	}
	const v = value as Record<string, unknown>;
	const interval = typeof v.pollIntervalMinutes === "number" ? v.pollIntervalMinutes : 5;
	const clampInt = (x: unknown, fallback: number, min: number): number =>
		typeof x === "number" && Number.isFinite(x) && x >= min ? Math.floor(x) : fallback;
	return {
		enabled: v.enabled === true,
		// 0 = 永不自动加工（仅停后台轮询，知识库本身仍启用、可手动整理）。
		pollIntervalMinutes: interval === 0 || KB_POLL_INTERVALS.includes(interval) ? interval : 5,
		processingModelKey: typeof v.processingModelKey === "string" ? v.processingModelKey : undefined,
		processingModelReasoningLevel:
			typeof v.processingModelReasoningLevel === "string" ? v.processingModelReasoningLevel : undefined,
		agentConcurrency: clampInt(v.agentConcurrency, 3, 1),
		ocrConcurrency: clampInt(v.ocrConcurrency, 1, 1),
	};
}

function normalizeQuickPanel(value: unknown): QuickPanelConfig {
	// 锁定缺省：不启用、发送后前台。
	if (typeof value !== "object" || value === null) return { trigger: "none", postSendBehavior: "foreground" };
	const v = value as Record<string, unknown>;
	const trigger: QuickPanelTrigger =
		v.trigger === "mod" || v.trigger === "alt" || v.trigger === "shift" ? v.trigger : "none";
	return {
		trigger,
		postSendBehavior: v.postSendBehavior === "background" ? "background" : "foreground",
	};
}

function normalizeShortcuts(value: unknown): ShortcutsConfig {
	return normalizeShortcutsConfig(value);
}

/** 向所有窗口广播全局快捷键绑定变更（设置页 GUI 与 Action 共用）。 */
export function broadcastShortcutsBindingsChanged(bindings: Record<string, string>): void {
	const payload = { bindings };
	for (const win of BrowserWindow.getAllWindows()) {
		if (win.isDestroyed()) continue;
		win.webContents.send(SHORTCUTS_CHANNELS.CHANGED, payload);
	}
}

function normalizeAppshot(value: unknown): AppshotConfig {
	// 锁定缺省：不启用、双 Shift 手势。非法值落默认。
	if (typeof value !== "object" || value === null) return { enabled: false, gesture: "both-shift" };
	const v = value as Record<string, unknown>;
	const gesture: AppshotGesture =
		v.gesture === "both-shift" || v.gesture === "both-mod" || v.gesture === "both-alt" ? v.gesture : "both-shift";
	return {
		enabled: v.enabled === true,
		gesture,
	};
}

function normalizeNewSessionPage(value: unknown): NewSessionPageConfig {
	// 锁定缺省：三项均显示。仅显式 false 才隐藏。
	if (typeof value !== "object" || value === null) {
		return { showSceneCards: true, showSkillBadges: true, showGuidingWords: true };
	}
	const v = value as Record<string, unknown>;
	return {
		showSceneCards: v.showSceneCards !== false,
		showSkillBadges: v.showSkillBadges !== false,
		showGuidingWords: v.showGuidingWords !== false,
	};
}

function normalizeExperimental(value: unknown): ExperimentalConfig {
	// promptPrediction 缺省 false（区别于其他键缺省 true）。
	if (typeof value !== "object" || value === null)
		return {
			vettaCli: true,
			promptPrediction: false,
			agentSkills: true,
		};
	const v = value as Record<string, unknown>;
	return {
		vettaCli: typeof v.vettaCli === "boolean" ? v.vettaCli : true,
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
			language: isLanguagePreference(parsed.language) ? parsed.language : undefined,
			experimental: normalizeExperimental(parsed.experimental),
			knowledgeBase: normalizeKnowledgeBase(parsed.knowledgeBase),
			shortcuts: normalizeShortcuts(parsed.shortcuts),
			quickPanel: normalizeQuickPanel(parsed.quickPanel),
			appshot: normalizeAppshot(parsed.appshot),
			newSessionPage: normalizeNewSessionPage(parsed.newSessionPage),
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
			language: isLanguagePreference(parsed.language) ? parsed.language : undefined,
			experimental: normalizeExperimental(parsed.experimental),
			knowledgeBase: normalizeKnowledgeBase(parsed.knowledgeBase),
			shortcuts: normalizeShortcuts(parsed.shortcuts),
			quickPanel: normalizeQuickPanel(parsed.quickPanel),
			appshot: normalizeAppshot(parsed.appshot),
			newSessionPage: normalizeNewSessionPage(parsed.newSessionPage),
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
	/** 该模型支持的推理档位 value 列表；为空/未设时客户端回退到 api 类型内置预设。 */
	reasoningLevels?: string[];
	/** 用户未选过档位时的默认档。 */
	defaultReasoningLevel?: string;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
	/** 价格($/百万 tokens),见 [[预设模板]] 价格展示。 */
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

const DEFAULT_MODELS_CONFIG: ModelsConfig = { providers: {} };

// ─── MCP config ───

export type McpServerCommonConfig = McpServerCommonConfigData;
export type McpStdioServerConfig = McpStdioServerConfigData;
export type McpHttpServerConfig = McpHttpServerConfigData;
export type McpServerConfig = McpServerConfigData;
export type McpConfig = McpConfigData;

const DEFAULT_MCP_CONFIG: McpConfig = { mcpServers: {} };

export async function readMcpConfig(): Promise<McpConfig> {
	try {
		const raw = await readFile(MCP_CONFIG_PATH, "utf8");
		return validateMcpConfig(JSON.parse(raw));
	} catch {
		return { ...DEFAULT_MCP_CONFIG };
	}
}

export async function writeMcpConfig(config: McpConfig): Promise<void> {
	atomicWriteJSON(MCP_CONFIG_PATH, config);
}

/** 去掉已下线的 peripheral 字段，避免读写路径继续保留死配置。 */
function stripLegacyPeripheralFields(config: ModelsConfig): ModelsConfig {
	const next = { ...config } as ModelsConfig & {
		peripheralModel?: unknown;
		peripheralModelReasoningLevel?: unknown;
	};
	delete next.peripheralModel;
	delete next.peripheralModelReasoningLevel;
	return next;
}

export async function readModelsConfig(): Promise<ModelsConfig> {
	try {
		const raw = await readFile(MODELS_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<ModelsConfig>;
		return stripLegacyPeripheralFields({ ...DEFAULT_MODELS_CONFIG, ...parsed });
	} catch {
		return { ...DEFAULT_MODELS_CONFIG };
	}
}

export async function writeModelsConfig(config: ModelsConfig): Promise<void> {
	atomicWriteJSON(MODELS_CONFIG_PATH, stripLegacyPeripheralFields(config));
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
	MODELS_PROBE: "vetta:models:probe",
	MCP_GET: "vetta:mcp:get",
	MCP_SET: "vetta:mcp:set",
	MCP_LOGIN: "vetta:mcp:login",
	MCP_LOGOUT: "vetta:mcp:logout",
	MCP_HAS_AUTH: "vetta:mcp:has-auth",
	MCP_AUTH_STATUS: "vetta:mcp:auth-status",
} as const;

const BINARY_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"ico",
	"pdf",
	"docx",
	"xls",
	"xlsx",
	"xlsm",
	"xlsb",
	"ods",
	"ppt",
	"pptx",
]);
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

	ipcMain.handle(CHANNELS.WRITE_FILE, async (_event, filePath: unknown, content: unknown, encoding: unknown) => {
		assertNonEmptyString(filePath, "filePath");
		if (typeof content !== "string") throw new Error("Invalid content");
		assertPathWithinProject(filePath);
		const resolved = resolve(filePath);
		await mkdir(dirname(resolved), { recursive: true });
		// Optional base64 encoding for binary plugin assets (e.g. Cowart page images).
		if (encoding === "base64") {
			await writeFile(resolved, Buffer.from(content, "base64"));
			return;
		}
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
		allowProjectRoot(KB_PROCESSING_CWD);
		return {
			...config,
			sandbox: getSandboxCapability(),
			linuxSandbox: getLinuxSandboxCapability(),
			defaultConversationCwd: DEFAULT_CONVERSATION_CWD,
			defaultImConversationCwd: DEFAULT_IM_CONVERSATION_CWD,
			knowledgeProcessingCwd: KB_PROCESSING_CWD,
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
			language: patch.language ?? current.language,
			experimental:
				patch.experimental !== undefined
					? normalizeExperimental({ ...current.experimental, ...patch.experimental })
					: current.experimental,
			knowledgeBase:
				patch.knowledgeBase !== undefined
					? normalizeKnowledgeBase({ ...current.knowledgeBase, ...patch.knowledgeBase })
					: current.knowledgeBase,
			// bindings 整表替换（支持 reset 删键）；GUI/Action 均传完整 map。
			shortcuts: patch.shortcuts !== undefined ? normalizeShortcuts(patch.shortcuts) : current.shortcuts,
			quickPanel:
				patch.quickPanel !== undefined
					? normalizeQuickPanel({ ...current.quickPanel, ...patch.quickPanel })
					: current.quickPanel,
			appshot:
				patch.appshot !== undefined ? normalizeAppshot({ ...current.appshot, ...patch.appshot }) : current.appshot,
			newSessionPage:
				patch.newSessionPage !== undefined
					? normalizeNewSessionPage({ ...current.newSessionPage, ...patch.newSessionPage })
					: current.newSessionPage,
		};
		// Allow all known roots for file operations
		for (const p of next.projects) allowProjectRoot(p.path);
		for (const p of next.archivedProjects) allowProjectRoot(p.path);
		if (next.workspacePath) allowProjectRoot(next.workspacePath);
		await writeDesktopConfig(next);
		if (patch.shortcuts !== undefined) {
			const bindings = next.shortcuts?.bindings ?? {};
			broadcastShortcutsBindingsChanged(bindings as Record<string, string>);
		}
	});

	ipcMain.handle(CHANNELS.MODELS_GET, async (): Promise<ModelsConfig> => {
		return readModelsConfig();
	});

	ipcMain.handle(CHANNELS.MODELS_SET, async (_event, config: unknown) => {
		if (typeof config !== "object" || config === null) throw new Error("Invalid models config");
		await writeModelsConfig(config as ModelsConfig);
		// 写入 models.json 后立即刷新共享 ModelRegistry，
		// 使 API Key 等修改在下次模型调用时即时生效，无需重启应用。
		const { getOrCreateSharedModelRegistry } = await import("../runtime.js");
		await getOrCreateSharedModelRegistry().refresh();
	});

	ipcMain.handle(CHANNELS.MODELS_PROBE, async (_event, ref: { provider: string; model: string }) => {
		return probeModelProvider(ref);
	});

	ipcMain.handle(CHANNELS.MCP_GET, async (): Promise<McpConfig> => {
		return readMcpConfig();
	});

	ipcMain.handle(CHANNELS.MCP_SET, async (_event, config: unknown) => {
		await writeMcpConfig(validateMcpConfig(config));
		// 不再在保存时 fan-out 重建所有 session。改为每个 session 在用户发
		// prompt 时按需 diff-reload（见 AgentSession._maybeReloadMcpForPrompt）。
		// 这样未使用的 session 不付出代价，且批量任务也能自然感知到变化。
	});

	ipcMain.handle(CHANNELS.MCP_LOGIN, async (_event, serverName: unknown, options?: unknown) => {
		if (typeof serverName !== "string" || !serverName.trim()) {
			throw new Error("Invalid server name");
		}
		const name = serverName.trim();
		const opts = typeof options === "object" && options !== null ? (options as Record<string, unknown>) : {};
		const optionUrl = typeof opts.url === "string" ? opts.url.trim() : "";
		let oauthClientId = typeof opts.oauthClientId === "string" ? opts.oauthClientId.trim() : "";
		let deviceFlow = opts.oauthDeviceFlow === true;
		let scopes = typeof opts.oauthScopes === "string" ? opts.oauthScopes : "";

		let serverUrl = optionUrl;
		// Read mcp.json for anything not passed by the renderer (re-authorize path).
		if (!serverUrl || !oauthClientId || !deviceFlow || !scopes) {
			const config = await readMcpConfig();
			const server = config.mcpServers[name];
			if (!serverUrl) {
				if (!server) throw new Error(`MCP server '${name}' not found`);
				if (server.type !== "http" || typeof server.url !== "string" || !server.url.trim()) {
					throw new Error(`MCP server '${name}' is not a remote HTTP server`);
				}
				serverUrl = server.url.trim();
			}
			if (server?.type === "http") {
				if (!oauthClientId && typeof server.oauthClientId === "string") oauthClientId = server.oauthClientId.trim();
				if (!deviceFlow && server.oauthDeviceFlow === true) deviceFlow = true;
				if (!scopes && typeof server.oauthScopes === "string") scopes = server.oauthScopes;
			}
		}

		if (deviceFlow) {
			if (!oauthClientId) throw new Error(`MCP server '${name}' is missing oauthClientId for the device flow`);
			await loginMcpDeviceFlow({
				serverName: name,
				serverUrl,
				clientId: oauthClientId,
				scopes: scopes || undefined,
				openUrl: (url) => openExternalUrl(url),
			});
			return;
		}

		await loginHttpMcpServer({
			serverName: name,
			serverUrl,
			oauthClientId: oauthClientId || undefined,
			openUrl: (url) => openExternalUrl(url),
		});
	});

	ipcMain.handle(CHANNELS.MCP_LOGOUT, async (_event, serverName: unknown) => {
		if (typeof serverName !== "string" || !serverName.trim()) {
			throw new Error("Invalid server name");
		}
		clearMcpOAuthState(serverName.trim());
	});

	ipcMain.handle(CHANNELS.MCP_HAS_AUTH, async (_event, serverName: unknown): Promise<boolean> => {
		if (typeof serverName !== "string" || !serverName.trim()) return false;
		return hasMcpOAuthTokens(serverName.trim());
	});

	ipcMain.handle(CHANNELS.MCP_AUTH_STATUS, async (_event, serverNames: unknown): Promise<Record<string, boolean>> => {
		if (!Array.isArray(serverNames)) return {};
		const result: Record<string, boolean> = {};
		for (const name of serverNames) {
			if (typeof name === "string" && name.trim()) {
				result[name.trim()] = hasMcpOAuthTokens(name.trim());
			}
		}
		return result;
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
		ipcMain.removeHandler(CHANNELS.MCP_LOGIN);
		ipcMain.removeHandler(CHANNELS.MCP_LOGOUT);
		ipcMain.removeHandler(CHANNELS.MCP_HAS_AUTH);
		ipcMain.removeHandler(CHANNELS.MCP_AUTH_STATUS);
	};
}

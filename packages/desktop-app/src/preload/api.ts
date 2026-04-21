import type { Message } from "@mariozechner/pi-ai";
import type {
	HistoryEntry,
	ProjectInfo,
	PromptRequest,
	SessionConfig,
	SessionEvent,
	SessionHistoryInfo,
	SessionStateSnapshot,
	SettingsPatch,
} from "../../../runtime-core/src/index.js";
import type { DesktopFsApi } from "./fs-types.js";

export interface DesktopSessionApi {
	create(config?: SessionConfig): Promise<{ sessionId: string }>;
	listProjects(): Promise<ProjectInfo[]>;
	listSessions(cwd: string): Promise<SessionHistoryInfo[]>;
	prompt(sessionId: string, request: PromptRequest): Promise<void>;
	continue(sessionId: string): Promise<void>;
	abort(sessionId: string): Promise<void>;
	subscribe(sessionId: string, handler: (event: SessionEvent) => void): Promise<() => void>;
	updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void>;
	setGlobalThinkingLevel(level: string): Promise<void>;
	getGlobalThinkingLevel(): Promise<string>;
	getState(sessionId: string): Promise<SessionStateSnapshot>;
	getMessages(sessionId: string): Promise<Message[]>;
	getFullHistory(sessionId: string): Promise<HistoryEntry[]>;
	delete(sessionPath: string): Promise<void>;
	rename(sessionPath: string, name: string): Promise<void>;
	dispose(sessionId: string): Promise<void>;
}

export interface SelectedImageFile {
	data: string;
	mimeType: string;
	name: string;
}

export interface DesktopDialogApi {
	selectFolder(): Promise<string | null>;
	selectFolders(): Promise<string[]>;
	selectImages(): Promise<SelectedImageFile[]>;
	selectFiles(defaultPath?: string): Promise<string[]>;
}

export interface DesktopThemeApi {
	set(mode: "light" | "dark" | "system"): Promise<void>;
	getNative(): Promise<{ source: string; shouldUseDarkColors: boolean }>;
	onNativeChanged(handler: (info: { shouldUseDarkColors: boolean }) => void): () => void;
}

export interface SkillInfo {
	name: string;
	alias?: string;
	description: string;
	source: string;
	type: "skill" | "scene";
}

export interface MarketSkillMeta {
	name: string;
	description: string;
	type: "skill" | "scene";
	version: string;
	author: string;
	tags: string[];
}

export interface InstalledMarketSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "market";
	enabled: boolean;
	type?: "skill" | "scene";
	alias?: string;
	marketDescription?: string;
}

export interface DesktopSkillsApi {
	list(): Promise<SkillInfo[]>;
	installFromMarket(
		name: string,
		archiveBuffer: ArrayBuffer,
		type: "skill" | "scene",
		meta?: { alias?: string; marketDescription?: string },
	): Promise<void>;
	uninstall(name: string, type: "skill" | "scene"): Promise<void>;
	toggle(name: string): Promise<void>;
	getMarketManifest(): Promise<Record<string, InstalledMarketSkill>>;
}

export interface ProjectEntry {
	path: string;
	name?: string;
}

export interface DesktopConfigData {
	projects: ProjectEntry[];
	archivedProjects: ProjectEntry[];
	workspacePath: string;
}

export interface DesktopConfigApi {
	get(): Promise<DesktopConfigData>;
	set(config: Partial<DesktopConfigData>): Promise<void>;
}

export interface ModelsConfigData {
	/** Default model identifier: "provider/modelId" */
	defaultModel?: string;
	providers: Record<
		string,
		{
			baseUrl?: string;
			apiKey?: string;
			api?: string;
			headers?: Record<string, string>;
			authHeader?: boolean;
			models?: Array<{
				id: string;
				name?: string;
				api?: string;
				reasoning?: boolean;
				input?: string[];
				contextWindow?: number;
				maxTokens?: number;
			}>;
			modelOverrides?: Record<string, Record<string, unknown>>;
		}
	>;
}

export interface RemoteProvidersResult {
	providers: Record<string, unknown>;
	error?: string;
}

export interface DesktopModelsApi {
	get(): Promise<ModelsConfigData>;
	set(config: ModelsConfigData): Promise<void>;
	fetchRemote(): Promise<RemoteProvidersResult>;
}

export interface McpServerConfigData {
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	disabled?: boolean;
	autoApprove?: string[];
	startupTimeout?: number;
	debug?: boolean;
}

export interface McpConfigData {
	mcpServers: Record<string, McpServerConfigData>;
}

export interface DesktopMcpApi {
	get(): Promise<McpConfigData>;
	set(config: McpConfigData): Promise<void>;
}

export interface DesktopShellApi {
	showInFolder(fullPath: string): Promise<void>;
}

export interface DesktopWindowApi {
	minimize(): Promise<void>;
	maximize(): Promise<void>;
	close(): Promise<void>;
	isMaximized(): Promise<boolean>;
}

export interface DesktopSettingsApi {
	getServerUrl(): Promise<string>;
	getServerToken(): Promise<string | undefined>;
	setServerToken(token: string | undefined): Promise<void>;
}

export interface DesktopCreditsApi {
	getBalance(): Promise<{ balance: number | null; unlimited?: boolean }>;
}

export interface UpdateCheckResult {
	hasUpdate: boolean;
	currentVersion: string;
	latestVersion?: string;
	releaseNote?: string;
	downloadUrl?: string;
	error?: string;
}

export interface DesktopUpdaterApi {
	check(): Promise<UpdateCheckResult>;
	getCurrentVersion(): Promise<string>;
	download(url: string): Promise<void>;
}

export interface DesktopAuthApi {
	openExternal(url: string): Promise<void>;
	onOAuthCallback(handler: (data: { token: string }) => void): () => void;
}

export interface ScheduledTask {
	id: string;
	name: string;
	prompt: string;
	cron: string;
	isOnce: boolean;
	enabled: boolean;
	/** Project working directory this task is associated with */
	cwd: string;
	modelId?: string;
	createdAt: number;
	updatedAt: number;
	lastRunAt: number | null;
	lastRunStatus: "success" | "failed" | null;
}

export interface TaskExecutionRecord {
	id: string;
	taskId: string;
	sessionId: string;
	/** Session file path for navigating to the conversation */
	sessionPath?: string;
	/** Project working directory */
	cwd?: string;
	startedAt: number;
	completedAt: number | null;
	status: "running" | "success" | "failed" | "aborted";
	prompt: string;
	responsePreview: string;
	error?: string;
	durationMs?: number;
}

export type TaskEvent =
	| { type: "task.started"; taskId: string; recordId: string }
	| { type: "task.completed"; taskId: string; recordId: string; status: "success" | "failed" }
	| { type: "task.failed"; taskId: string; error: string }
	| { type: "record.updated"; taskId: string; sessionId: string; status: "success" | "aborted" };

export interface DesktopTrayApi {
	setQuitBehavior(hideToTray: boolean): Promise<void>;
	getQuitBehavior(): Promise<boolean>;
	setTooltip(text: string): Promise<void>;
}

export interface DesktopSchedulerApi {
	getTasks(): Promise<ScheduledTask[]>;
	createTask(
		task: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">,
	): Promise<ScheduledTask>;
	updateTask(id: string, patch: Partial<ScheduledTask>): Promise<void>;
	deleteTask(id: string): Promise<void>;
	toggleTask(id: string): Promise<void>;
	/** Disable a task (set enabled=false and stop its scheduled job) */
	disableTask(id: string): Promise<void>;
	getRecords(taskId: string): Promise<TaskExecutionRecord[]>;
	runTaskNow(id: string): Promise<void>;
	abortTask(id: string): Promise<void>;
	onTaskEvent(handler: (event: TaskEvent) => void): () => void;
}

export interface DesktopFlowingApi {
	packFiles(projectDir: string, filePaths: string[], message?: string, senderName?: string): Promise<ArrayBuffer>;
	unpackFiles(zipBuffer: ArrayBuffer, destDir: string): Promise<string[]>;
	readMeta(projectDir: string): Promise<Record<string, unknown> | null>;
	writeMeta(projectDir: string, meta: Record<string, unknown>): Promise<void>;
	findProjectByFlowingId(flowingId: number, projects: ProjectEntry[]): Promise<string | null>;
}

export type BatchTaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface BatchTask {
	id: string;
	name: string;
	cwd: string;
	sourcePath: string;
	status: BatchTaskStatus;
	sessionId?: string;
	sessionPath?: string;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

export interface BatchProject {
	id: string;
	name: string;
	prompt: string;
	modelKey?: string;
	concurrency: number;
	tasks: BatchTask[];
	createdAt: number;
	updatedAt: number;
}

export type BatchTaskEvent =
	| { type: "task.started"; projectId: string; taskId: string; sessionId: string; sessionPath: string | undefined }
	| { type: "task.completed"; projectId: string; taskId: string }
	| { type: "task.failed"; projectId: string; taskId: string; error: string }
	| { type: "task.paused"; projectId: string; taskId: string }
	| { type: "task.resumed"; projectId: string; taskId: string };

export interface DesktopBatchTasksApi {
	getProjects(): Promise<BatchProject[]>;
	createProject(data: {
		name: string;
		prompt: string;
		modelKey?: string;
		folders: string[];
		concurrency: number;
	}): Promise<BatchProject>;
	updateProject(
		projectId: string,
		data: Partial<{ name: string; prompt: string; modelKey: string; concurrency: number; newFolders: string[] }>,
	): Promise<void>;
	deleteProject(projectId: string): Promise<void>;
	runTask(projectId: string, taskId: string): Promise<void>;
	pauseTask(projectId: string, taskId: string): Promise<void>;
	resumeTask(projectId: string, taskId: string): Promise<void>;
	deleteTask(projectId: string, taskId: string): Promise<void>;
	batchRetryFailed(projectId: string): Promise<void>;
	batchPause(projectId: string): Promise<void>;
	batchResume(projectId: string): Promise<void>;
	batchDelete(projectId: string): Promise<void>;
	batchRunNeverExecuted(projectId: string): Promise<void>;
	batchRestartAll(projectId: string): Promise<void>;
	deleteSession(sessionPath: string): Promise<void>;
	onTaskEvent(handler: (event: BatchTaskEvent) => void): () => void;
}

export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "canceled";

export interface DownloadItem {
	id: string;
	url: string;
	filename: string;
	path: string;
	totalBytes: number;
	receivedBytes: number;
	status: DownloadStatus;
	error?: string;
	createdAt: number;
	completedAt?: number;
	speedBytesPerSec?: number;
}

export interface DownloadStartParams {
	url: string;
	filename?: string;
	headers?: Record<string, string>;
	saveDir?: string;
}

export interface DownloadEvent {
	type: "added" | "updated" | "removed";
	item?: DownloadItem;
	id?: string;
}

export interface DesktopDownloadsApi {
	start(params: DownloadStartParams): Promise<DownloadItem>;
	pause(id: string): Promise<void>;
	resume(id: string): Promise<void>;
	cancel(id: string): Promise<void>;
	remove(id: string, deleteFile: boolean): Promise<void>;
	list(): Promise<DownloadItem[]>;
	openFile(id: string): Promise<void>;
	showInFolder(id: string): Promise<void>;
	getDefaultDir(): Promise<string>;
	onEvent(handler: (event: DownloadEvent) => void): () => void;
}

// =============================================================================
// IM bridge (im-gateway sidecar)
// =============================================================================

export type ImTransportStatus = "offline" | "connecting" | "online" | "error" | "awaiting_bind";

export type ImTransportSelector = "feishu" | "wechat";

export interface ImBridgeConfig {
	enabled: boolean;
	transport: ImTransportSelector;
	feishu: {
		appId: string;
		appSecret: string;
		verificationToken: string;
		encryptKey: string;
		baseUrl?: string;
	};
	wechat: {
		bound: boolean;
		ilinkBotId?: string;
		ilinkUserId?: string;
	};
	transportMode: "long-connection";
	encryptionAvailable: boolean;
}

export interface ImSetConfigPayload {
	enabled: boolean;
	transport?: ImTransportSelector;
	feishu?: {
		appId: string;
		appSecret?: string;
		verificationToken?: string;
		encryptKey?: string;
		baseUrl?: string;
	};
}

export interface ImSetConfigResult {
	ok: boolean;
	mode?: "plaintext";
	error?: string;
}

export interface ImBridgeStatus {
	transport: ImTransportStatus;
	lastError?: string;
	lastErrorAt?: string;
	activeSessions: number;
	sidecarPid?: number;
	sidecarStartedAt?: string;
	consecutiveStartFailures: number;
	binaryPath?: string;
}

export interface ImLogEvent {
	type: "log";
	level: "debug" | "info" | "warn" | "error";
	msg: string;
	fields?: Record<string, unknown>;
	time: string;
}

export interface ImTestConnectionResult {
	ok: boolean;
	error?: string;
	message?: string;
}

export interface ImPathInfo {
	config: string;
	credentials: string;
	state: string;
	wechatState: string;
}

// =============================================================================
// Wechat (iLink) bind flow
// =============================================================================

export type ImWechatBindStatus = "scanned" | "expired" | "redirected" | "confirmed" | "failed" | "cancelled";

/**
 * Tagged-union of bind-flow events the renderer's bind dialog reacts to.
 *
 *   qr       — a fresh QR url is ready; render and display
 *   status   — bind state machine transition
 *   bound    — credentials persisted, sidecar starting wechat transport
 *   unbound  — credentials cleared (logout or expiry)
 */
export type ImWechatBindEvent =
	| { kind: "qr"; type: "wechat_qr"; url: string; attempt: number }
	| {
			kind: "status";
			type: "wechat_bind_status";
			status: ImWechatBindStatus;
			error?: string;
	  }
	| {
			kind: "bound";
			type: "wechat_bound";
			ilink_bot_id: string;
			ilink_user_id?: string;
			base_url?: string;
	  }
	| { kind: "unbound"; type: "wechat_unbound"; reason?: string };

export interface ImWechatStartBindResult {
	ok: boolean;
	error?: string;
}

export interface ImWechatLogoutResult {
	ok: boolean;
	error?: string;
}

export interface ImWechatApi {
	/**
	 * Start (or restart) a QR scan flow. Auto-flips the active transport
	 * to wechat if needed. Returns immediately; live progress arrives via
	 * subscribeBind().
	 */
	startBind(): Promise<ImWechatStartBindResult>;
	/** Forget the bound account and re-enter awaiting_bind state. */
	logout(): Promise<ImWechatLogoutResult>;
	/**
	 * Subscribe to live bind-flow events. The handler is called with every
	 * qr / status / bound / unbound event in arrival order. Returns an
	 * unsubscribe function.
	 */
	subscribeBind(handler: (event: ImWechatBindEvent) => void): Promise<() => void>;
}

export interface ImLegacyDetection {
	hasLegacyData: boolean;
	configPath?: string;
	credentialsPath?: string;
	statePath?: string;
	parsed?: {
		feishu?: { appId?: string; appSecret?: string; baseUrl?: string };
		stateEntries?: Array<{ userId: string; projectId: string; sessionPath: string; updatedAt?: string }>;
	};
	error?: string;
}

export interface DesktopImApi {
	getConfig(): Promise<ImBridgeConfig>;
	setConfig(payload: ImSetConfigPayload): Promise<ImSetConfigResult>;
	getStatus(): Promise<ImBridgeStatus>;
	subscribeStatus(
		handler: (snapshot: ImBridgeStatus) => void,
		onLog: (event: ImLogEvent) => void,
	): Promise<() => void>;
	testConnection(payload: ImSetConfigPayload["feishu"]): Promise<ImTestConnectionResult>;
	restart(): Promise<{ ok: boolean }>;
	getRecentLogs(): Promise<ImLogEvent[]>;
	getPaths(): Promise<ImPathInfo>;
	detectLegacy(): Promise<ImLegacyDetection>;
	importLegacy(detection: ImLegacyDetection): Promise<{ ok: boolean; error?: string }>;
	/** Wechat (iLink) bind flow. See ImWechatApi. */
	wechat: ImWechatApi;
}

export interface DesktopApi {
	session: DesktopSessionApi;
	dialog: DesktopDialogApi;
	theme: DesktopThemeApi;
	fs: DesktopFsApi;
	skills: DesktopSkillsApi;
	config: DesktopConfigApi;
	models: DesktopModelsApi;
	mcp: DesktopMcpApi;
	settings: DesktopSettingsApi;
	credits: DesktopCreditsApi;
	shell: DesktopShellApi;
	window: DesktopWindowApi;
	auth: DesktopAuthApi;
	updater: DesktopUpdaterApi;
	tray: DesktopTrayApi;
	scheduler: DesktopSchedulerApi;
	flowing: DesktopFlowingApi;
	batchTasks: DesktopBatchTasksApi;
	downloads: DesktopDownloadsApi;
	im: DesktopImApi;
}

declare global {
	interface Window {
		vetta: DesktopApi;
	}
}

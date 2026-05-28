import type { Message } from "@mariozechner/pi-ai";
import type {
	HistoryEntry,
	ProjectInfo,
	PromptRequest,
	RuntimeSandboxGrantDecision,
	RuntimeSandboxGrantInfo,
	RuntimeSandboxGrantRequest,
	RuntimeUserConfirmationRequest,
	SessionConfig,
	SessionEvent,
	SessionExecutionMode,
	SessionHistoryInfo,
	SessionStateSnapshot,
	SettingsPatch,
} from "../../../runtime-core/src/index.js";
import type { DesktopFsApi } from "./fs-types.js";

export type ExecutionModeOverride = "inherit" | SessionExecutionMode;

export interface DesktopSessionApi {
	create(config?: SessionConfig): Promise<{ sessionId: string }>;
	listProjects(): Promise<ProjectInfo[]>;
	listSessions(cwd: string): Promise<SessionHistoryInfo[]>;
	prompt(sessionId: string, request: PromptRequest): Promise<void>;
	continue(sessionId: string): Promise<void>;
	abort(sessionId: string): Promise<void>;
	/** 清空 session 的 todo 列表（被 scene 等 lock 时返回 false）。 */
	clearTodos(sessionId: string): Promise<boolean>;
	subscribe(sessionId: string, handler: (event: SessionEvent) => void): Promise<() => void>;
	onConfirmationRequest(handler: (request: RuntimeUserConfirmationRequest) => void): () => void;
	respondToConfirmation(requestId: string, confirmed: boolean): Promise<void>;
	onSandboxGrantRequest(handler: (request: RuntimeSandboxGrantRequest) => void): () => void;
	respondToSandboxGrant(requestId: string, decision: RuntimeSandboxGrantDecision): Promise<void>;
	listSandboxGrants(sessionId: string): Promise<RuntimeSandboxGrantInfo[]>;
	revokeSandboxGrant(sessionId: string, grantId: string): Promise<boolean>;
	revokeAllSandboxGrants(sessionId: string): Promise<number>;
	getSessionPath(sessionId: string): Promise<string | undefined>;
	updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void>;
	setExecutionMode(sessionId: string, mode: SessionExecutionMode): Promise<void>;
	setGlobalExecutionMode(mode: SessionExecutionMode): Promise<void>;
	setGlobalThinkingLevel(level: string): Promise<void>;
	getGlobalThinkingLevel(): Promise<string>;
	getState(sessionId: string): Promise<SessionStateSnapshot>;
	getMessages(sessionId: string): Promise<Message[]>;
	getFullHistory(sessionId: string): Promise<HistoryEntry[]>;
	delete(sessionPath: string): Promise<void>;
	rename(sessionPath: string, name: string): Promise<void>;
	autoTitle(sessionId: string, userText: string, assistantText: string): Promise<string | null>;
	dispose(sessionId: string): Promise<void>;
	/** Snapshot of session paths currently in the agent loop. */
	listRunning(): Promise<string[]>;
	/** Subscribe to running-set changes. Fires for each toggle (running=true|false). */
	onRunningChanged(handler: (payload: { sessionPath: string; running: boolean }) => void): () => void;
	/**
	 * 清空默认「对话」项目，按 scope 分流：
	 * - "conversation"：删除非 IM 会话 + cwd 下所有产物文件，保留 IM (claw) session 的 .jsonl
	 * - "claw"：仅删除 origin==="im" 的 session .jsonl，其他一切不动
	 * 主进程会先 dispose 本 scope 涉及的 session handle；若该 scope 仍有运行中的会话则抛错拒绝。
	 */
	clearDefaultConversation(scope: "conversation" | "claw"): Promise<void>;
	/**
	 * Open a session for read-only viewing. Does NOT acquire the
	 * session-file lock, so IM-owned sessions (sidecar may be actively
	 * writing) can be viewed live without conflict. Returns initial
	 * HistoryEntry[] plus the SessionHeader.origin tag.
	 */
	openViewer(path: string): Promise<{ history: HistoryEntry[]; origin?: "im" | "desktop" }>;
	/**
	 * Subscribe to live updates for a viewer-mode session. Handler fires
	 * whenever the underlying .jsonl is written. Returns an unsubscribe
	 * function — caller MUST call it on unmount to release the fs.watch.
	 */
	subscribeViewer(
		path: string,
		handler: (snapshot: { history: HistoryEntry[]; origin?: "im" | "desktop" }) => void,
	): Promise<() => void>;
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

/**
 * 选中的技能/场景。会话页、批量任务、自动化共用同一种结构；
 * 执行时由各自的 executor 在 prompt 前拼 `/skill:name\n` 或 `/scene:name\n`。
 */
export interface SelectedSkillRef {
	name: string;
	alias?: string;
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

export interface InstalledCustomSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "custom";
	enabled: boolean;
	type: "skill";
	alias?: string;
	description: string;
}

export type InstalledSkill = InstalledMarketSkill | InstalledCustomSkill;

export interface DesktopSkillsApi {
	list(): Promise<SkillInfo[]>;
	installFromMarket(
		name: string,
		archiveBuffer: ArrayBuffer,
		type: "skill" | "scene",
		meta?: { alias?: string; marketDescription?: string },
	): Promise<void>;
	importCustom(archiveBuffer: ArrayBuffer): Promise<{ name: string }>;
	uninstall(name: string, type: "skill" | "scene"): Promise<void>;
	toggle(name: string): Promise<void>;
	getMarketManifest(): Promise<Record<string, InstalledSkill>>;
	getSkillMdPath(name: string, type: "skill" | "scene"): Promise<string>;
}

export interface ProjectEntry {
	path: string;
	name?: string;
}

export interface DesktopConfigData {
	projects: ProjectEntry[];
	archivedProjects: ProjectEntry[];
	workspacePath: string;
	vettaAppPath?: string;
	defaultExecutionMode?: "sandbox" | "full-access";
	sandbox?: {
		status: "unknown" | "available" | "unavailable";
		backend: "bundled-bwrap" | "system-bwrap" | "macos-seatbelt" | "windows-host" | null;
		platform: NodeJS.Platform;
		binaryPath?: string;
		reason?: string;
		details?: string;
		checkedAt?: number;
		features?: {
			readRoots: boolean;
			writeRoots: boolean;
			denyRead: boolean;
			denyWrite: boolean;
			tempRootIsolation: boolean;
			networkIsolation: boolean;
			processTreeKill: boolean;
			passiveProbe: boolean;
			activeProbe: boolean;
		};
	};
	linuxSandbox?: {
		status: "unknown" | "available" | "unavailable";
		backend: "bundled-bwrap" | "system-bwrap" | null;
		reason?: string;
		details?: string;
		checkedAt?: number;
	};
	debugMode?: boolean;
	/** 默认「对话」项目的绝对路径（~/.vetta/conversation），主进程已确保目录存在。 */
	defaultConversationCwd?: string;
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

export interface McpServerCommonConfigData {
	disabled?: boolean;
	autoApprove?: string[];
	startupTimeout?: number;
	debug?: boolean;
	/** 仅 UI 展示用的可读名（mcp.json 里的 key 仍是真实 name）。 */
	displayName?: string;
	/** 仅 UI 展示用的描述。 */
	description?: string;
}

export interface McpStdioServerConfigData extends McpServerCommonConfigData {
	type?: "stdio";
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface McpHttpServerConfigData extends McpServerCommonConfigData {
	type: "http";
	url: string;
	headers?: Record<string, string>;
}

export type McpServerConfigData = McpStdioServerConfigData | McpHttpServerConfigData;

export interface McpConfigData {
	mcpServers: Record<string, McpServerConfigData>;
}

export interface DesktopMcpApi {
	get(): Promise<McpConfigData>;
	set(config: McpConfigData): Promise<void>;
}

export interface DesktopShellApi {
	showInFolder(fullPath: string): Promise<void>;
	showItemInFolder(fullPath: string): Promise<void>;
}

export interface ToolCallRecord {
	id: string;
	toolName: string;
	toolCallId: string;
	timestamp: string;
	args: unknown;
	result?: unknown;
	isError: boolean;
}

export interface RequestFileInfo {
	filename: string;
	path: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	costTotal: number;
	timestamp: number;
	size: number;
}

export interface DesktopDebugApi {
	parseToolCalls(sessionPath: string): Promise<ToolCallRecord[]>;
	listRequestFiles(projectName: string, sessionId: string): Promise<RequestFileInfo[]>;
	clearDebugDir(): Promise<void>;
}

// ─── Project import / export ───
//
// Mirrors `src/main/ipc/project-export.ts`. Both directions can return either
// the success payload OR an `{ error: { code, message } }` envelope so the
// renderer can branch on the failure mode without try/catch.

export type ProjectExportErrorCode =
	| "unsupported-type"
	| "invalid-zip"
	| "unsupported-zip"
	| "incompatible-version"
	| "extract-failed"
	| "user-cancelled";

export interface ProjectExportError {
	error: { code: ProjectExportErrorCode; message: string };
}

export interface ProjectExportSuccess {
	saved: boolean;
	zipPath?: string;
}

export interface ProjectImportSuccess {
	path: string;
	name: string;
	type: "normal" | "batch";
	missingSources?: string[];
}

export interface DesktopProjectApi {
	/** Export a project to a zip via native save dialog. */
	export(projectDir: string): Promise<ProjectExportSuccess | ProjectExportError>;
	/** Import a project from a zip via native open dialog. `null` = user cancelled. */
	import(): Promise<ProjectImportSuccess | ProjectExportError | null>;
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
	getServerRefreshToken(): Promise<string | undefined>;
	setServerRefreshToken(token: string | undefined): Promise<void>;
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

export type UpdaterPhase = "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "error";

export interface UpdaterState {
	phase: UpdaterPhase;
	currentVersion: string;
	latestVersion?: string;
	releaseNote?: string;
	/** 0..1 */
	progress?: number;
	downloadedBytes?: number;
	totalBytes?: number;
	assetFileName?: string;
	error?: string;
	/** true 时 sidebar 应展示"待重启" 提示 */
	pendingInstall: boolean;
}

export interface DesktopUpdaterApi {
	check(): Promise<UpdaterState>;
	getState(): Promise<UpdaterState>;
	getCurrentVersion(): Promise<string>;
	/** 启动后台下载（无感）。返回最终状态。 */
	download(): Promise<UpdaterState>;
	/** 立即重启并安装（仅当 state.phase === "ready"） */
	install(): Promise<void>;
	/** 用户点"稍后"：保留 pending-install，下次启动再弹 */
	dismiss(): Promise<void>;
	/** 丢弃已下载内容、回到 idle */
	cancel(): Promise<void>;
	/** 订阅状态变化。返回取消函数。 */
	onStateChanged(handler: (state: UpdaterState) => void): () => void;
}

export interface DesktopAuthApi {
	openExternal(url: string): Promise<void>;
	/**
	 * 委托主进程用磁盘上的 refresh_token 换新 access。返回新 access token 或 null。
	 * 渲染层不要再直接调 /auth/refresh —— 跨进程同时用同一 refresh_token 会被服务端
	 * 视作 reuse 并 revoke，造成"老是掉登录"的体感问题。
	 */
	refreshToken(): Promise<string | null>;
	onOAuthCallback(handler: (data: { token: string; refreshToken?: string }) => void): () => void;
	/**
	 * 主进程发起的请求（如 fetchRemoteProviders / credits balance）收到 401 时触发。
	 * 渲染层应在这里执行登出，但不要中断正在运行的本地模型会话。
	 */
	onUnauthorized(handler: () => void): () => void;
	/** 主进程通过 refresh token 拿到新 access+refresh 后广播给渲染层。 */
	onTokenRefreshed(handler: (data: { accessToken: string; refreshToken: string }) => void): () => void;
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
	modelKey?: string;
	executionMode?: ExecutionModeOverride;
	skill?: SelectedSkillRef;
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
	executionMode?: SessionExecutionMode;
}

export type TaskEvent =
	| {
			type: "task.started";
			taskId: string;
			recordId: string;
			sessionId: string;
			sessionPath: string;
			cwd: string;
			sessionName: string;
			firstMessage: string;
	  }
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

export type BatchTaskStatus = "pending" | "running" | "completed" | "failed" | "paused";

export interface BatchTask {
	id: string;
	name: string;
	cwd: string;
	sourcePath: string;
	status: BatchTaskStatus;
	sessionId?: string;
	sessionPath?: string;
	executionMode?: SessionExecutionMode;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

export interface BatchProject {
	id: string;
	name: string;
	prompt: string;
	modelKey?: string;
	executionMode?: ExecutionModeOverride;
	concurrency: number;
	artifactPatterns?: string[];
	notifyEnabled?: boolean;
	timeoutMinutes?: number;
	skill?: SelectedSkillRef;
	tasks: BatchTask[];
	createdAt: number;
	updatedAt: number;
}

export type BatchTaskEvent =
	| {
			type: "task.started";
			projectId: string;
			taskId: string;
			sessionId: string;
			sessionPath: string | undefined;
			executionMode: SessionExecutionMode;
	  }
	| { type: "task.completed"; projectId: string; taskId: string }
	| { type: "task.failed"; projectId: string; taskId: string; error: string }
	| { type: "task.reset"; projectId: string; taskId: string }
	| { type: "task.queued"; projectId: string; taskId: string }
	| { type: "task.dequeued"; projectId: string; taskId: string }
	| {
			type: "task.paused";
			projectId: string;
			taskId: string;
			sessionId: string;
			sessionPath: string | undefined;
			executionMode: SessionExecutionMode;
	  };

export interface DesktopBatchTasksApi {
	getProjects(): Promise<BatchProject[]>;
	createProject(data: {
		name: string;
		prompt: string;
		modelKey?: string;
		executionMode?: ExecutionModeOverride;
		folders: string[];
		concurrency: number;
		artifactPatterns?: string[];
		notifyEnabled?: boolean;
		timeoutMinutes?: number;
		skill?: SelectedSkillRef;
	}): Promise<BatchProject>;
	updateProject(
		projectId: string,
		data: Partial<{
			name: string;
			prompt: string;
			modelKey: string;
			executionMode: ExecutionModeOverride;
			concurrency: number;
			artifactPatterns: string[];
			notifyEnabled: boolean;
			timeoutMinutes: number;
			newFolders: string[];
			skill: SelectedSkillRef | null;
		}>,
	): Promise<void>;
	deleteProject(projectId: string): Promise<void>;
	runTask(projectId: string, taskId: string): Promise<void>;
	retryTask(projectId: string, taskId: string): Promise<void>;
	stopTask(projectId: string, taskId: string): Promise<void>;
	deleteTask(projectId: string, taskId: string): Promise<void>;
	batchDelete(projectId: string): Promise<void>;
	batchStart(projectId: string): Promise<void>;
	batchStop(projectId: string): Promise<void>;
	batchReset(projectId: string): Promise<void>;
	batchResetFailed(projectId: string, taskIds: string[]): Promise<void>;
	deleteSession(sessionPath: string): Promise<void>;
	resumeTask(projectId: string, taskId: string): Promise<void>;
	resumeTaskWithText(projectId: string, taskId: string, text: string): Promise<void>;
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

export interface ImAgentModelRef {
	provider: string;
	model: string;
}

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
	agentModel?: ImAgentModelRef;
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
	// null clears the override; undefined preserves the current value.
	agentModel?: ImAgentModelRef | null;
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
	/** Reachability check for an IM-session model. Used by the bridge
	 * settings page's "测试连通" button and gated automatically on
	 * setConfig(enabled=true). ok=true also for HTTP 4xx — host is up,
	 * auth is a separate concern. */
	probeAgentModel(ref: ImAgentModelRef): Promise<{ ok: boolean; message?: string; error?: string }>;
	detectLegacy(): Promise<ImLegacyDetection>;
	importLegacy(detection: ImLegacyDetection): Promise<{ ok: boolean; error?: string }>;
	/** Subscribe to "IM routing table changed" pings emitted by the sidecar's
	 * state_patch events. Renderer uses this to refresh the sidebar's
	 * default "对话" project session list without manual reload. Returns
	 * an unsubscribe function. */
	onSessionChanged(handler: () => void): () => void;
	/** Wechat (iLink) bind flow. See ImWechatApi. */
	wechat: ImWechatApi;
}

// =============================================================================
// Webhook
// =============================================================================

export type WebhookKind = "feishu" | "dingtalk";

export interface WebhookEndpointPublic {
	id: string;
	kind: WebhookKind;
	name: string;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
	urlMask?: string;
	hasSignSecret?: boolean;
	feishu?: { mentionAll?: boolean };
	dingtalk?: { mentionAll?: boolean; atMobiles?: string[]; keyword?: string };
}

export interface WebhookProviderDescriptor {
	kind: WebhookKind;
	displayName: string;
	iconClass: string;
}

export interface WebhookCreateInput {
	kind: WebhookKind;
	name: string;
	webhookUrl: string;
	signSecret?: string;
	enabled?: boolean;
	feishu?: WebhookEndpointPublic["feishu"];
	dingtalk?: WebhookEndpointPublic["dingtalk"];
}

export interface WebhookUpdatePatch {
	name?: string;
	enabled?: boolean;
	webhookUrl?: string;
	signSecret?: string;
	feishu?: WebhookEndpointPublic["feishu"];
	dingtalk?: WebhookEndpointPublic["dingtalk"];
}

export interface WebhookMessage {
	title?: string;
	text: string;
	level?: "info" | "warn" | "error" | "success";
}

export interface WebhookSendResult {
	ok: boolean;
	error?: string;
}

export interface WebhookMutationResult {
	ok: boolean;
	endpoint?: WebhookEndpointPublic;
	error?: string;
}

export interface DesktopWebhookApi {
	list(): Promise<WebhookEndpointPublic[]>;
	listProviders(): Promise<WebhookProviderDescriptor[]>;
	create(input: WebhookCreateInput): Promise<WebhookMutationResult>;
	update(id: string, patch: WebhookUpdatePatch): Promise<WebhookMutationResult>;
	delete(id: string): Promise<{ ok: boolean }>;
	toggle(id: string, enabled: boolean): Promise<WebhookMutationResult>;
	test(id: string): Promise<WebhookSendResult>;
	send(id: string, message: WebhookMessage): Promise<WebhookSendResult>;
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
	debug: DesktopDebugApi;
	project: DesktopProjectApi;
	webhook: DesktopWebhookApi;
}

declare global {
	interface Window {
		vetta: DesktopApi;
	}
}

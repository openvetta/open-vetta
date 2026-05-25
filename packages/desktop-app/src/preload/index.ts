import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopApi } from "./api.js";

const CHANNELS = {
	CREATE: "vetta:session:create",
	LIST_PROJECTS: "vetta:session:list-projects",
	LIST_SESSIONS: "vetta:session:list-sessions",
	PROMPT: "vetta:session:prompt",
	CONTINUE: "vetta:session:continue",
	ABORT: "vetta:session:abort",
	CLEAR_TODOS: "vetta:session:clear-todos",
	SUBSCRIBE: "vetta:session:subscribe",
	UNSUBSCRIBE: "vetta:session:unsubscribe",
	UPDATE_SETTINGS: "vetta:session:update-settings",
	SET_EXECUTION_MODE: "vetta:session:set-execution-mode",
	SET_GLOBAL_EXECUTION_MODE: "vetta:session:set-global-execution-mode",
	GET_STATE: "vetta:session:get-state",
	GET_MESSAGES: "vetta:session:get-messages",
	GET_FULL_HISTORY: "vetta:session:get-full-history",
	CONFIRM_REQUEST: "vetta:session:confirm-request",
	CONFIRM_RESPONSE: "vetta:session:confirm-response",
	SANDBOX_GRANT_REQUEST: "vetta:session:sandbox-grant-request",
	SANDBOX_GRANT_RESPONSE: "vetta:session:sandbox-grant-response",
	SANDBOX_GRANTS_LIST: "vetta:session:sandbox-grants-list",
	SANDBOX_GRANTS_REVOKE: "vetta:session:sandbox-grants-revoke",
	SANDBOX_GRANTS_REVOKE_ALL: "vetta:session:sandbox-grants-revoke-all",
	SET_GLOBAL_THINKING: "vetta:session:set-global-thinking-level",
	GET_GLOBAL_THINKING: "vetta:session:get-global-thinking-level",
	DELETE: "vetta:session:delete",
	RENAME: "vetta:session:rename",
	AUTO_TITLE: "vetta:session:auto-title",
	DISPOSE: "vetta:session:dispose",
	EVENT: "vetta:session:event",
	LIST_RUNNING: "vetta:session:list-running",
	RUNNING_CHANGED: "vetta:session:running-changed",
	CLEAR_DEFAULT_CONVERSATION: "vetta:session:clear-default-conversation",
} as const;

const SCHEDULER_CHANNELS = {
	GET_TASKS: "vetta:scheduler:get-tasks",
	CREATE_TASK: "vetta:scheduler:create-task",
	UPDATE_TASK: "vetta:scheduler:update-task",
	DELETE_TASK: "vetta:scheduler:delete-task",
	TOGGLE_TASK: "vetta:scheduler:toggle-task",
	DISABLE_TASK: "vetta:scheduler:disable-task",
	GET_RECORDS: "vetta:scheduler:get-records",
	RUN_NOW: "vetta:scheduler:run-now",
	ABORT: "vetta:scheduler:abort",
	EVENT: "vetta:scheduler:event",
} as const;

const DOWNLOAD_CHANNELS = {
	START: "vetta:downloads:start",
	PAUSE: "vetta:downloads:pause",
	RESUME: "vetta:downloads:resume",
	CANCEL: "vetta:downloads:cancel",
	REMOVE: "vetta:downloads:remove",
	LIST: "vetta:downloads:list",
	OPEN_FILE: "vetta:downloads:open-file",
	SHOW_IN_FOLDER: "vetta:downloads:show-in-folder",
	GET_DEFAULT_DIR: "vetta:downloads:get-default-dir",
	EVENT: "vetta:downloads:event",
} as const;

const IM_CHANNELS = {
	GET_CONFIG: "vetta:im:get-config",
	SET_CONFIG: "vetta:im:set-config",
	GET_STATUS: "vetta:im:get-status",
	SUBSCRIBE_STATUS: "vetta:im:subscribe-status",
	UNSUBSCRIBE_STATUS: "vetta:im:unsubscribe-status",
	STATUS_EVENT: "vetta:im:status-event",
	LOG_EVENT: "vetta:im:log-event",
	TEST_CONNECTION: "vetta:im:test-connection",
	RESTART: "vetta:im:restart",
	GET_RECENT_LOGS: "vetta:im:get-recent-logs",
	GET_PATHS: "vetta:im:get-paths",
	DETECT_LEGACY: "vetta:im:detect-legacy",
	IMPORT_LEGACY: "vetta:im:import-legacy",
	WECHAT_START_BIND: "vetta:im:wechat:start-bind",
	WECHAT_LOGOUT: "vetta:im:wechat:logout",
	WECHAT_SUBSCRIBE: "vetta:im:wechat:subscribe",
	WECHAT_UNSUBSCRIBE: "vetta:im:wechat:unsubscribe",
	WECHAT_BIND_EVENT: "vetta:im:wechat:bind-event",
} as const;

const WEBHOOK_CHANNELS = {
	LIST: "vetta:webhook:list",
	LIST_PROVIDERS: "vetta:webhook:list-providers",
	CREATE: "vetta:webhook:create",
	UPDATE: "vetta:webhook:update",
	DELETE: "vetta:webhook:delete",
	TOGGLE: "vetta:webhook:toggle",
	TEST: "vetta:webhook:test",
	SEND: "vetta:webhook:send",
} as const;

const BATCH_TASKS_CHANNELS = {
	GET_PROJECTS: "vetta:batch-tasks:get-projects",
	CREATE_PROJECT: "vetta:batch-tasks:create-project",
	UPDATE_PROJECT: "vetta:batch-tasks:update-project",
	DELETE_PROJECT: "vetta:batch-tasks:delete-project",
	RUN_TASK: "vetta:batch-tasks:run-task",
	RETRY_TASK: "vetta:batch-tasks:retry-task",
	STOP_TASK: "vetta:batch-tasks:stop-task",
	DELETE_TASK: "vetta:batch-tasks:delete-task",
	BATCH_DELETE: "vetta:batch-tasks:batch-delete",
	BATCH_START: "vetta:batch-tasks:batch-start",
	BATCH_STOP: "vetta:batch-tasks:batch-stop",
	BATCH_RESET: "vetta:batch-tasks:batch-reset",
	BATCH_RESET_FAILED: "vetta:batch-tasks:batch-reset-failed",
	DELETE_SESSION: "vetta:batch-tasks:delete-session",
	RESUME_TASK: "vetta:batch-tasks:resume-task",
	RESUME_TASK_WITH_TEXT: "vetta:batch-tasks:resume-task-with-text",
	EVENT: "vetta:batch-tasks:event",
} as const;

const api: DesktopApi = {
	dialog: {
		selectFolder: async () => ipcRenderer.invoke("vetta:dialog:select-folder"),
		selectFolders: async () => ipcRenderer.invoke("vetta:dialog:select-folders"),
		selectImages: async () => ipcRenderer.invoke("vetta:dialog:select-images"),
		selectFiles: async (defaultPath) => ipcRenderer.invoke("vetta:dialog:select-files", defaultPath),
	},
	theme: {
		set: async (mode) => ipcRenderer.invoke("vetta:theme:set", mode),
		getNative: async () => ipcRenderer.invoke("vetta:theme:get-native"),
		onNativeChanged: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, info: { shouldUseDarkColors: boolean }) => {
				handler(info);
			};
			ipcRenderer.on("vetta:theme:native-changed", listener);
			return () => {
				ipcRenderer.removeListener("vetta:theme:native-changed", listener);
			};
		},
	},
	fs: {
		readDir: async (dirPath) => ipcRenderer.invoke("vetta:fs:read-dir", dirPath),
		readFile: async (filePath) => ipcRenderer.invoke("vetta:fs:read-file", filePath),
		writeFile: async (filePath, content) => ipcRenderer.invoke("vetta:fs:write-file", filePath, content),
		stat: async (filePath) => ipcRenderer.invoke("vetta:fs:stat", filePath),
		rename: async (oldPath, newPath) => ipcRenderer.invoke("vetta:fs:rename", oldPath, newPath),
		delete: async (targetPath) => ipcRenderer.invoke("vetta:fs:delete", targetPath),
		move: async (sourcePath, destDir) => ipcRenderer.invoke("vetta:fs:move", sourcePath, destDir),
		createDirectory: async (dirPath) => ipcRenderer.invoke("vetta:fs:create-directory", dirPath),
		listSubDirs: async (dirPath) => ipcRenderer.invoke("vetta:fs:list-sub-dirs", dirPath),
		watchDir: async (dirPath) => ipcRenderer.invoke("vetta:fs:watch-dir", dirPath),
		unwatchDir: async (dirPath) => ipcRenderer.invoke("vetta:fs:unwatch-dir", dirPath),
		onDirChanged: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, dirPath: string) => {
				handler(dirPath);
			};
			ipcRenderer.on("vetta:fs:dir-changed", listener);
			return () => {
				ipcRenderer.removeListener("vetta:fs:dir-changed", listener);
			};
		},
		pathForFile: (file: File) => webUtils.getPathForFile(file),
	},
	skills: {
		list: async () => ipcRenderer.invoke("vetta:skills:list"),
		installFromMarket: async (
			name: string,
			archiveBuffer: ArrayBuffer,
			type: "skill" | "scene",
			meta?: { alias?: string; marketDescription?: string },
		) => ipcRenderer.invoke("vetta:skills:install-from-market", name, archiveBuffer, type, meta),
		importCustom: async (archiveBuffer: ArrayBuffer) =>
			ipcRenderer.invoke("vetta:skills:import-custom", archiveBuffer),
		uninstall: async (name: string, type: "skill" | "scene") =>
			ipcRenderer.invoke("vetta:skills:uninstall", name, type),
		toggle: async (name: string) => ipcRenderer.invoke("vetta:skills:toggle", name),
		getMarketManifest: async () => ipcRenderer.invoke("vetta:skills:get-market-manifest"),
		getSkillMdPath: async (name: string, type: "skill" | "scene") =>
			ipcRenderer.invoke("vetta:skills:get-skill-md-path", name, type),
	},
	config: {
		get: async () => ipcRenderer.invoke("vetta:config:get"),
		set: async (config) => ipcRenderer.invoke("vetta:config:set", config),
	},
	models: {
		get: async () => ipcRenderer.invoke("vetta:models:get"),
		set: async (config) => ipcRenderer.invoke("vetta:models:set", config),
		fetchRemote: async () => ipcRenderer.invoke("vetta:models:fetch-remote"),
	},
	mcp: {
		get: async () => ipcRenderer.invoke("vetta:mcp:get"),
		set: async (config) => ipcRenderer.invoke("vetta:mcp:set", config),
	},
	settings: {
		getServerUrl: async () => ipcRenderer.invoke("vetta:settings:get-server-url"),
		getServerToken: async () => ipcRenderer.invoke("vetta:settings:get-server-token"),
		setServerToken: async (token) => ipcRenderer.invoke("vetta:settings:set-server-token", token),
		getServerRefreshToken: async () => ipcRenderer.invoke("vetta:settings:get-server-refresh-token"),
		setServerRefreshToken: async (token) => ipcRenderer.invoke("vetta:settings:set-server-refresh-token", token),
	},
	credits: {
		getBalance: async () => ipcRenderer.invoke("vetta:credits:balance"),
	},
	shell: {
		showInFolder: async (fullPath) => ipcRenderer.invoke("vetta:shell:show-in-folder", fullPath),
		showItemInFolder: async (fullPath) => ipcRenderer.invoke("vetta:shell:show-item-in-folder", fullPath),
	},
	window: {
		minimize: async () => ipcRenderer.invoke("vetta:window:minimize"),
		maximize: async () => ipcRenderer.invoke("vetta:window:maximize"),
		close: async () => ipcRenderer.invoke("vetta:window:close"),
		isMaximized: async () => ipcRenderer.invoke("vetta:window:is-maximized"),
	},
	auth: {
		openExternal: async (url) => ipcRenderer.invoke("vetta:auth:open-external", url),
		onOAuthCallback: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, data: { token: string; refreshToken?: string }) => {
				handler(data);
			};
			ipcRenderer.on("vetta:auth:oauth-callback", listener);
			return () => {
				ipcRenderer.removeListener("vetta:auth:oauth-callback", listener);
			};
		},
		onUnauthorized: (handler) => {
			const listener = () => handler();
			ipcRenderer.on("vetta:auth:unauthorized", listener);
			return () => {
				ipcRenderer.removeListener("vetta:auth:unauthorized", listener);
			};
		},
		onTokenRefreshed: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, data: { accessToken: string; refreshToken: string }) =>
				handler(data);
			ipcRenderer.on("vetta:auth:token-refreshed", listener);
			return () => {
				ipcRenderer.removeListener("vetta:auth:token-refreshed", listener);
			};
		},
	},
	updater: {
		check: async () => ipcRenderer.invoke("vetta:updater:check"),
		getState: async () => ipcRenderer.invoke("vetta:updater:get-state"),
		getCurrentVersion: async () => ipcRenderer.invoke("vetta:updater:get-current-version"),
		download: async () => ipcRenderer.invoke("vetta:updater:download"),
		install: async () => ipcRenderer.invoke("vetta:updater:install"),
		dismiss: async () => ipcRenderer.invoke("vetta:updater:dismiss"),
		cancel: async () => ipcRenderer.invoke("vetta:updater:cancel"),
		onStateChanged: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, state: unknown) => {
				handler(state as Parameters<typeof handler>[0]);
			};
			ipcRenderer.on("vetta:updater:state", listener);
			return () => {
				ipcRenderer.removeListener("vetta:updater:state", listener);
			};
		},
	},
	tray: {
		setQuitBehavior: async (hideToTray) => ipcRenderer.invoke("vetta:tray:set-quit-behavior", hideToTray),
		getQuitBehavior: async () => ipcRenderer.invoke("vetta:tray:get-quit-behavior"),
		setTooltip: async (text) => ipcRenderer.invoke("vetta:tray:set-tooltip", text),
	},
	scheduler: {
		getTasks: () => ipcRenderer.invoke(SCHEDULER_CHANNELS.GET_TASKS),
		createTask: (task) => ipcRenderer.invoke(SCHEDULER_CHANNELS.CREATE_TASK, task),
		updateTask: (id, patch) => ipcRenderer.invoke(SCHEDULER_CHANNELS.UPDATE_TASK, id, patch),
		deleteTask: (id) => ipcRenderer.invoke(SCHEDULER_CHANNELS.DELETE_TASK, id),
		toggleTask: (id) => ipcRenderer.invoke(SCHEDULER_CHANNELS.TOGGLE_TASK, id),
		disableTask: (id) => ipcRenderer.invoke(SCHEDULER_CHANNELS.DISABLE_TASK, id),
		getRecords: (taskId) => ipcRenderer.invoke(SCHEDULER_CHANNELS.GET_RECORDS, taskId),
		runTaskNow: (id) => ipcRenderer.invoke(SCHEDULER_CHANNELS.RUN_NOW, id),
		abortTask: (id) => ipcRenderer.invoke(SCHEDULER_CHANNELS.ABORT, id),
		onTaskEvent: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, data: unknown) => {
				handler(data as Parameters<typeof handler>[0]);
			};
			ipcRenderer.on(SCHEDULER_CHANNELS.EVENT, listener);
			return () => {
				ipcRenderer.removeListener(SCHEDULER_CHANNELS.EVENT, listener);
			};
		},
	},
	flowing: {
		packFiles: async (projectDir, filePaths, message, senderName) =>
			ipcRenderer.invoke("vetta:flowing:pack-files", projectDir, filePaths, message, senderName),
		unpackFiles: async (zipBuffer, destDir) => ipcRenderer.invoke("vetta:flowing:unpack-files", zipBuffer, destDir),
		readMeta: async (projectDir) => ipcRenderer.invoke("vetta:flowing:read-meta", projectDir),
		writeMeta: async (projectDir, meta) => ipcRenderer.invoke("vetta:flowing:write-meta", projectDir, meta),
		findProjectByFlowingId: async (flowingId, projects) =>
			ipcRenderer.invoke("vetta:flowing:find-project", flowingId, projects),
	},
	batchTasks: {
		getProjects: () => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.GET_PROJECTS),
		createProject: (data) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.CREATE_PROJECT, data),
		updateProject: (projectId, data) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.UPDATE_PROJECT, projectId, data),
		deleteProject: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.DELETE_PROJECT, projectId),
		runTask: (projectId, taskId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.RUN_TASK, projectId, taskId),
		retryTask: (projectId, taskId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.RETRY_TASK, projectId, taskId),
		stopTask: (projectId, taskId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.STOP_TASK, projectId, taskId),
		deleteTask: (projectId, taskId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.DELETE_TASK, projectId, taskId),
		batchDelete: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_DELETE, projectId),
		batchStart: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_START, projectId),
		batchStop: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_STOP, projectId),
		batchReset: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_RESET, projectId),
		batchResetFailed: (projectId, taskIds) =>
			ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_RESET_FAILED, projectId, taskIds),
		deleteSession: (sessionPath) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.DELETE_SESSION, sessionPath),
		resumeTask: (projectId, taskId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.RESUME_TASK, projectId, taskId),
		resumeTaskWithText: (projectId, taskId, text) =>
			ipcRenderer.invoke(BATCH_TASKS_CHANNELS.RESUME_TASK_WITH_TEXT, projectId, taskId, text),
		onTaskEvent: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, data: unknown) => {
				handler(data as Parameters<typeof handler>[0]);
			};
			ipcRenderer.on(BATCH_TASKS_CHANNELS.EVENT, listener);
			return () => {
				ipcRenderer.removeListener(BATCH_TASKS_CHANNELS.EVENT, listener);
			};
		},
	},
	downloads: {
		start: async (params) => ipcRenderer.invoke(DOWNLOAD_CHANNELS.START, params),
		pause: async (id) => ipcRenderer.invoke(DOWNLOAD_CHANNELS.PAUSE, id),
		resume: async (id) => ipcRenderer.invoke(DOWNLOAD_CHANNELS.RESUME, id),
		cancel: async (id) => ipcRenderer.invoke(DOWNLOAD_CHANNELS.CANCEL, id),
		remove: async (id, deleteFile) => ipcRenderer.invoke(DOWNLOAD_CHANNELS.REMOVE, id, deleteFile),
		list: async () => ipcRenderer.invoke(DOWNLOAD_CHANNELS.LIST),
		openFile: async (id) => ipcRenderer.invoke(DOWNLOAD_CHANNELS.OPEN_FILE, id),
		showInFolder: async (id) => ipcRenderer.invoke(DOWNLOAD_CHANNELS.SHOW_IN_FOLDER, id),
		getDefaultDir: async () => ipcRenderer.invoke(DOWNLOAD_CHANNELS.GET_DEFAULT_DIR),
		onEvent: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, data: unknown) => {
				handler(data as Parameters<typeof handler>[0]);
			};
			ipcRenderer.on(DOWNLOAD_CHANNELS.EVENT, listener);
			return () => {
				ipcRenderer.removeListener(DOWNLOAD_CHANNELS.EVENT, listener);
			};
		},
	},
	im: {
		getConfig: async () => ipcRenderer.invoke(IM_CHANNELS.GET_CONFIG),
		setConfig: async (payload) => ipcRenderer.invoke(IM_CHANNELS.SET_CONFIG, payload),
		getStatus: async () => ipcRenderer.invoke(IM_CHANNELS.GET_STATUS),
		subscribeStatus: async (statusHandler, logHandler) => {
			const { subscriptionId } = (await ipcRenderer.invoke(IM_CHANNELS.SUBSCRIBE_STATUS)) as {
				subscriptionId: string;
			};
			const statusListener = (_event: Electron.IpcRendererEvent, incomingId: string, snapshot: unknown) => {
				if (incomingId === subscriptionId) {
					statusHandler(snapshot as Parameters<typeof statusHandler>[0]);
				}
			};
			const logListener = (_event: Electron.IpcRendererEvent, incomingId: string, log: unknown) => {
				if (incomingId === subscriptionId) {
					logHandler(log as Parameters<typeof logHandler>[0]);
				}
			};
			ipcRenderer.on(IM_CHANNELS.STATUS_EVENT, statusListener);
			ipcRenderer.on(IM_CHANNELS.LOG_EVENT, logListener);
			return () => {
				ipcRenderer.removeListener(IM_CHANNELS.STATUS_EVENT, statusListener);
				ipcRenderer.removeListener(IM_CHANNELS.LOG_EVENT, logListener);
				void ipcRenderer.invoke(IM_CHANNELS.UNSUBSCRIBE_STATUS, subscriptionId);
			};
		},
		testConnection: async (payload) => ipcRenderer.invoke(IM_CHANNELS.TEST_CONNECTION, payload),
		restart: async () => ipcRenderer.invoke(IM_CHANNELS.RESTART),
		getRecentLogs: async () => ipcRenderer.invoke(IM_CHANNELS.GET_RECENT_LOGS),
		getPaths: async () => ipcRenderer.invoke(IM_CHANNELS.GET_PATHS),
		detectLegacy: async () => ipcRenderer.invoke(IM_CHANNELS.DETECT_LEGACY),
		importLegacy: async (detection) => ipcRenderer.invoke(IM_CHANNELS.IMPORT_LEGACY, detection),
		wechat: {
			startBind: async () => ipcRenderer.invoke(IM_CHANNELS.WECHAT_START_BIND),
			logout: async () => ipcRenderer.invoke(IM_CHANNELS.WECHAT_LOGOUT),
			subscribeBind: async (handler) => {
				const { subscriptionId } = (await ipcRenderer.invoke(IM_CHANNELS.WECHAT_SUBSCRIBE)) as {
					subscriptionId: string;
				};
				const listener = (_event: Electron.IpcRendererEvent, incomingId: string, bindEvent: unknown) => {
					if (incomingId === subscriptionId) {
						handler(bindEvent as Parameters<typeof handler>[0]);
					}
				};
				ipcRenderer.on(IM_CHANNELS.WECHAT_BIND_EVENT, listener);
				return () => {
					ipcRenderer.removeListener(IM_CHANNELS.WECHAT_BIND_EVENT, listener);
					void ipcRenderer.invoke(IM_CHANNELS.WECHAT_UNSUBSCRIBE, subscriptionId);
				};
			},
		},
	},
	debug: {
		parseToolCalls: async (sessionPath) => ipcRenderer.invoke("vetta:debug:parse-tool-calls", sessionPath),
		listRequestFiles: async (projectName, sessionId) =>
			ipcRenderer.invoke("vetta:debug:list-request-files", projectName, sessionId),
		clearDebugDir: async () => ipcRenderer.invoke("vetta:debug:clear-debug-dir"),
	},
	project: {
		export: async (projectDir) => ipcRenderer.invoke("vetta:project:export", projectDir),
		import: async () => ipcRenderer.invoke("vetta:project:import"),
	},
	webhook: {
		list: async () => ipcRenderer.invoke(WEBHOOK_CHANNELS.LIST),
		listProviders: async () => ipcRenderer.invoke(WEBHOOK_CHANNELS.LIST_PROVIDERS),
		create: async (input) => ipcRenderer.invoke(WEBHOOK_CHANNELS.CREATE, input),
		update: async (id, patch) => ipcRenderer.invoke(WEBHOOK_CHANNELS.UPDATE, id, patch),
		delete: async (id) => ipcRenderer.invoke(WEBHOOK_CHANNELS.DELETE, id),
		toggle: async (id, enabled) => ipcRenderer.invoke(WEBHOOK_CHANNELS.TOGGLE, id, enabled),
		test: async (id) => ipcRenderer.invoke(WEBHOOK_CHANNELS.TEST, id),
		send: async (id, message) => ipcRenderer.invoke(WEBHOOK_CHANNELS.SEND, id, message),
	},
	session: {
		create: async (config) => ipcRenderer.invoke(CHANNELS.CREATE, config),
		listProjects: async () => ipcRenderer.invoke(CHANNELS.LIST_PROJECTS),
		listSessions: async (cwd) => ipcRenderer.invoke(CHANNELS.LIST_SESSIONS, cwd),
		prompt: async (sessionId, request) => ipcRenderer.invoke(CHANNELS.PROMPT, sessionId, request),
		continue: async (sessionId) => ipcRenderer.invoke(CHANNELS.CONTINUE, sessionId),
		abort: async (sessionId) => ipcRenderer.invoke(CHANNELS.ABORT, sessionId),
		clearTodos: async (sessionId) => ipcRenderer.invoke(CHANNELS.CLEAR_TODOS, sessionId),
		subscribe: async (sessionId, handler) => {
			const { subscriptionId } = await ipcRenderer.invoke(CHANNELS.SUBSCRIBE, sessionId);
			const listener = (_event: Electron.IpcRendererEvent, incomingId: string, runtimeEvent: unknown) => {
				if (incomingId === subscriptionId) {
					handler(runtimeEvent as Parameters<typeof handler>[0]);
				}
			};
			ipcRenderer.on(CHANNELS.EVENT, listener);
			return () => {
				ipcRenderer.removeListener(CHANNELS.EVENT, listener);
				void ipcRenderer.invoke(CHANNELS.UNSUBSCRIBE, subscriptionId);
			};
		},
		onConfirmationRequest: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, request: unknown) => {
				handler(request as Parameters<typeof handler>[0]);
			};
			ipcRenderer.on(CHANNELS.CONFIRM_REQUEST, listener);
			return () => {
				ipcRenderer.removeListener(CHANNELS.CONFIRM_REQUEST, listener);
			};
		},
		respondToConfirmation: async (requestId, confirmed) =>
			ipcRenderer.invoke(CHANNELS.CONFIRM_RESPONSE, requestId, confirmed),
		onSandboxGrantRequest: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, request: unknown) => {
				handler(request as Parameters<typeof handler>[0]);
			};
			ipcRenderer.on(CHANNELS.SANDBOX_GRANT_REQUEST, listener);
			return () => {
				ipcRenderer.removeListener(CHANNELS.SANDBOX_GRANT_REQUEST, listener);
			};
		},
		respondToSandboxGrant: async (requestId, decision) =>
			ipcRenderer.invoke(CHANNELS.SANDBOX_GRANT_RESPONSE, requestId, decision),
		listSandboxGrants: async (sessionId) => ipcRenderer.invoke(CHANNELS.SANDBOX_GRANTS_LIST, sessionId),
		revokeSandboxGrant: async (sessionId, grantId) =>
			ipcRenderer.invoke(CHANNELS.SANDBOX_GRANTS_REVOKE, sessionId, grantId),
		revokeAllSandboxGrants: async (sessionId) => ipcRenderer.invoke(CHANNELS.SANDBOX_GRANTS_REVOKE_ALL, sessionId),
		getSessionPath: async (sessionId) => ipcRenderer.invoke("vetta:session:get-session-path", sessionId),
		updateSettings: async (sessionId, partialSettings) =>
			ipcRenderer.invoke(CHANNELS.UPDATE_SETTINGS, sessionId, partialSettings),
		setExecutionMode: async (sessionId, mode) => ipcRenderer.invoke(CHANNELS.SET_EXECUTION_MODE, sessionId, mode),
		setGlobalExecutionMode: async (mode) => ipcRenderer.invoke(CHANNELS.SET_GLOBAL_EXECUTION_MODE, mode),
		setGlobalThinkingLevel: async (level) => ipcRenderer.invoke(CHANNELS.SET_GLOBAL_THINKING, level),
		getGlobalThinkingLevel: async () => ipcRenderer.invoke(CHANNELS.GET_GLOBAL_THINKING),
		getState: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_STATE, sessionId),
		getMessages: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_MESSAGES, sessionId),
		getFullHistory: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_FULL_HISTORY, sessionId),
		delete: async (sessionPath) => ipcRenderer.invoke(CHANNELS.DELETE, sessionPath),
		rename: async (sessionPath, name) => ipcRenderer.invoke(CHANNELS.RENAME, sessionPath, name),
		autoTitle: async (sessionId, userText, assistantText) =>
			ipcRenderer.invoke(CHANNELS.AUTO_TITLE, sessionId, userText, assistantText),
		dispose: async (sessionId) => ipcRenderer.invoke(CHANNELS.DISPOSE, sessionId),
		listRunning: async () => ipcRenderer.invoke(CHANNELS.LIST_RUNNING),
		onRunningChanged: (handler) => {
			const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
				handler(payload as { sessionPath: string; running: boolean });
			};
			ipcRenderer.on(CHANNELS.RUNNING_CHANGED, listener);
			return () => {
				ipcRenderer.removeListener(CHANNELS.RUNNING_CHANGED, listener);
			};
		},
		clearDefaultConversation: async () => ipcRenderer.invoke(CHANNELS.CLEAR_DEFAULT_CONVERSATION),
	},
};

contextBridge.exposeInMainWorld("vetta", api);

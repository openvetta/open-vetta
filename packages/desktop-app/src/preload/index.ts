import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "./api.js";

const CHANNELS = {
	CREATE: "vetta:session:create",
	LIST_PROJECTS: "vetta:session:list-projects",
	LIST_SESSIONS: "vetta:session:list-sessions",
	PROMPT: "vetta:session:prompt",
	CONTINUE: "vetta:session:continue",
	ABORT: "vetta:session:abort",
	SUBSCRIBE: "vetta:session:subscribe",
	UNSUBSCRIBE: "vetta:session:unsubscribe",
	UPDATE_SETTINGS: "vetta:session:update-settings",
	GET_STATE: "vetta:session:get-state",
	GET_MESSAGES: "vetta:session:get-messages",
	GET_FULL_HISTORY: "vetta:session:get-full-history",
	SET_GLOBAL_THINKING: "vetta:session:set-global-thinking-level",
	GET_GLOBAL_THINKING: "vetta:session:get-global-thinking-level",
	DELETE: "vetta:session:delete",
	RENAME: "vetta:session:rename",
	DISPOSE: "vetta:session:dispose",
	EVENT: "vetta:session:event",
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

const BATCH_TASKS_CHANNELS = {
	GET_PROJECTS: "vetta:batch-tasks:get-projects",
	CREATE_PROJECT: "vetta:batch-tasks:create-project",
	UPDATE_PROJECT: "vetta:batch-tasks:update-project",
	DELETE_PROJECT: "vetta:batch-tasks:delete-project",
	RUN_TASK: "vetta:batch-tasks:run-task",
	PAUSE_TASK: "vetta:batch-tasks:pause-task",
	RESUME_TASK: "vetta:batch-tasks:resume-task",
	DELETE_TASK: "vetta:batch-tasks:delete-task",
	BATCH_RETRY_FAILED: "vetta:batch-tasks:batch-retry-failed",
	BATCH_PAUSE: "vetta:batch-tasks:batch-pause",
	BATCH_RESUME: "vetta:batch-tasks:batch-resume",
	BATCH_DELETE: "vetta:batch-tasks:batch-delete",
	BATCH_RUN_NEVER_EXECUTED: "vetta:batch-tasks:batch-run-never-executed",
	BATCH_RESTART_ALL: "vetta:batch-tasks:batch-restart-all",
	DELETE_SESSION: "vetta:batch-tasks:delete-session",
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
	},
	skills: {
		list: async () => ipcRenderer.invoke("vetta:skills:list"),
		installFromMarket: async (
			name: string,
			archiveBuffer: ArrayBuffer,
			type: "skill" | "scene",
			meta?: { alias?: string; marketDescription?: string },
		) => ipcRenderer.invoke("vetta:skills:install-from-market", name, archiveBuffer, type, meta),
		uninstall: async (name: string, type: "skill" | "scene") =>
			ipcRenderer.invoke("vetta:skills:uninstall", name, type),
		toggle: async (name: string) => ipcRenderer.invoke("vetta:skills:toggle", name),
		getMarketManifest: async () => ipcRenderer.invoke("vetta:skills:get-market-manifest"),
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
	},
	credits: {
		getBalance: async () => ipcRenderer.invoke("vetta:credits:balance"),
	},
	shell: {
		showInFolder: async (fullPath) => ipcRenderer.invoke("vetta:shell:show-in-folder", fullPath),
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
			const listener = (_event: Electron.IpcRendererEvent, data: { token: string }) => {
				handler(data);
			};
			ipcRenderer.on("vetta:auth:oauth-callback", listener);
			return () => {
				ipcRenderer.removeListener("vetta:auth:oauth-callback", listener);
			};
		},
	},
	updater: {
		check: async () => ipcRenderer.invoke("vetta:updater:check"),
		getCurrentVersion: async () => ipcRenderer.invoke("vetta:updater:get-current-version"),
		download: async (url) => ipcRenderer.invoke("vetta:updater:download", url),
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
		pauseTask: (projectId, taskId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.PAUSE_TASK, projectId, taskId),
		resumeTask: (projectId, taskId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.RESUME_TASK, projectId, taskId),
		deleteTask: (projectId, taskId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.DELETE_TASK, projectId, taskId),
		batchRetryFailed: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_RETRY_FAILED, projectId),
		batchPause: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_PAUSE, projectId),
		batchResume: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_RESUME, projectId),
		batchDelete: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_DELETE, projectId),
		batchRunNeverExecuted: (projectId) =>
			ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_RUN_NEVER_EXECUTED, projectId),
		batchRestartAll: (projectId) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.BATCH_RESTART_ALL, projectId),
		deleteSession: (sessionPath) => ipcRenderer.invoke(BATCH_TASKS_CHANNELS.DELETE_SESSION, sessionPath),
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
	session: {
		create: async (config) => ipcRenderer.invoke(CHANNELS.CREATE, config),
		listProjects: async () => ipcRenderer.invoke(CHANNELS.LIST_PROJECTS),
		listSessions: async (cwd) => ipcRenderer.invoke(CHANNELS.LIST_SESSIONS, cwd),
		prompt: async (sessionId, request) => ipcRenderer.invoke(CHANNELS.PROMPT, sessionId, request),
		continue: async (sessionId) => ipcRenderer.invoke(CHANNELS.CONTINUE, sessionId),
		abort: async (sessionId) => ipcRenderer.invoke(CHANNELS.ABORT, sessionId),
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
		updateSettings: async (sessionId, partialSettings) =>
			ipcRenderer.invoke(CHANNELS.UPDATE_SETTINGS, sessionId, partialSettings),
		setGlobalThinkingLevel: async (level) => ipcRenderer.invoke(CHANNELS.SET_GLOBAL_THINKING, level),
		getGlobalThinkingLevel: async () => ipcRenderer.invoke(CHANNELS.GET_GLOBAL_THINKING),
		getState: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_STATE, sessionId),
		getMessages: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_MESSAGES, sessionId),
		getFullHistory: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_FULL_HISTORY, sessionId),
		delete: async (sessionPath) => ipcRenderer.invoke(CHANNELS.DELETE, sessionPath),
		rename: async (sessionPath, name) => ipcRenderer.invoke(CHANNELS.RENAME, sessionPath, name),
		dispose: async (sessionId) => ipcRenderer.invoke(CHANNELS.DISPOSE, sessionId),
	},
};

contextBridge.exposeInMainWorld("vetta", api);

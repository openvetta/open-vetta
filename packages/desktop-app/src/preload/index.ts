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
	DELETE: "vetta:session:delete",
	RENAME: "vetta:session:rename",
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
	DELETE_SESSION: "vetta:batch-tasks:delete-session",
	EVENT: "vetta:batch-tasks:event",
} as const;

const api: DesktopApi = {
	dialog: {
		selectFolder: async () => ipcRenderer.invoke("vetta:dialog:select-folder"),
		selectFolders: async () => ipcRenderer.invoke("vetta:dialog:select-folders"),
		selectImages: async () => ipcRenderer.invoke("vetta:dialog:select-images"),
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
		rename: async (oldPath, newPath) => ipcRenderer.invoke("vetta:fs:rename", oldPath, newPath),
		delete: async (targetPath) => ipcRenderer.invoke("vetta:fs:delete", targetPath),
		move: async (sourcePath, destDir) => ipcRenderer.invoke("vetta:fs:move", sourcePath, destDir),
		createDirectory: async (dirPath) => ipcRenderer.invoke("vetta:fs:create-directory", dirPath),
		listSubDirs: async (dirPath) => ipcRenderer.invoke("vetta:fs:list-sub-dirs", dirPath),
	},
	skills: {
		list: async () => ipcRenderer.invoke("vetta:skills:list"),
		installFromMarket: async (name: string, archiveBuffer: ArrayBuffer) =>
			ipcRenderer.invoke("vetta:skills:install-from-market", name, archiveBuffer),
		uninstall: async (name: string) => ipcRenderer.invoke("vetta:skills:uninstall", name),
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
		getState: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_STATE, sessionId),
		getMessages: async (sessionId) => ipcRenderer.invoke(CHANNELS.GET_MESSAGES, sessionId),
		delete: async (sessionPath) => ipcRenderer.invoke(CHANNELS.DELETE, sessionPath),
		rename: async (sessionPath, name) => ipcRenderer.invoke(CHANNELS.RENAME, sessionPath, name),
	},
};

contextBridge.exposeInMainWorld("vetta", api);

import type { Message } from "@mariozechner/pi-ai";
import type {
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
	getState(sessionId: string): Promise<SessionStateSnapshot>;
	getMessages(sessionId: string): Promise<Message[]>;
	delete(sessionPath: string): Promise<void>;
	rename(sessionPath: string, name: string): Promise<void>;
}

export interface SelectedImageFile {
	data: string;
	mimeType: string;
	name: string;
}

export interface DesktopDialogApi {
	selectFolder(): Promise<string | null>;
	selectImages(): Promise<SelectedImageFile[]>;
}

export interface DesktopThemeApi {
	set(mode: "light" | "dark" | "system"): Promise<void>;
	getNative(): Promise<{ source: string; shouldUseDarkColors: boolean }>;
	onNativeChanged(handler: (info: { shouldUseDarkColors: boolean }) => void): () => void;
}

export interface SkillInfo {
	name: string;
	description: string;
	source: string;
	type: "skill" | "scene";
}

export interface DesktopSkillsApi {
	list(): Promise<SkillInfo[]>;
}

export interface DesktopConfigData {
	projects: string[];
	archivedProjects: string[];
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

export interface DesktopModelsApi {
	get(): Promise<ModelsConfigData>;
	set(config: ModelsConfigData): Promise<void>;
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
	startedAt: number;
	completedAt: number | null;
	status: "running" | "success" | "failed" | "aborted";
	prompt: string;
	responsePreview: string;
	error?: string;
	durationMs?: number;
}

export interface TaskMessage {
	role: string;
	content: unknown;
	toolCallId?: string;
	toolName?: string;
	isError?: boolean;
}

export type TaskEvent =
	| { type: "task.started"; taskId: string; recordId: string }
	| { type: "task.completed"; taskId: string; recordId: string; status: "success" | "failed" }
	| { type: "task.failed"; taskId: string; error: string }
	| { type: "record.updated"; taskId: string; sessionId: string; status: "success" | "aborted" };

export interface TaskStreamEvent {
	taskId: string;
	sessionId: string;
	type: "message.delta" | "thinking.delta" | "tool.start" | "tool.end" | "toolcall.start" | "session.lifecycle";
	delta?: string;
	toolCallId?: string;
	toolName?: string;
	args?: Record<string, unknown>;
	result?: unknown;
	isError?: boolean;
	phase?: string;
}

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
	getRecordMessages(taskId: string, sessionId: string): Promise<TaskMessage[]>;
	runTaskNow(id: string): Promise<void>;
	abortTask(id: string): Promise<void>;
	onTaskEvent(handler: (event: TaskEvent) => void): () => void;
	onTaskStreamEvent(handler: (event: TaskStreamEvent) => void): () => void;
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
	shell: DesktopShellApi;
	window: DesktopWindowApi;
	auth: DesktopAuthApi;
	tray: DesktopTrayApi;
	scheduler: DesktopSchedulerApi;
}

declare global {
	interface Window {
		vetta: DesktopApi;
	}
}

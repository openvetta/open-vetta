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

export interface DesktopDialogApi {
	selectFolder(): Promise<string | null>;
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
}

declare global {
	interface Window {
		vetta: DesktopApi;
	}
}

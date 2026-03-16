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

export interface DesktopApi {
	session: DesktopSessionApi;
	dialog: DesktopDialogApi;
	theme: DesktopThemeApi;
	fs: DesktopFsApi;
}

declare global {
	interface Window {
		vetta: DesktopApi;
	}
}

import type {
	PromptRequest,
	SessionConfig,
	SessionEvent,
	SessionStateSnapshot,
	SettingsPatch,
} from "@vetta/runtime-core";

export interface DesktopSessionApi {
	create(config?: SessionConfig): Promise<{ sessionId: string }>;
	prompt(sessionId: string, request: PromptRequest): Promise<void>;
	continue(sessionId: string): Promise<void>;
	abort(sessionId: string): Promise<void>;
	subscribe(sessionId: string, handler: (event: SessionEvent) => void): Promise<() => void>;
	updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void>;
	getState(sessionId: string): Promise<SessionStateSnapshot>;
}

export interface DesktopApi {
	session: DesktopSessionApi;
}

declare global {
	interface Window {
		vetta: DesktopApi;
	}
}

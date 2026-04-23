import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { ipcMain, type WebContents } from "electron";
import type { PromptRequest, SessionConfig, SessionEvent, SettingsPatch } from "../../../../runtime-core/src/index.js";
import { type DebugRequestData, writeDebugRequest } from "../debug-writer.js";
import { getSharedRuntime } from "../runtime.js";
import { allowProjectRoot, readConfigSync } from "./fs.js";
import { readSettings, writeSettings } from "./settings.js";

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
	DISPOSE: "vetta:session:dispose",
	GET_FULL_HISTORY: "vetta:session:get-full-history",
	GET_SESSION_PATH: "vetta:session:get-session-path",
	SET_GLOBAL_THINKING: "vetta:session:set-global-thinking-level",
	GET_GLOBAL_THINKING: "vetta:session:get-global-thinking-level",
	EVENT: "vetta:session:event",
} as const;

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

function assertPromptRequest(value: unknown): asserts value is PromptRequest {
	if (typeof value !== "object" || value === null) {
		throw new Error("Invalid prompt request");
	}
	const request = value as Record<string, unknown>;
	if (typeof request.text !== "string" || request.text.length === 0) {
		throw new Error("Invalid prompt request text");
	}
	if (
		request.streamingBehavior !== undefined &&
		request.streamingBehavior !== "steer" &&
		request.streamingBehavior !== "followUp"
	) {
		throw new Error("Invalid prompt request streamingBehavior");
	}
	if (request.modelKey !== undefined && (typeof request.modelKey !== "string" || request.modelKey.length === 0)) {
		throw new Error("Invalid prompt request modelKey");
	}
	if (request.images !== undefined) {
		if (!Array.isArray(request.images)) {
			throw new Error("Invalid prompt request images");
		}
		for (const img of request.images as Array<Record<string, unknown>>) {
			if (img.type !== "image" || typeof img.data !== "string" || typeof img.mimeType !== "string") {
				throw new Error("Invalid prompt request image entry");
			}
		}
	}
}

export function registerSessionIpc(webContents: WebContents): () => void {
	const runtime = getSharedRuntime();
	const subscriptionMap = new Map<string, () => void>();
	/** Track session cwd for debug file writing */
	const sessionCwdMap = new Map<string, string>();
	/** Track debug request sequence per session */
	const debugSeqMap = new Map<string, number>();
	/** Track turn start time per session for duration calculation */
	const turnStartMap = new Map<string, number>();

	ipcMain.handle(CHANNELS.CREATE, async (_event, config?: SessionConfig) => {
		if (config?.cwd) allowProjectRoot(config.cwd);
		const result = await runtime.createSession(config);
		if (config?.cwd) {
			sessionCwdMap.set(result.sessionId, config.cwd);
		}
		return result;
	});

	ipcMain.handle(CHANNELS.LIST_PROJECTS, async () => {
		const projects = await runtime.listProjects();
		for (const p of projects) allowProjectRoot(p.cwd);
		return projects;
	});

	ipcMain.handle(CHANNELS.LIST_SESSIONS, async (_event, cwd: unknown) => {
		assertNonEmptyString(cwd, "cwd");
		allowProjectRoot(cwd);
		return runtime.listSessions(cwd);
	});

	ipcMain.handle(CHANNELS.PROMPT, async (_event, sessionId: unknown, request: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertPromptRequest(request);
		const req = request as PromptRequest;
		if (req.images && req.images.length > 0) {
			console.log(
				`[IPC PROMPT] images: ${req.images.length}, first type=${req.images[0].type}, mimeType=${req.images[0].mimeType}, data.length=${req.images[0].data.length}`,
			);
		} else {
			console.log(`[IPC PROMPT] no images in request`);
		}
		await runtime.prompt(sessionId, request);
	});

	ipcMain.handle(CHANNELS.CONTINUE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.continue(sessionId);
	});

	ipcMain.handle(CHANNELS.ABORT, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.abort(sessionId);
	});

	ipcMain.handle(CHANNELS.UPDATE_SETTINGS, async (_event, sessionId: unknown, partialSettings: SettingsPatch) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.updateSettings(sessionId, partialSettings);
	});

	ipcMain.handle(CHANNELS.SET_GLOBAL_THINKING, (_event, level: unknown) => {
		assertNonEmptyString(level, "level");
		// Broadcast to all open sessions
		runtime.updateGlobalThinkingLevel(level as any);
		// Persist to settings.json
		const settings = readSettings();
		settings.defaultThinkingLevel = level;
		writeSettings(settings);
	});

	ipcMain.handle(CHANNELS.GET_GLOBAL_THINKING, () => {
		const settings = readSettings();
		return (settings.defaultThinkingLevel as string) ?? "off";
	});

	ipcMain.handle(CHANNELS.GET_STATE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.getState(sessionId);
	});

	ipcMain.handle(CHANNELS.GET_MESSAGES, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.getMessages(sessionId);
	});

	ipcMain.handle(CHANNELS.GET_FULL_HISTORY, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.getFullHistory(sessionId);
	});

	ipcMain.handle(CHANNELS.DELETE, async (_event, sessionPath: unknown) => {
		assertNonEmptyString(sessionPath, "sessionPath");
		await runtime.deleteSession(sessionPath);
	});

	ipcMain.handle(CHANNELS.RENAME, async (_event, sessionPath: unknown, name: unknown) => {
		assertNonEmptyString(sessionPath, "sessionPath");
		assertNonEmptyString(name, "name");
		await runtime.renameSession(sessionPath, name);
	});

	ipcMain.handle(CHANNELS.DISPOSE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.disposeSession(sessionId);
	});

	ipcMain.handle(CHANNELS.GET_SESSION_PATH, (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.getSessionPath(sessionId);
	});

	ipcMain.handle(CHANNELS.SUBSCRIBE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		const subscriptionId = `${sessionId}:${randomUUID()}`;
		const unsubscribe = runtime.subscribe(sessionId, (runtimeEvent: SessionEvent) => {
			// Debug mode: intercept events for request history recording
			try {
				if (runtimeEvent.type === "session.lifecycle" && runtimeEvent.phase === "turn_start") {
					turnStartMap.set(sessionId, Date.now());
				}
				if (runtimeEvent.type === "message.final" && readConfigSync().debugMode) {
					const cwd = sessionCwdMap.get(sessionId);
					if (cwd) {
						const projectName = basename(cwd);
						const seq = (debugSeqMap.get(sessionId) ?? 0) + 1;
						debugSeqMap.set(sessionId, seq);
						const msg = runtimeEvent.message as Record<string, unknown>;
						const usage = (msg.usage ?? {}) as DebugRequestData["usage"];
						const turnStart = turnStartMap.get(sessionId) ?? Date.now();
						const now = Date.now();
						const data: DebugRequestData = {
							timestamp: now,
							sessionId,
							model: (msg.model as string) ?? "unknown",
							provider: (msg.provider as string) ?? "unknown",
							api: (msg.api as string) ?? "unknown",
							usage,
							stopReason: (msg.stopReason as string) ?? "unknown",
							durationMs: now - turnStart,
							message: msg,
						};
						void writeDebugRequest(projectName, sessionId, data, seq);
					}
				}
			} catch {
				// Debug recording should never break the event pipeline
			}
			webContents.send(CHANNELS.EVENT, subscriptionId, runtimeEvent);
		});
		subscriptionMap.set(subscriptionId, unsubscribe);
		return { subscriptionId };
	});

	ipcMain.handle(CHANNELS.UNSUBSCRIBE, async (_event, subscriptionId: unknown) => {
		assertNonEmptyString(subscriptionId, "subscriptionId");
		const unsubscribe = subscriptionMap.get(subscriptionId);
		if (unsubscribe) {
			unsubscribe();
			subscriptionMap.delete(subscriptionId);
		}
	});

	return () => {
		for (const unsubscribe of subscriptionMap.values()) {
			unsubscribe();
		}
		subscriptionMap.clear();
		// 不在此处 disposeAllSessions：共享 runtime 的 session 可能正被
		// scheduler/batch-tasks 在后台使用。全进程 session 释放由 main.ts
		// 的 before-quit 负责（见 disposeSharedRuntime）。
	};
}

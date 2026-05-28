import { randomUUID } from "node:crypto";
import { type Dirent, type FSWatcher, watch } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ipcMain, type WebContents } from "electron";
import type {
	PromptRequest,
	RuntimeSandboxGrantDecision,
	RuntimeSandboxGrantRequest,
	RuntimeUserConfirmationRequest,
	SessionConfig,
	SessionEvent,
	SessionExecutionMode,
	SettingsPatch,
} from "../../../../runtime-core/src/index.js";
import { type DebugRequestData, writeDebugRequest } from "../debug-writer.js";
import { getSharedRuntime } from "../runtime.js";
import { assertSandboxAvailableForMode } from "../sandbox/capability.js";
import {
	allowProjectRoot,
	DEFAULT_CONVERSATION_CWD,
	DEFAULT_CONVERSATION_SESSION_DIR,
	DEFAULT_IM_CONVERSATION_CWD,
	DEFAULT_IM_CONVERSATION_SESSION_DIR,
	readConfigSync,
	readDesktopConfig,
	writeDesktopConfig,
} from "./fs.js";
import { readSettings, writeSettings } from "./settings.js";

/**
 * 默认「对话」与 IM cwd 的会话都放到 <cwd>/.vetta/sessions（与批量项目一致）。
 * 当请求的 cwd 是这两类之一时自动注入 sessionDir，渲染端无需感知。
 */
function resolveSessionDirForCwd(cwd: string | undefined): string | undefined {
	if (!cwd) return undefined;
	const abs = resolve(cwd);
	if (abs === resolve(DEFAULT_CONVERSATION_CWD)) {
		return DEFAULT_CONVERSATION_SESSION_DIR;
	}
	if (abs === resolve(DEFAULT_IM_CONVERSATION_CWD)) {
		return DEFAULT_IM_CONVERSATION_SESSION_DIR;
	}
	return undefined;
}

/**
 * 递归删除 dir 下内容，但保留 preserve 集合中的文件以及通往它们的祖先目录。
 * 返回 true 表示本目录尚有保留内容（调用方据此判断是否还能整体删除）。
 */
async function rmExceptPreserved(dir: string, preserve: Set<string>): Promise<boolean> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return false;
	}
	let kept = false;
	await Promise.all(
		entries.map(async (entry) => {
			const full = join(dir, entry.name);
			const abs = resolve(full);
			if (preserve.has(abs)) {
				kept = true;
				return;
			}
			if (entry.isDirectory()) {
				const childKept = await rmExceptPreserved(full, preserve);
				if (childKept) {
					kept = true;
				} else {
					await rm(full, { recursive: true, force: true });
				}
			} else {
				await rm(full, { force: true });
			}
		}),
	);
	return kept;
}

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
	DELETE: "vetta:session:delete",
	RENAME: "vetta:session:rename",
	AUTO_TITLE: "vetta:session:auto-title",
	DISPOSE: "vetta:session:dispose",
	GET_FULL_HISTORY: "vetta:session:get-full-history",
	GET_SESSION_PATH: "vetta:session:get-session-path",
	SET_GLOBAL_THINKING: "vetta:session:set-global-thinking-level",
	GET_GLOBAL_THINKING: "vetta:session:get-global-thinking-level",
	EVENT: "vetta:session:event",
	CONFIRM_REQUEST: "vetta:session:confirm-request",
	CONFIRM_RESPONSE: "vetta:session:confirm-response",
	SANDBOX_GRANT_REQUEST: "vetta:session:sandbox-grant-request",
	SANDBOX_GRANT_RESPONSE: "vetta:session:sandbox-grant-response",
	SANDBOX_GRANTS_LIST: "vetta:session:sandbox-grants-list",
	SANDBOX_GRANTS_REVOKE: "vetta:session:sandbox-grants-revoke",
	SANDBOX_GRANTS_REVOKE_ALL: "vetta:session:sandbox-grants-revoke-all",
	LIST_RUNNING: "vetta:session:list-running",
	RUNNING_CHANGED: "vetta:session:running-changed",
	CLEAR_DEFAULT_CONVERSATION: "vetta:session:clear-default-conversation",
	CLEAR_DEFAULT_ARTIFACTS: "vetta:session:clear-default-artifacts",
	// Read-only viewer for sessions we don't want to (or can't) take the
	// write lock on — currently IM sessions, see ADR-0004. The viewer
	// reads the .jsonl directly and tails fs.watch for new entries.
	VIEWER_OPEN: "vetta:session:viewer-open",
	VIEWER_SUBSCRIBE: "vetta:session:viewer-subscribe",
	VIEWER_UNSUBSCRIBE: "vetta:session:viewer-unsubscribe",
	VIEWER_EVENT: "vetta:session:viewer-event",
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

function assertExecutionMode(value: unknown): void {
	if (value === undefined) return;
	if (value !== "sandbox" && value !== "full-access") {
		throw new Error("Invalid executionMode");
	}
}

export function registerSessionIpc(webContents: WebContents): () => void {
	const resolveDefaultExecutionMode = async (): Promise<SessionExecutionMode> => {
		const config = await readDesktopConfig();
		return config.defaultExecutionMode;
	};

	const runtime = getSharedRuntime();
	const subscriptionMap = new Map<string, () => void>();
	const confirmationMap = new Map<string, (confirmed: boolean) => void>();
	const sandboxGrantMap = new Map<string, (decision: RuntimeSandboxGrantDecision) => void>();
	/** Track session cwd for debug file writing */
	const sessionCwdMap = new Map<string, string>();
	/** Track debug request sequence per session */
	const debugSeqMap = new Map<string, number>();
	/** Track turn start time per session for duration calculation */
	const turnStartMap = new Map<string, number>();

	runtime.setUserConfirmationHandler((request: RuntimeUserConfirmationRequest, signal?: AbortSignal) => {
		if (webContents.isDestroyed()) return Promise.resolve(false);
		return new Promise<boolean>((resolve) => {
			const finish = (confirmed: boolean): void => {
				confirmationMap.delete(request.requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				resolve(confirmed);
			};
			const onAbort = (): void => finish(false);
			if (signal?.aborted) {
				resolve(false);
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			confirmationMap.set(request.requestId, finish);
			webContents.send(CHANNELS.CONFIRM_REQUEST, request);
		});
	});

	runtime.setUserSandboxGrantHandler((request: RuntimeSandboxGrantRequest, signal?: AbortSignal) => {
		if (webContents.isDestroyed()) return Promise.resolve<RuntimeSandboxGrantDecision>("deny");
		return new Promise<RuntimeSandboxGrantDecision>((resolve) => {
			const finish = (decision: RuntimeSandboxGrantDecision): void => {
				sandboxGrantMap.delete(request.requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				resolve(decision);
			};
			const onAbort = (): void => finish("deny");
			if (signal?.aborted) {
				resolve("deny");
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			sandboxGrantMap.set(request.requestId, finish);
			webContents.send(CHANNELS.SANDBOX_GRANT_REQUEST, request);
		});
	});

	ipcMain.handle(CHANNELS.CREATE, async (_event, config?: SessionConfig) => {
		if (config?.cwd) allowProjectRoot(config.cwd);
		assertExecutionMode(config?.executionMode);
		await assertSandboxAvailableForMode(config?.executionMode, resolveDefaultExecutionMode);
		// 默认项目：缺省把 session 落到 <cwd>/.vetta/sessions（与批量项目一致）。
		const injectedSessionDir = config?.sessionDir ?? resolveSessionDirForCwd(config?.cwd);
		const effectiveConfig: SessionConfig | undefined = injectedSessionDir
			? { ...(config ?? {}), sessionDir: injectedSessionDir }
			: config;
		const result = await runtime.createSession(effectiveConfig);
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
		const sessionDir = resolveSessionDirForCwd(cwd);
		return runtime.listSessions(cwd, sessionDir);
	});

	ipcMain.handle(CHANNELS.PROMPT, async (_event, sessionId: unknown, request: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertPromptRequest(request);
		const req = request as PromptRequest;
		console.log(
			`[session ipc] prompt session=${sessionId} textLength=${req.text.length} images=${req.images?.length ?? 0} streamingBehavior=${req.streamingBehavior ?? "default"}`,
		);
		if (req.images && req.images.length > 0) {
			console.log(
				`[IPC PROMPT] images: ${req.images.length}, first type=${req.images[0].type}, mimeType=${req.images[0].mimeType}, data.length=${req.images[0].data.length}`,
			);
		} else {
			console.log(`[IPC PROMPT] no images in request`);
		}
		await runtime.prompt(sessionId, request);
		console.log(`[session ipc] prompt dispatched session=${sessionId}`);
	});

	ipcMain.handle(CHANNELS.CONTINUE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.continue(sessionId);
	});

	ipcMain.handle(CHANNELS.ABORT, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.abort(sessionId);
	});

	ipcMain.handle(CHANNELS.CLEAR_TODOS, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.clearTodos(sessionId);
	});

	ipcMain.handle(CHANNELS.UPDATE_SETTINGS, async (_event, sessionId: unknown, partialSettings: SettingsPatch) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.updateSettings(sessionId, partialSettings);
	});
	ipcMain.handle(CHANNELS.SET_EXECUTION_MODE, async (_event, sessionId: unknown, mode: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertExecutionMode(mode);
		await assertSandboxAvailableForMode(mode as SessionExecutionMode, resolveDefaultExecutionMode);
		await runtime.setExecutionMode(sessionId, mode as SessionExecutionMode);
	});

	ipcMain.handle(CHANNELS.SET_GLOBAL_EXECUTION_MODE, async (_event, mode: unknown) => {
		assertExecutionMode(mode);
		await assertSandboxAvailableForMode(mode as SessionExecutionMode, resolveDefaultExecutionMode);
		const settings = await readDesktopConfig();
		settings.defaultExecutionMode = mode as SessionExecutionMode;
		await writeDesktopConfig(settings);
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

	ipcMain.handle(
		CHANNELS.AUTO_TITLE,
		async (_event, sessionId: unknown, userText: unknown, assistantText: unknown): Promise<string | null> => {
			assertNonEmptyString(sessionId, "sessionId");
			if (typeof userText !== "string" || typeof assistantText !== "string") {
				throw new Error("Invalid auto-title payload");
			}
			if (userText.trim().length === 0 && assistantText.trim().length === 0) return null;
			return runtime.autoTitleSession(sessionId, userText, assistantText);
		},
	);

	ipcMain.handle(CHANNELS.DISPOSE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.disposeSession(sessionId);
	});

	ipcMain.handle(CHANNELS.GET_SESSION_PATH, (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.getSessionPath(sessionId);
	});

	ipcMain.handle(CHANNELS.LIST_RUNNING, () => runtime.getRunningSessionPaths());

	ipcMain.handle(CHANNELS.CLEAR_DEFAULT_CONVERSATION, async (_event, scope: unknown) => {
		// 物理分家后（ADR-0005）每个 scope 对应一个独立 cwd，互不干扰：
		// - "conversation"：清桌面「对话」cwd 下 .vetta/sessions 内的全部会话（保留产物）
		// - "claw"：清 IM cwd 下 .vetta/sessions 内的全部会话（保留产物）
		if (scope !== "conversation" && scope !== "claw") {
			throw new Error("Invalid scope for clearDefaultConversation");
		}
		const targetCwd = resolve(scope === "claw" ? DEFAULT_IM_CONVERSATION_CWD : DEFAULT_CONVERSATION_CWD);
		const targetSessionDir = resolve(
			scope === "claw" ? DEFAULT_IM_CONVERSATION_SESSION_DIR : DEFAULT_CONVERSATION_SESSION_DIR,
		);

		const running = runtime.getRunningSessionPaths();
		const sessionDirWithSep = `${targetSessionDir}/`;
		const blocking = running.filter((p) => resolve(p).startsWith(sessionDirWithSep));
		if (blocking.length > 0) {
			throw new Error(
				scope === "claw"
					? "存在运行中的 Claw 会话，请先停止后再清空。"
					: "默认项目存在运行中的会话，请先停止后再清空。",
			);
		}

		const toDispose: string[] = [];
		for (const [sessionId, cwd] of sessionCwdMap.entries()) {
			if (resolve(cwd) !== targetCwd) continue;
			toDispose.push(sessionId);
		}
		await Promise.all(
			toDispose.map(async (sessionId) => {
				try {
					await runtime.disposeSession(sessionId);
				} catch (err) {
					console.error("[clear-default-conversation] dispose failed", sessionId, err);
				}
				sessionCwdMap.delete(sessionId);
			}),
		);

		try {
			await rmExceptPreserved(targetSessionDir, new Set());
		} catch (err) {
			console.error("[clear-default-conversation] failed to clear session dir", err);
			throw err;
		}
		await mkdir(targetSessionDir, { recursive: true });
	});

	ipcMain.handle(CHANNELS.CLEAR_DEFAULT_ARTIFACTS, async (_event, scope: unknown) => {
		// 清空「对话」或 Claw cwd 下的产物文件（保留 .vetta 目录，会话不受影响）。
		if (scope !== "conversation" && scope !== "claw") {
			throw new Error("Invalid scope for clearDefaultArtifacts");
		}
		const targetCwd = resolve(scope === "claw" ? DEFAULT_IM_CONVERSATION_CWD : DEFAULT_CONVERSATION_CWD);

		let entries: Dirent[];
		try {
			entries = await readdir(targetCwd, { withFileTypes: true });
		} catch {
			return;
		}
		await Promise.all(
			entries
				.filter((entry) => entry.name !== ".vetta")
				.map((entry) => rm(join(targetCwd, entry.name), { recursive: true, force: true })),
		);
	});

	const unsubscribeRunning = runtime.onRunningChanged((sessionPath, running) => {
		if (webContents.isDestroyed()) return;
		webContents.send(CHANNELS.RUNNING_CHANGED, { sessionPath, running });
	});

	ipcMain.handle(CHANNELS.CONFIRM_RESPONSE, (_event, requestId: unknown, confirmed: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = confirmationMap.get(requestId);
		if (!resolve) return;
		resolve(confirmed === true);
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANT_RESPONSE, (_event, requestId: unknown, decision: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = sandboxGrantMap.get(requestId);
		if (!resolve) return;
		const value: RuntimeSandboxGrantDecision =
			decision === "allow_once" || decision === "allow_session" ? decision : "deny";
		resolve(value);
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANTS_LIST, (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.listSandboxGrants(sessionId);
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANTS_REVOKE, (_event, sessionId: unknown, grantId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertNonEmptyString(grantId, "grantId");
		return runtime.revokeSandboxGrant(sessionId, grantId);
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANTS_REVOKE_ALL, (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.revokeAllSandboxGrants(sessionId);
	});

	ipcMain.handle(CHANNELS.SUBSCRIBE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		const subscriptionId = `${sessionId}:${randomUUID()}`;
		console.log(`[session ipc] subscribe session=${sessionId} subscription=${subscriptionId}`);
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
			// 渲染进程崩溃后 webContents 短暂处于"frame 已 disposed"状态——
			// runtime 这边 agent 还在跑，每个事件都尝试 send 就会刷屏
			// "Render frame was disposed before WebFrameMain could be accessed"。
			// 此处提前 bail，避免把事件 buffer 灌进死掉的渲染端。
			if (webContents.isDestroyed()) return;
			webContents.send(CHANNELS.EVENT, subscriptionId, runtimeEvent);
		});
		subscriptionMap.set(subscriptionId, unsubscribe);
		return { subscriptionId };
	});

	ipcMain.handle(CHANNELS.UNSUBSCRIBE, async (_event, subscriptionId: unknown) => {
		assertNonEmptyString(subscriptionId, "subscriptionId");
		console.log(`[session ipc] unsubscribe subscription=${subscriptionId}`);
		const unsubscribe = subscriptionMap.get(subscriptionId);
		if (unsubscribe) {
			unsubscribe();
			subscriptionMap.delete(subscriptionId);
		}
	});

	// 渲染进程崩溃 / 重新加载时，旧 subscription 永远不会等到 UNSUBSCRIBE IPC
	// 调用——它们的回调还挂在 runtime 上、继续接收 agent 事件、继续往 dead
	// frame 上 send（哪怕有 isDestroyed 守卫，事件流仍在 runtime 端继续）。
	// 这里集中清理一次：渲染端恢复后会重新 SUBSCRIBE，生成新的 subscriptionId。
	const onRenderGone = (): void => {
		console.warn(`[session ipc] render-process-gone; clearing ${subscriptionMap.size} subscription(s)`);
		for (const unsubscribe of subscriptionMap.values()) {
			unsubscribe();
		}
		subscriptionMap.clear();
		for (const resolve of confirmationMap.values()) {
			resolve(false);
		}
		confirmationMap.clear();
		for (const resolve of sandboxGrantMap.values()) {
			resolve("deny");
		}
		sandboxGrantMap.clear();
	};
	webContents.on("render-process-gone", onRenderGone);

	// ----- read-only viewer (no lock) -----------------------------------
	// Tracks live fs watchers per subscription id so the renderer can
	// open/close many concurrent viewers (e.g. preview hover) without
	// leaking watchers.
	interface ViewerSub {
		watcher: FSWatcher;
		path: string;
	}
	const viewerSubs = new Map<string, ViewerSub>();
	let viewerSeq = 0;

	ipcMain.handle(CHANNELS.VIEWER_OPEN, async (_event, path: unknown) => {
		assertNonEmptyString(path, "path");
		return runtime.readSessionHistoryFromFile(resolve(path));
	});

	ipcMain.handle(CHANNELS.VIEWER_SUBSCRIBE, async (_event, path: unknown) => {
		assertNonEmptyString(path, "path");
		const abs = resolve(path);
		viewerSeq += 1;
		const subscriptionId = `viewer-${viewerSeq}`;
		// Debounce flurries of write events (jsonl is append-only but
		// editors/fs sometimes fire multiple change events per write).
		let pending: NodeJS.Timeout | undefined;
		const emit = () => {
			pending = undefined;
			if (webContents.isDestroyed()) return;
			try {
				const snapshot = runtime.readSessionHistoryFromFile(abs);
				webContents.send(CHANNELS.VIEWER_EVENT, subscriptionId, snapshot);
			} catch {
				// File may have been deleted between events; ignore.
			}
		};
		const watcher = watch(abs, { persistent: false }, () => {
			if (pending) return;
			pending = setTimeout(emit, 80);
		});
		viewerSubs.set(subscriptionId, { watcher, path: abs });
		return { subscriptionId };
	});

	ipcMain.handle(CHANNELS.VIEWER_UNSUBSCRIBE, (_event, subscriptionId: unknown) => {
		if (typeof subscriptionId !== "string") return;
		const sub = viewerSubs.get(subscriptionId);
		if (sub) {
			try {
				sub.watcher.close();
			} catch {
				// already closed
			}
			viewerSubs.delete(subscriptionId);
		}
	});

	return () => {
		webContents.removeListener("render-process-gone", onRenderGone);
		for (const sub of viewerSubs.values()) {
			try {
				sub.watcher.close();
			} catch {
				// ignore
			}
		}
		viewerSubs.clear();
		unsubscribeRunning();
		for (const unsubscribe of subscriptionMap.values()) {
			unsubscribe();
		}
		subscriptionMap.clear();
		for (const resolve of confirmationMap.values()) {
			resolve(false);
		}
		confirmationMap.clear();
		for (const resolve of sandboxGrantMap.values()) {
			resolve("deny");
		}
		sandboxGrantMap.clear();
		runtime.setUserConfirmationHandler(undefined);
		runtime.setUserSandboxGrantHandler(undefined);
		// 不在此处 disposeAllSessions：共享 runtime 的 session 可能正被
		// scheduler/batch-tasks 在后台使用。全进程 session 释放由 main.ts
		// 的 before-quit 负责（见 disposeSharedRuntime）。
	};
}

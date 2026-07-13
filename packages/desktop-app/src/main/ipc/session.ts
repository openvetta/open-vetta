import { randomUUID } from "node:crypto";
import { type Dirent, type FSWatcher, watch } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { type ConversationScenario, DEFAULT_PERSONA_ID, PERSONAS } from "@vetta/coding-agent";
import { BrowserWindow, ipcMain, type WebContents } from "electron";
import { VETTA_CLI_GUIDANCE } from "../../../../coding-agent/src/core/system-prompt.js";
import type {
	AgentPluginContinuationInvocation,
	AgentPluginContinuationResult,
	AgentPluginHandlerResult,
	AgentPluginSystemPromptInvocation,
	AgentPluginToolInvocation,
	PromptRequest,
	RuntimeSandboxGrantDecision,
	RuntimeSandboxGrantRequest,
	RuntimeUserConfirmationRequest,
	RuntimeUserQuestionRequest,
	RuntimeUserQuestionResult,
	SessionConfig,
	SessionEvent,
	SessionExecutionMode,
	SettingsPatch,
} from "../../../../runtime-core/src/index.js";
import { monitorRuntimeSession, stopMonitoringRuntimeSession } from "../app-monitor/app-monitor-service.js";
import { type DebugRequestData, writeDebugRequest } from "../debug-writer.js";
import { getAppLogger } from "../logger.js";
import { notify } from "../notifications/index.js";
import { mapSessionEventToPetPresentation } from "../pet/session-event-action-policy.js";
import { sendPetCommandToWindow } from "../pet-window.js";
import {
	buildAgentPluginRuntimeConfig,
	getPluginSettings,
	listPlugins,
	summarizeAgentPluginRuntimeConfig,
} from "../plugins/plugin-store.js";
import {
	filterSystemPromptInvocationForPlugin,
	normalizeDynamicSystemPromptOperations,
} from "../plugins/system-prompt-operations.js";
import { getSharedRuntime } from "../runtime.js";
import { assertSandboxAvailableForMode } from "../sandbox/capability.js";
import {
	allowProjectRoot,
	DEFAULT_CONVERSATION_CWD,
	DEFAULT_CONVERSATION_SESSION_DIR,
	DEFAULT_IM_CONVERSATION_CWD,
	DEFAULT_IM_CONVERSATION_SESSION_DIR,
	KB_PROCESSING_CWD,
	KB_PROCESSING_SESSION_DIR,
	readConfigSync,
	readDesktopConfig,
	writeDesktopConfig,
} from "./fs.js";
import { readSettings, writeSettings } from "./settings.js";

/**
 * 默认「对话」与 IM cwd 的会话都放到 <cwd>/.vetta/sessions（与批量项目一致）。
 * 当请求的 cwd 是这两类之一时自动注入 sessionDir，渲染端无需感知。
 */
export function resolveSessionDirForCwd(cwd: string | undefined): string | undefined {
	if (!cwd) return undefined;
	const abs = resolve(cwd);
	if (abs === resolve(DEFAULT_CONVERSATION_CWD)) {
		return DEFAULT_CONVERSATION_SESSION_DIR;
	}
	if (abs === resolve(DEFAULT_IM_CONVERSATION_CWD)) {
		return DEFAULT_IM_CONVERSATION_SESSION_DIR;
	}
	if (abs === resolve(KB_PROCESSING_CWD)) {
		return KB_PROCESSING_SESSION_DIR;
	}
	return undefined;
}

/**
 * 判断给定 cwd 是不是「对话」项目根下的某个 session 子目录
 * （即 ADR-0007 引入的 per-session artifact dir）。
 */
function isConversationSubCwd(cwd: string): boolean {
	const abs = resolve(cwd);
	const root = resolve(DEFAULT_CONVERSATION_CWD);
	if (abs === root) return false;
	const rel = relative(root, abs).replace(/\\/g, "/");
	return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel) && !rel.includes("/");
}

/** ADR-0007 per-session dir name under conversation roots (UUID). */
function isSessionArtifactDirName(name: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name);
}

/** Wipe files/dirs inside dir but keep dir itself (for session cwd recovery). */
async function clearDirectoryContents(dir: string): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	await Promise.all(entries.map((entry) => rm(join(dir, entry.name), { recursive: true, force: true })));
}

/**
 * Ensure a session working directory exists on disk.
 * Header may still point at a per-session subdir after「清空产物」deleted it.
 */
async function ensureSessionWorkingCwd(cwd: string | undefined): Promise<void> {
	if (!cwd) return;
	await mkdir(cwd, { recursive: true });
}

/**
 * ADR-0007: 「对话」默认项目下每个新建 session eager 一个独立子目录作为运行 cwd，
 * 避免不同 session 的 agent 产物在根目录互相覆盖/被误读。
 * 仅作用于 cwd 恰好为 DEFAULT_CONVERSATION_CWD 的场景；其他项目原样返回
 * （有的项目 session 之间产物本就需要共享，不能动）。
 *
 * 定时任务执行器（scheduler/task-executor）也复用此函数，使其在「对话」项目下
 * 触发时同样获得独立子目录，与 UI 创建的 session 行为一致。
 */
export async function ensureConversationSubCwd(requestedCwd: string | undefined): Promise<string | undefined> {
	if (!requestedCwd) return requestedCwd;
	if (resolve(requestedCwd) !== resolve(DEFAULT_CONVERSATION_CWD)) return requestedCwd;
	const sub = join(DEFAULT_CONVERSATION_CWD, randomUUID());
	await mkdir(sub, { recursive: true });
	return sub;
}

/** 从 session jsonl 第一行 header 里读 cwd；读不到返回 undefined。 */
async function readSessionCwdFromHeader(sessionPath: string): Promise<string | undefined> {
	try {
		const text = await readFile(sessionPath, "utf8");
		const nl = text.indexOf("\n");
		const firstLine = nl === -1 ? text : text.slice(0, nl);
		if (!firstLine) return undefined;
		const header = JSON.parse(firstLine) as { type?: string; cwd?: string };
		if (header.type !== "session") return undefined;
		return typeof header.cwd === "string" ? header.cwd : undefined;
	} catch {
		return undefined;
	}
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

const sessionLog = getAppLogger("session");
const pluginLog = getAppLogger("plugin");

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
	NEXT_PROMPT_SUGGESTIONS: "vetta:session:next-prompt-suggestions",
	DISPOSE: "vetta:session:dispose",
	GET_FULL_HISTORY: "vetta:session:get-full-history",
	NAVIGATE_FOR_EDIT: "vetta:session:navigate-for-edit",
	SWITCH_BRANCH: "vetta:session:switch-branch",
	FORK_SESSION: "vetta:session:fork-session",
	GET_SESSION_PATH: "vetta:session:get-session-path",
	SET_GLOBAL_THINKING: "vetta:session:set-global-thinking-level",
	GET_GLOBAL_THINKING: "vetta:session:get-global-thinking-level",
	SET_MAX_RECENT_IMAGES: "vetta:session:set-max-recent-images",
	GET_MAX_RECENT_IMAGES: "vetta:session:get-max-recent-images",
	GET_PERSONAS: "vetta:session:get-personas",
	GET_PERSONALIZATION: "vetta:session:get-personalization",
	SET_PERSONALIZATION: "vetta:session:set-personalization",
	EVENT: "vetta:session:event",
	CONFIRM_REQUEST: "vetta:session:confirm-request",
	CONFIRM_RESPONSE: "vetta:session:confirm-response",
	QUESTION_REQUEST: "vetta:session:question-request",
	QUESTION_RESPONSE: "vetta:session:question-response",
	SANDBOX_GRANT_REQUEST: "vetta:session:sandbox-grant-request",
	SANDBOX_GRANT_RESPONSE: "vetta:session:sandbox-grant-response",
	SANDBOX_GRANTS_LIST: "vetta:session:sandbox-grants-list",
	SANDBOX_GRANTS_REVOKE: "vetta:session:sandbox-grants-revoke",
	SANDBOX_GRANTS_REVOKE_ALL: "vetta:session:sandbox-grants-revoke-all",
	BACKGROUND_TASKS_CLEAR_FINISHED: "vetta:session:background-tasks-clear-finished",
	LIST_RUNNING: "vetta:session:list-running",
	RUNNING_CHANGED: "vetta:session:running-changed",
	// 某 session 是否有待回答的 ask_user_question；广播给所有窗口（侧栏 + 快捷面板）。
	PENDING_QUESTION_CHANGED: "vetta:session:pending-question-changed",
	CLEAR_DEFAULT_CONVERSATION: "vetta:session:clear-default-conversation",
	CLEAR_DEFAULT_ARTIFACTS: "vetta:session:clear-default-artifacts",
	// Read-only viewer for sessions we don't want to (or can't) take the
	// write lock on — currently IM sessions, see ADR-0004. The viewer
	// reads the .jsonl directly and tails fs.watch for new entries.
	VIEWER_OPEN: "vetta:session:viewer-open",
	VIEWER_SUBSCRIBE: "vetta:session:viewer-subscribe",
	VIEWER_UNSUBSCRIBE: "vetta:session:viewer-unsubscribe",
	VIEWER_EVENT: "vetta:session:viewer-event",
	PLUGIN_TOOL_REQUEST: "vetta:plugins:agent-tool-request",
	PLUGIN_TOOL_RESPONSE: "vetta:plugins:agent-tool-response",
	PLUGIN_CONTINUATION_REQUEST: "vetta:plugins:continuation-request",
	PLUGIN_CONTINUATION_RESPONSE: "vetta:plugins:continuation-response",
	PLUGIN_SYSTEM_PROMPT_REQUEST: "vetta:plugins:system-prompt-request",
	PLUGIN_SYSTEM_PROMPT_RESPONSE: "vetta:plugins:system-prompt-response",
} as const;

/** 向所有存活窗口（含独立的快捷面板窗口）广播一个事件。 */
function broadcastToAllWindows(channel: string, payload: unknown): void {
	for (const win of BrowserWindow.getAllWindows()) {
		if (win.isDestroyed()) continue;
		const wc = win.webContents;
		if (wc.isDestroyed()) continue;
		wc.send(channel, payload);
	}
}

/**
 * 各 session 当前是否有待回答的 ask_user_question。模块级（跨 registerSessionIpc 调用共享），
 * 状态变化时广播给所有窗口——侧栏与快捷面板据此显示「待答」。
 */
const pendingQuestionPaths = new Set<string>();

function setPendingQuestion(sessionPath: string, hasPendingQuestion: boolean): void {
	const had = pendingQuestionPaths.has(sessionPath);
	if (hasPendingQuestion) {
		if (had) return;
		pendingQuestionPaths.add(sessionPath);
	} else {
		if (!had) return;
		pendingQuestionPaths.delete(sessionPath);
	}
	broadcastToAllWindows(CHANNELS.PENDING_QUESTION_CHANGED, { sessionPath, hasPendingQuestion });
}

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
	if (
		request.metadata !== undefined &&
		(typeof request.metadata !== "object" || request.metadata === null || Array.isArray(request.metadata))
	) {
		throw new Error("Invalid prompt request metadata");
	}
}

function assertExecutionMode(value: unknown): void {
	if (value === undefined) return;
	if (value !== "sandbox" && value !== "full-access") {
		throw new Error("Invalid executionMode");
	}
}

function assertSessionKind(value: unknown): asserts value is "conversation" | "other" {
	if (value !== "conversation" && value !== "other") {
		throw new Error("Invalid session kind");
	}
}

/** Sanitize the renderer's ask_user_question reply into a RuntimeUserQuestionResult. */
function normalizeQuestionResult(value: unknown): RuntimeUserQuestionResult {
	if (typeof value !== "object" || value === null) return { cancelled: true, answers: [] };
	const v = value as Record<string, unknown>;
	if (v.cancelled === true || !Array.isArray(v.answers)) return { cancelled: true, answers: [] };
	const answers = (v.answers as Array<Record<string, unknown>>)
		.filter((a) => a && typeof a.question === "string" && Array.isArray(a.answers))
		.map((a) => ({
			question: a.question as string,
			answers: (a.answers as unknown[]).filter((x): x is string => typeof x === "string"),
		}));
	return { cancelled: false, answers };
}

export function registerSessionIpc(webContents: WebContents): () => void {
	const resolveDefaultExecutionMode = async (): Promise<SessionExecutionMode> => {
		const config = await readDesktopConfig();
		return config.defaultExecutionMode;
	};

	const runtime = getSharedRuntime();
	const subscriptionMap = new Map<string, () => void>();
	const confirmationMap = new Map<string, (confirmed: boolean) => void>();
	const questionMap = new Map<string, (result: RuntimeUserQuestionResult) => void>();
	const sandboxGrantMap = new Map<string, (decision: RuntimeSandboxGrantDecision) => void>();
	const pluginToolMap = new Map<string, (result: unknown) => void>();
	const pluginContinuationMap = new Map<string, (result: unknown) => void>();
	const pluginSystemPromptMap = new Map<string, (result: unknown) => void>();
	/** Track session cwd for debug file writing */
	const sessionCwdMap = new Map<string, string>();
	/** Track debug request sequence per session */
	const debugSeqMap = new Map<string, number>();
	/** Track turn start time per session for duration calculation */
	const turnStartMap = new Map<string, number>();
	/**
	 * ADR-0002: 交互式 session 的常驻通知订阅（独立于渲染端视图订阅，不随
	 * 切换 session 销毁）。只有经本 IPC CHANNELS.CREATE 创建的 session 才会挂，
	 * 故天然只覆盖交互式 session（批量/定时任务直接调 runtime.createSession）。
	 */
	const notificationSubs = new Map<string, () => void>();

	/** 给某交互式 session 挂常驻通知订阅；已挂则跳过。 */
	const attachNotificationSub = (sessionId: string, cwd: string): void => {
		if (notificationSubs.has(sessionId)) return;
		// 逐轮跟踪终结状态：message.final 带 stopReason，error 事件、aborted
		// lifecycle 各自独立。agent_end 时按累积状态判定该不该通知。
		let lastStopReason: string | undefined;
		let aborted = false;
		let lastPetActionId: string | undefined;
		let lastPetBubbleKey: string | undefined;
		const unsubscribe = runtime.subscribe(sessionId, (ev: SessionEvent) => {
			const petPresentation = mapSessionEventToPetPresentation(ev);
			const petActionId = petPresentation?.actionId;
			if (petActionId && petActionId !== lastPetActionId) {
				lastPetActionId = petActionId;
				sendPetCommandToWindow({ type: "set-action", actionId: petActionId, source: "app" });
			}
			const petBubble = petPresentation?.bubble;
			if (petBubble) {
				const nextBubbleKey = `${petBubble.text}:${petBubble.ttlMs ?? ""}:${petBubble.priority ?? ""}`;
				if (nextBubbleKey !== lastPetBubbleKey) {
					lastPetBubbleKey = nextBubbleKey;
					sendPetCommandToWindow({
						type: "show-bubble",
						text: petBubble.text,
						source: "app",
						...(petBubble.ttlMs === undefined ? {} : { ttlMs: petBubble.ttlMs }),
						...(petBubble.priority === undefined ? {} : { priority: petBubble.priority }),
					});
				}
			} else {
				lastPetBubbleKey = undefined;
			}

			if (ev.type === "message.final") {
				const sr = (ev.message as unknown as { stopReason?: unknown }).stopReason;
				if (typeof sr === "string") lastStopReason = sr;
			} else if (ev.type === "error") {
				lastStopReason = "error";
			} else if (ev.type === "session.lifecycle") {
				if (ev.phase === "aborted") {
					aborted = true;
				} else if (ev.phase === "agent_end") {
					const wasAborted = aborted || lastStopReason === "aborted";
					const outcome = lastStopReason === "error" ? "error" : "completed";
					const sessionPath = runtime.getSessionPath(sessionId);
					lastStopReason = undefined;
					aborted = false;
					// 中断不通知；正常完成 / 出错才通知（见 CONTEXT.md「agent 完成通知」）。
					if (!wasAborted && sessionPath) {
						void notify({ type: "agent-turn-complete", sessionPath, cwd, outcome });
					}
				}
			}
		});
		notificationSubs.set(sessionId, unsubscribe);
	};

	/** 释放某 session 的常驻通知订阅。 */
	const detachNotificationSub = (sessionId: string): void => {
		const unsubscribe = notificationSubs.get(sessionId);
		if (unsubscribe) {
			unsubscribe();
			notificationSubs.delete(sessionId);
		}
	};

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

	const CANCELLED_QUESTION: RuntimeUserQuestionResult = { cancelled: true, answers: [] };

	// ask_user_question 后端：把请求送到渲染端「问答面板」，阻塞等用户提交/取消。
	// 镜像 confirm 的 requestId map 模式；abort（中断/窗口销毁）一律视为取消。
	const questionHandler = (
		request: RuntimeUserQuestionRequest,
		signal?: AbortSignal,
	): Promise<RuntimeUserQuestionResult> => {
		if (webContents.isDestroyed()) return Promise.resolve(CANCELLED_QUESTION);
		return new Promise<RuntimeUserQuestionResult>((resolve) => {
			const sessionPath = runtime.getSessionPath(request.sessionId);
			const finish = (result: RuntimeUserQuestionResult): void => {
				questionMap.delete(request.requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				// 问答结束（提交/取消/中断）后清掉「待答」标记并广播。
				if (sessionPath) setPendingQuestion(sessionPath, false);
				resolve(result);
			};
			const onAbort = (): void => finish(CANCELLED_QUESTION);
			if (signal?.aborted) {
				resolve(CANCELLED_QUESTION);
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			questionMap.set(request.requestId, finish);
			webContents.send(CHANNELS.QUESTION_REQUEST, request);
			// 广播「待答」给所有窗口（侧栏 + 快捷面板）。
			if (sessionPath) setPendingQuestion(sessionPath, true);
			// 同时发系统通知「有问题待确认」（点击跳转该 session）；前台看着该 session 时自动抑制。
			const cwd = sessionCwdMap.get(request.sessionId);
			if (sessionPath && cwd) {
				void notify({ type: "agent-question-pending", sessionPath, cwd });
			}
		});
	};

	// 提问用户面板不再是用户开关：问答 handler 恒注入（能力始终在）。是否向 agent 暴露
	// ask_user_question 改由该工具的 scope_use（仅 conversation/project 场景）决定。
	runtime.setUserQuestionHandler(questionHandler);

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

	runtime.setPluginToolInvoker((request: AgentPluginToolInvocation, signal?: AbortSignal) => {
		if (webContents.isDestroyed()) {
			return Promise.reject(new Error("Plugin host renderer is unavailable"));
		}
		return new Promise<AgentPluginHandlerResult<unknown>>((resolve, reject) => {
			const requestId = randomUUID();
			const finish = (result: unknown): void => {
				pluginToolMap.delete(requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				if (typeof result === "object" && result !== null && "error" in result) {
					reject(new Error(String((result as { error?: unknown }).error ?? "Plugin tool failed")));
					return;
				}
				const plugin = listPlugins().find((candidate) => candidate.id === request.pluginId);
				if (!plugin || !plugin.enabled) {
					reject(new Error(`Plugin not found or disabled: ${request.pluginId}`));
					return;
				}
				resolve({
					value: (result as { value?: unknown })?.value,
					effects: normalizeDynamicSystemPromptOperations(plugin, (result as { effects?: unknown }).effects ?? []),
				});
			};
			const onAbort = (): void => {
				pluginToolMap.delete(requestId);
				reject(new Error("Plugin tool invocation was aborted"));
			};
			if (signal?.aborted) {
				reject(new Error("Plugin tool invocation was aborted"));
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			pluginToolMap.set(requestId, finish);
			webContents.send(CHANNELS.PLUGIN_TOOL_REQUEST, {
				...request,
				requestId,
				settings: getPluginSettings(request.pluginId),
			});
		});
	});

	runtime.setPluginContinuationInvoker((request: AgentPluginContinuationInvocation, signal?: AbortSignal) => {
		if (webContents.isDestroyed()) return Promise.resolve({ value: null, effects: [] });
		return new Promise<AgentPluginHandlerResult<AgentPluginContinuationResult | null>>((resolve, reject) => {
			const requestId = randomUUID();
			const finish = (result: unknown): void => {
				pluginContinuationMap.delete(requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				if (typeof result === "object" && result !== null && "error" in result) {
					reject(new Error(String((result as { error?: unknown }).error ?? "Plugin continuation failed")));
					return;
				}
				const value = (result as { value?: unknown })?.value;
				const plugin = listPlugins().find((item) => item.id === request.pluginId);
				if (!plugin || !plugin.enabled) {
					reject(new Error(`Plugin not found or disabled: ${request.pluginId}`));
					return;
				}
				const effects = normalizeDynamicSystemPromptOperations(
					plugin,
					(result as { effects?: unknown }).effects ?? [],
				);
				if (value === null || value === undefined) {
					resolve({ value: null, effects });
					return;
				}
				if (typeof value !== "object" || typeof (value as { text?: unknown }).text !== "string") {
					reject(new Error("Plugin continuation returned an invalid result"));
					return;
				}
				const candidate = value as { text: string; idempotencyKey?: unknown };
				resolve({
					value: {
						text: candidate.text,
						idempotencyKey: typeof candidate.idempotencyKey === "string" ? candidate.idempotencyKey : undefined,
					},
					effects,
				});
			};
			const onAbort = (): void => {
				pluginContinuationMap.delete(requestId);
				resolve({ value: null, effects: [] });
			};
			if (signal?.aborted) {
				resolve({ value: null, effects: [] });
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			pluginContinuationMap.set(requestId, finish);
			webContents.send(CHANNELS.PLUGIN_CONTINUATION_REQUEST, {
				...request,
				requestId,
				settings: getPluginSettings(request.pluginId),
			});
		});
	});

	runtime.setPluginSystemPromptInvoker((request: AgentPluginSystemPromptInvocation, signal?: AbortSignal) => {
		if (webContents.isDestroyed()) {
			pluginLog.warn("[plugin-system-prompt] invocation skipped: renderer destroyed", {
				pluginId: request.pluginId,
				providerId: request.providerId,
				sessionId: request.session.id,
				runIndex: request.runtime.runIndex,
			});
			return Promise.resolve([]);
		}
		return new Promise((resolve, reject) => {
			const requestId = randomUUID();
			const finish = (result: unknown): void => {
				pluginSystemPromptMap.delete(requestId);
				if (signal) signal.removeEventListener("abort", onAbort);
				if (typeof result === "object" && result !== null && "error" in result) {
					pluginLog.warn("[plugin-system-prompt] renderer handler failed", {
						requestId,
						pluginId: request.pluginId,
						providerId: request.providerId,
						error: String((result as { error?: unknown }).error ?? "Plugin system prompt failed"),
					});
					reject(new Error(String((result as { error?: unknown }).error ?? "Plugin system prompt failed")));
					return;
				}
				const plugin = listPlugins().find((candidate) => candidate.id === request.pluginId);
				if (!plugin || !plugin.enabled) {
					reject(new Error(`Plugin not found or disabled: ${request.pluginId}`));
					return;
				}
				const operations = normalizeDynamicSystemPromptOperations(plugin, (result as { value?: unknown })?.value);
				pluginLog.debug("[plugin-system-prompt] operations normalized", {
					requestId,
					pluginId: request.pluginId,
					providerId: request.providerId,
					operationTypes: operations.map((operation) => operation.type),
				});
				resolve(operations);
			};
			const onAbort = (): void => {
				pluginSystemPromptMap.delete(requestId);
				reject(new Error("Plugin system prompt invocation was aborted"));
			};
			if (signal?.aborted) {
				reject(new Error("Plugin system prompt invocation was aborted"));
				return;
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			pluginSystemPromptMap.set(requestId, finish);
			pluginLog.debug("[plugin-system-prompt] sending renderer request", {
				requestId,
				pluginId: request.pluginId,
				providerId: request.providerId,
				handlerId: request.handlerId,
				sessionId: request.session.id,
				runIndex: request.runtime.runIndex,
				messageCount: request.conversation.messageCount,
			});
			const plugin = listPlugins().find((candidate) => candidate.id === request.pluginId);
			if (!plugin || !plugin.enabled) {
				pluginSystemPromptMap.delete(requestId);
				reject(new Error(`Plugin not found or disabled: ${request.pluginId}`));
				return;
			}
			const filteredRequest = filterSystemPromptInvocationForPlugin(plugin, request);
			webContents.send(CHANNELS.PLUGIN_SYSTEM_PROMPT_REQUEST, {
				...filteredRequest,
				requestId,
				settings: getPluginSettings(request.pluginId),
			});
		});
	});

	ipcMain.handle(CHANNELS.CREATE, async (_event, config: SessionConfig | undefined, kind: unknown) => {
		assertSessionKind(kind);
		if (config?.cwd) allowProjectRoot(config.cwd);
		assertExecutionMode(config?.executionMode);
		await assertSandboxAvailableForMode(config?.executionMode, resolveDefaultExecutionMode);
		// 默认项目：缺省把 session 落到 <cwd>/.vetta/sessions（与批量项目一致）。
		// 关键：sessionDir 用「原始」projectCwd 推导（DEFAULT_CONVERSATION_SESSION_DIR
		// 仍在项目根，不进 per-session 子目录），然后 cwd 再 swap 到子目录。
		const injectedSessionDir = config?.sessionDir ?? resolveSessionDirForCwd(config?.cwd);
		// ADR-0007: 重新打开已存在的 session 时，渲染端传进来的 cwd 是项目根，
		// 但 session header 里持久化的真实 cwd 可能是 per-session 子目录。
		// 优先用 header 里的 cwd，避免 activeSession.cwd 退化回项目根。
		const cwdFromExistingHeader = config?.sessionPath
			? await readSessionCwdFromHeader(config.sessionPath)
			: undefined;
		// ADR-0007: 「对话」项目下「新建」session 拿独立 cwd 子目录；
		// 已有 session 不重 mkdir，直接沿用 header cwd。
		const effectiveCwd = cwdFromExistingHeader ?? (await ensureConversationSubCwd(config?.cwd));
		// Heal missing per-session dirs (e.g.「清空产物」删掉了 UUID 子目录，header 仍引用)。
		// Without this, bash/read/write and FilesPanel fail with ENOENT after reopen or edit.
		await ensureSessionWorkingCwd(effectiveCwd);
		if (effectiveCwd && effectiveCwd !== config?.cwd) {
			allowProjectRoot(effectiveCwd);
		}
		const isConversation = kind === "conversation";
		// 对话场景：调用方显式传入则尊重（如批量任务 viewer 传 "batch"，与 executor 一致）；
		// 否则按 kind 推导——conversation 与 project（kind="other"）均为交互式桌面会话，工具
		// 差异交给各工具的 scope_use 表达，而非在入口写死。
		const scenario: ConversationScenario = config?.scenario ?? (isConversation ? "conversation" : "project");
		const desktopConfig = await readDesktopConfig();
		// project 也开 ask（决策）：conversation/project 对称，ask_user_question 的 scope_use 含两者。
		const askUserQuestion = true;
		// 后台任务不再是用户开关：交互式会话恒开（task_output/task_stop 由 scope_use + 该会话
		// 的 enableBackgroundTasks 决定）。批量场景与 executor 一致强制关，避免后台任务干扰队列判定。
		const enableBackgroundTasks = scenario !== "batch";
		// 适配通用 Agent Skill：默认开（缺省视为开），仅当用户显式关闭时禁用 .agents/skills 发现。
		const includeAgentSkills = desktopConfig.experimental?.agentSkills !== false;
		const appendSystemPrompt =
			isConversation && desktopConfig.experimental?.vettaCli === true
				? config?.appendSystemPrompt
					? `${config.appendSystemPrompt}\n\n${VETTA_CLI_GUIDANCE}`
					: VETTA_CLI_GUIDANCE
				: config?.appendSystemPrompt;
		// conversation/project 均注入插件运行时；具体哪些插件工具出现由其 scope_use 过滤。
		const agentPlugins = buildAgentPluginRuntimeConfig();
		pluginLog.debug("session create plugin snapshot", {
			kind,
			isConversation,
			...summarizeAgentPluginRuntimeConfig(agentPlugins),
		});
		const needPatch =
			effectiveCwd !== config?.cwd ||
			injectedSessionDir !== config?.sessionDir ||
			appendSystemPrompt !== config?.appendSystemPrompt ||
			scenario !== config?.scenario ||
			askUserQuestion !== config?.askUserQuestion ||
			enableBackgroundTasks !== config?.enableBackgroundTasks ||
			includeAgentSkills !== config?.includeAgentSkills ||
			config?.enableAgentPlugins !== true ||
			agentPlugins !== config?.agentPlugins;
		const effectiveConfig: SessionConfig | undefined = needPatch
			? {
					...(config ?? {}),
					cwd: effectiveCwd,
					sessionDir: injectedSessionDir ?? config?.sessionDir,
					scenario,
					appendSystemPrompt,
					askUserQuestion,
					enableBackgroundTasks,
					includeAgentSkills,
					enableAgentPlugins: true,
					agentPlugins,
				}
			: config;
		const result = await runtime.createSession(effectiveConfig);
		monitorRuntimeSession(runtime, result.sessionId, "interactive");
		if (isConversation) {
			const refreshedAgentPlugins = buildAgentPluginRuntimeConfig();
			pluginLog.debug("session create post-reconfigure", {
				sessionId: result.sessionId,
				...summarizeAgentPluginRuntimeConfig(refreshedAgentPlugins),
			});
			runtime.reconfigureAgentPlugins(refreshedAgentPlugins);
		}
		if (effectiveCwd) {
			sessionCwdMap.set(result.sessionId, effectiveCwd);
		}
		// ADR-0002: 经本通道创建的即交互式 session，挂常驻通知订阅。
		attachNotificationSub(result.sessionId, effectiveCwd ?? config?.cwd ?? "");
		// ADR-0007: 把实际 cwd（可能是「对话」per-session 子目录）返回给渲染端，
		// 否则 activeSession.cwd 仍是用户传入的项目根，ActivityPanel 文件树会
		// 落到项目根、看到其他 session 的子目录。
		return { ...result, cwd: effectiveCwd };
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
		sessionLog.info(
			`prompt session=${sessionId} textLength=${req.text.length} images=${req.images?.length ?? 0} streamingBehavior=${req.streamingBehavior ?? "default"}`,
		);
		pluginLog.debug("session prompt plugin snapshot", {
			sessionId,
			...summarizeAgentPluginRuntimeConfig(buildAgentPluginRuntimeConfig()),
		});
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

	// 上下文里保留的图片张数（coding-agent images.maxRecentImages）。
	// 0 = 不限制（保留全部）。仅写盘；运行中的 session 在下一轮 prompt 经
	// settingsManager.reloadImageSettings() 懒重读生效，新建/重开的 session
	// 在构造时直接读到——无需重启或广播。
	ipcMain.handle(CHANNELS.SET_MAX_RECENT_IMAGES, (_event, count: unknown) => {
		if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
			throw new Error("Invalid maxRecentImages value");
		}
		const settings = readSettings();
		const images = (settings.images as Record<string, unknown> | undefined) ?? {};
		images.maxRecentImages = count;
		settings.images = images;
		writeSettings(settings);
	});

	ipcMain.handle(CHANNELS.GET_MAX_RECENT_IMAGES, () => {
		const settings = readSettings();
		const images = settings.images as { maxRecentImages?: number } | undefined;
		return images?.maxRecentImages ?? 2;
	});

	// 个性化人设清单：唯一来源是 coding-agent 注册表，只下发 id/label/description，不含提示词正文。
	ipcMain.handle(CHANNELS.GET_PERSONAS, () => {
		return PERSONAS.map((p) => ({ id: p.id, label: p.label, description: p.description }));
	});

	// 个性化配置（人设 + 自定义指令）。仅写盘；运行中的 session 在下一轮 prompt 经
	// settingsManager.reloadPersonalizationSettings() 懒重建生效，无需重启或广播。
	ipcMain.handle(CHANNELS.GET_PERSONALIZATION, () => {
		const settings = readSettings();
		const p = settings.personalization as { personaId?: string; customPrompt?: string } | undefined;
		return {
			personaId: p?.personaId ?? DEFAULT_PERSONA_ID,
			customPrompt: p?.customPrompt ?? "",
		};
	});

	ipcMain.handle(CHANNELS.SET_PERSONALIZATION, (_event, input: unknown) => {
		if (typeof input !== "object" || input === null) {
			throw new Error("Invalid personalization payload");
		}
		const { personaId, customPrompt } = input as { personaId?: unknown; customPrompt?: unknown };
		if (typeof personaId !== "string" || !PERSONAS.some((p) => p.id === personaId)) {
			throw new Error("Invalid personaId");
		}
		if (typeof customPrompt !== "string") {
			throw new Error("Invalid customPrompt");
		}
		const settings = readSettings();
		settings.personalization = { personaId, customPrompt };
		writeSettings(settings);
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

	ipcMain.handle(CHANNELS.NAVIGATE_FOR_EDIT, async (_event, sessionId: unknown, entryId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertNonEmptyString(entryId, "entryId");
		return runtime.navigateForEdit(sessionId, entryId);
	});

	ipcMain.handle(CHANNELS.SWITCH_BRANCH, async (_event, sessionId: unknown, entryId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertNonEmptyString(entryId, "entryId");
		return runtime.switchBranch(sessionId, entryId);
	});

	ipcMain.handle(CHANNELS.FORK_SESSION, async (_event, sessionId: unknown, entryId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertNonEmptyString(entryId, "entryId");
		return runtime.forkSession(sessionId, entryId);
	});

	ipcMain.handle(CHANNELS.DELETE, async (_event, sessionPath: unknown) => {
		assertNonEmptyString(sessionPath, "sessionPath");
		// ADR-0007: 「对话」项目下的 session cwd 是独立子目录；删除 session 时
		// 连带回收子目录里的产物。读 header 先取 cwd，再 delete，最后 rm 子目录。
		const cwdFromHeader = await readSessionCwdFromHeader(sessionPath);
		await runtime.deleteSession(sessionPath);
		if (cwdFromHeader && isConversationSubCwd(cwdFromHeader)) {
			await rm(resolve(cwdFromHeader), { recursive: true, force: true }).catch((err) => {
				sessionLog.error("failed to remove conversation sub cwd", cwdFromHeader, err);
			});
		}
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

	ipcMain.handle(
		CHANNELS.NEXT_PROMPT_SUGGESTIONS,
		async (_event, sessionId: unknown, conversation: unknown): Promise<string[]> => {
			assertNonEmptyString(sessionId, "sessionId");
			if (typeof conversation !== "string" || conversation.trim().length === 0) return [];
			return runtime.nextPromptSuggestions(sessionId, conversation);
		},
	);

	ipcMain.handle(CHANNELS.DISPOSE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		detachNotificationSub(sessionId);
		await runtime.disposeSession(sessionId);
		stopMonitoringRuntimeSession(sessionId);
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
			const absCwd = resolve(cwd);
			// "conversation" 场景下 session cwd 可能是 DEFAULT_CONVERSATION_CWD
			// 本身（老 session）或其 per-session 子目录（ADR-0007 之后的新 session）。
			const matched = absCwd === targetCwd || (scope === "conversation" && isConversationSubCwd(cwd));
			if (!matched) continue;
			toDispose.push(sessionId);
		}
		await Promise.all(
			toDispose.map(async (sessionId) => {
				detachNotificationSub(sessionId);
				try {
					await runtime.disposeSession(sessionId);
				} catch (err) {
					sessionLog.error("clear-default-conversation dispose failed", sessionId, err);
				}
				sessionCwdMap.delete(sessionId);
			}),
		);

		try {
			await rmExceptPreserved(targetSessionDir, new Set());
		} catch (err) {
			sessionLog.error("clear-default-conversation failed to clear session dir", err);
			throw err;
		}
		await mkdir(targetSessionDir, { recursive: true });
	});

	ipcMain.handle(CHANNELS.CLEAR_DEFAULT_ARTIFACTS, async (_event, scope: unknown) => {
		// 清空「对话」或 Claw cwd 下的产物文件（保留 .vetta 目录，会话不受影响）。
		// ADR-0007：UUID 子目录 *就是* session 的运行 cwd，不能整目录删除——否则 header
		// 仍指向该路径，重开/编辑后 bash、文件树全部 ENOENT。只清空目录内容并保留壳。
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
				.map(async (entry) => {
					const full = join(targetCwd, entry.name);
					if (entry.isDirectory() && isSessionArtifactDirName(entry.name)) {
						await clearDirectoryContents(full);
						return;
					}
					await rm(full, { recursive: true, force: true });
				}),
		);
	});

	const unsubscribeRunning = runtime.onRunningChanged((sessionPath, running, sessionId, reason) => {
		// 主窗口（订阅方）原样投递，保持既有行为。
		if (!webContents.isDestroyed()) {
			webContents.send(CHANNELS.RUNNING_CHANGED, { sessionPath, running, sessionId, reason });
		}
		// 并行广播给其它窗口（如独立的快捷面板窗口），让它们也能跟随运行态。
		for (const win of BrowserWindow.getAllWindows()) {
			if (win.isDestroyed()) continue;
			const wc = win.webContents;
			if (wc === webContents || wc.isDestroyed()) continue;
			wc.send(CHANNELS.RUNNING_CHANGED, { sessionPath, running, sessionId, reason });
		}
	});

	ipcMain.handle(CHANNELS.CONFIRM_RESPONSE, (_event, requestId: unknown, confirmed: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = confirmationMap.get(requestId);
		if (!resolve) return;
		resolve(confirmed === true);
	});

	ipcMain.handle(CHANNELS.QUESTION_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = questionMap.get(requestId);
		if (!resolve) return;
		resolve(normalizeQuestionResult(result));
	});

	ipcMain.handle(CHANNELS.SANDBOX_GRANT_RESPONSE, (_event, requestId: unknown, decision: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = sandboxGrantMap.get(requestId);
		if (!resolve) return;
		const value: RuntimeSandboxGrantDecision =
			decision === "allow_once" || decision === "allow_session" ? decision : "deny";
		resolve(value);
	});

	ipcMain.handle(CHANNELS.PLUGIN_TOOL_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = pluginToolMap.get(requestId);
		if (!resolve) return;
		resolve(result);
	});

	ipcMain.handle(CHANNELS.PLUGIN_CONTINUATION_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "requestId");
		const resolve = pluginContinuationMap.get(requestId);
		if (resolve) resolve(result);
	});
	ipcMain.handle(CHANNELS.PLUGIN_SYSTEM_PROMPT_RESPONSE, (_event, requestId: unknown, result: unknown) => {
		assertNonEmptyString(requestId, "plugin system prompt request id");
		const resolve = pluginSystemPromptMap.get(requestId);
		pluginLog.debug("[plugin-system-prompt] renderer response received", {
			requestId,
			hasPendingRequest: Boolean(resolve),
			operationCount:
				typeof result === "object" &&
				result !== null &&
				"value" in result &&
				Array.isArray((result as { value?: unknown }).value)
					? (result as { value: unknown[] }).value.length
					: undefined,
		});
		if (resolve) resolve(result);
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

	ipcMain.handle(CHANNELS.BACKGROUND_TASKS_CLEAR_FINISHED, (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.clearFinishedBackgroundTasks(sessionId);
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
						const msg = runtimeEvent.message as unknown as Record<string, unknown>;
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

		// 回放后台任务快照：注册表在主进程内存中跨 renderer 重载存活，但
		// background_tasks_update 只在状态变化时推送——renderer 刷新后 atom
		// 清空，若不回放，无输出的运行中任务（如 sleep）要等到结束才再现。
		const backgroundTasks = runtime.listBackgroundTasks(sessionId);
		if (backgroundTasks.length > 0 && !webContents.isDestroyed()) {
			webContents.send(CHANNELS.EVENT, subscriptionId, {
				schemaVersion: 1,
				sessionId,
				eventId: randomUUID(),
				timestamp: Date.now(),
				source: "runtime-core",
				type: "background_tasks_update",
				tasks: backgroundTasks,
			});
		}

		return { subscriptionId };
	});

	ipcMain.handle(CHANNELS.UNSUBSCRIBE, async (_event, subscriptionId: unknown) => {
		assertNonEmptyString(subscriptionId, "subscriptionId");
		sessionLog.debug(`unsubscribe subscription=${subscriptionId}`);
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
		sessionLog.warn(`render-process-gone; clearing ${subscriptionMap.size} subscription(s)`);
		for (const unsubscribe of subscriptionMap.values()) {
			unsubscribe();
		}
		subscriptionMap.clear();
		for (const resolve of confirmationMap.values()) {
			resolve(false);
		}
		confirmationMap.clear();
		for (const resolve of questionMap.values()) {
			resolve(CANCELLED_QUESTION);
		}
		questionMap.clear();
		for (const resolve of sandboxGrantMap.values()) {
			resolve("deny");
		}
		sandboxGrantMap.clear();
		for (const resolve of pluginToolMap.values()) {
			resolve({ error: "Plugin host renderer is unavailable" });
		}
		pluginToolMap.clear();
		for (const resolve of pluginContinuationMap.values()) {
			resolve({ value: null });
		}
		pluginContinuationMap.clear();
		for (const resolve of pluginSystemPromptMap.values()) {
			resolve({ error: "Plugin host renderer disposed" });
		}
		pluginSystemPromptMap.clear();
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
		for (const unsubscribe of notificationSubs.values()) {
			unsubscribe();
		}
		notificationSubs.clear();
		for (const unsubscribe of subscriptionMap.values()) {
			unsubscribe();
		}
		subscriptionMap.clear();
		for (const resolve of confirmationMap.values()) {
			resolve(false);
		}
		confirmationMap.clear();
		for (const resolve of questionMap.values()) {
			resolve(CANCELLED_QUESTION);
		}
		questionMap.clear();
		for (const resolve of sandboxGrantMap.values()) {
			resolve("deny");
		}
		sandboxGrantMap.clear();
		for (const resolve of pluginToolMap.values()) {
			resolve({ error: "Plugin host renderer disposed" });
		}
		pluginToolMap.clear();
		for (const resolve of pluginContinuationMap.values()) {
			resolve({ value: null });
		}
		pluginContinuationMap.clear();
		runtime.setUserConfirmationHandler(undefined);
		runtime.setUserQuestionHandler(undefined);
		runtime.setUserSandboxGrantHandler(undefined);
		runtime.setPluginToolInvoker(undefined);
		runtime.setPluginContinuationInvoker(undefined);
		runtime.setPluginSystemPromptInvoker(undefined);
		// 不在此处 disposeAllSessions：共享 runtime 的 session 可能正被
		// scheduler/batch-tasks 在后台使用。全进程 session 释放由 main.ts
		// 的 before-quit 负责（见 disposeSharedRuntime）。
	};
}

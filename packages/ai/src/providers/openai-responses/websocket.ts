import type { Provider } from "../../protocol/index.js";
import { createResponsesJsonParseError } from "./response-schema.js";

/**
 * OpenAI Responses 协议族的共享 WebSocket transport。
 *
 * 同一条长连接通过 `response.create` 帧承载一次请求，事件帧与 SSE 逐条对应；
 * sessionId 相同的调用复用连接，让上游会话/提示缓存保持局部性。Codex 与通用
 * OpenAI Responses 只在 URL、鉴权头和事件归一化上不同，连接生命周期都在这里。
 */
export const RESPONSES_WEBSOCKET_BETA_HEADER = "responses_websockets=2026-02-06";

const SESSION_WEBSOCKET_CACHE_TTL_MS = 5 * 60 * 1000;

type WebSocketEventType = "open" | "message" | "error" | "close";
type WebSocketListener = (event: unknown) => void;

export interface ResponsesWebSocket {
	close(code?: number, reason?: string): void;
	send(data: string): void;
	addEventListener(type: WebSocketEventType, listener: WebSocketListener): void;
	removeEventListener(type: WebSocketEventType, listener: WebSocketListener): void;
}

interface CachedWebSocketConnection {
	socket: ResponsesWebSocket;
	busy: boolean;
	idleTimer?: ReturnType<typeof setTimeout>;
}

type WebSocketConstructor = new (
	url: string,
	protocols?: string | string[] | { headers?: Record<string, string> },
) => ResponsesWebSocket;

const websocketSessionCache = new Map<string, CachedWebSocketConnection>();

export interface AcquiredResponsesWebSocket {
	readonly socket: ResponsesWebSocket;
	readonly release: (options?: { keep?: boolean }) => void;
}

/** HTTP(S) URL 转 WS(S)；不改动路径，路径拼接归各 Provider。 */
export function toWebSocketUrl(httpUrl: string): string {
	const url = new URL(httpUrl);
	if (url.protocol === "https:") url.protocol = "wss:";
	if (url.protocol === "http:") url.protocol = "ws:";
	return url.toString();
}

/** 通用 OpenAI Responses 端点：`<baseUrl>/responses` 的 WS 形式。 */
export function resolveResponsesWebSocketUrl(baseUrl: string): string {
	const normalized = baseUrl.replace(/\/+$/, "");
	return toWebSocketUrl(normalized.endsWith("/responses") ? normalized : `${normalized}/responses`);
}

export async function acquireResponsesWebSocket(
	url: string,
	headers: Record<string, string>,
	sessionId?: string,
	signal?: AbortSignal,
): Promise<AcquiredResponsesWebSocket> {
	if (!sessionId) {
		const socket = await connectWebSocket(url, headers, signal);
		return { socket, release: () => closeWebSocketSilently(socket) };
	}

	const cacheKey = `${url}\n${credentialFingerprint(headers)}\n${sessionId}`;
	const cached = websocketSessionCache.get(cacheKey);
	if (cached) {
		if (cached.idleTimer) {
			clearTimeout(cached.idleTimer);
			cached.idleTimer = undefined;
		}
		if (!cached.busy && isWebSocketReusable(cached.socket)) {
			cached.busy = true;
			return {
				socket: cached.socket,
				release: ({ keep } = {}) => {
					if (!keep || !isWebSocketReusable(cached.socket)) {
						closeWebSocketSilently(cached.socket);
						websocketSessionCache.delete(cacheKey);
						return;
					}
					cached.busy = false;
					scheduleSessionWebSocketExpiry(cacheKey, cached);
				},
			};
		}
		if (cached.busy) {
			const socket = await connectWebSocket(url, headers, signal);
			return { socket, release: () => closeWebSocketSilently(socket) };
		}
		if (!isWebSocketReusable(cached.socket)) {
			closeWebSocketSilently(cached.socket);
			websocketSessionCache.delete(cacheKey);
		}
	}

	const socket = await connectWebSocket(url, headers, signal);
	const entry: CachedWebSocketConnection = { socket, busy: true };
	websocketSessionCache.set(cacheKey, entry);
	return {
		socket,
		release: ({ keep } = {}) => {
			if (!keep || !isWebSocketReusable(entry.socket)) {
				closeWebSocketSilently(entry.socket);
				if (entry.idleTimer) clearTimeout(entry.idleTimer);
				if (websocketSessionCache.get(cacheKey) === entry) websocketSessionCache.delete(cacheKey);
				return;
			}
			entry.busy = false;
			scheduleSessionWebSocketExpiry(cacheKey, entry);
		},
	};
}

/** 逐帧产出 WS 上的 Responses 事件；终态帧到达前断连视为失败。 */
export async function* readResponsesWebSocketEvents(
	socket: ResponsesWebSocket,
	provider: Provider,
	signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
	const queue: Record<string, unknown>[] = [];
	let pending: (() => void) | null = null;
	let done = false;
	let failed: Error | null = null;
	let sawCompletion = false;
	// 一旦向调用方交出过实质事件（文本/工具/推理），断连重试会整轮重发，造成重复内容与重复计费。
	let emittedOutput = false;
	const wake = () => {
		if (!pending) return;
		const resolve = pending;
		pending = null;
		resolve();
	};
	const onMessage: WebSocketListener = (event) => {
		void (async () => {
			if (!event || typeof event !== "object" || !("data" in event)) return;
			const text = await decodeWebSocketData((event as { data?: unknown }).data);
			if (!text) return;
			try {
				const parsed = JSON.parse(text) as Record<string, unknown>;
				const type = typeof parsed.type === "string" ? parsed.type : "";
				if (
					type === "response.completed" ||
					type === "response.done" ||
					type === "response.incomplete" ||
					type === "response.failed"
				) {
					sawCompletion = true;
					done = true;
				}
				queue.push(parsed);
				wake();
			} catch (error) {
				failed = createResponsesJsonParseError(provider, error);
				done = true;
				wake();
			}
		})();
	};
	const onError: WebSocketListener = (event) => {
		failed = extractWebSocketError(event);
		done = true;
		wake();
	};
	const onClose: WebSocketListener = (event) => {
		if (!sawCompletion && !failed) failed = extractWebSocketCloseError(event);
		done = true;
		wake();
	};
	const onAbort = () => {
		failed = createAbortedWebSocketError();
		done = true;
		wake();
	};

	socket.addEventListener("message", onMessage);
	socket.addEventListener("error", onError);
	socket.addEventListener("close", onClose);
	signal?.addEventListener("abort", onAbort);
	try {
		while (true) {
			if (signal?.aborted) throw createAbortedWebSocketError();
			if (queue.length > 0) {
				const next = queue.shift() as Record<string, unknown>;
				if (!isLifecycleOnlyEvent(next)) emittedOutput = true;
				yield next;
				continue;
			}
			if (done) break;
			await new Promise<void>((resolve) => {
				pending = resolve;
			});
		}
		if (signal?.aborted) throw createAbortedWebSocketError();
		const error =
			failed ??
			(sawCompletion
				? null
				: createWebSocketError("WebSocket stream closed before response.completed", { retryable: true }));
		if (error) throw emittedOutput ? markNotRetryable(error) : error;
	} finally {
		socket.removeEventListener("message", onMessage);
		socket.removeEventListener("error", onError);
		socket.removeEventListener("close", onClose);
		signal?.removeEventListener("abort", onAbort);
	}
}

async function connectWebSocket(
	url: string,
	headers: Record<string, string>,
	signal?: AbortSignal,
): Promise<ResponsesWebSocket> {
	const WebSocketConstructor = getWebSocketConstructor();
	if (!WebSocketConstructor) throw new Error("WebSocket transport is not available in this runtime");
	const socketHeaders = { ...headers, "OpenAI-Beta": RESPONSES_WEBSOCKET_BETA_HEADER };

	return new Promise<ResponsesWebSocket>((resolve, reject) => {
		let settled = false;
		let socket: ResponsesWebSocket;
		try {
			socket = new WebSocketConstructor(url, { headers: socketHeaders });
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)));
			return;
		}

		const onOpen: WebSocketListener = () => settle(() => resolve(socket));
		const onError: WebSocketListener = (event) => settle(() => reject(extractWebSocketError(event)));
		const onClose: WebSocketListener = (event) => settle(() => reject(extractWebSocketCloseError(event)));
		const onAbort = () =>
			settle(() => {
				socket.close(1000, "aborted");
				reject(createAbortedWebSocketError());
			});
		const cleanup = () => {
			socket.removeEventListener("open", onOpen);
			socket.removeEventListener("error", onError);
			socket.removeEventListener("close", onClose);
			signal?.removeEventListener("abort", onAbort);
		};
		const settle = (complete: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			complete();
		};

		socket.addEventListener("open", onOpen);
		socket.addEventListener("error", onError);
		socket.addEventListener("close", onClose);
		signal?.addEventListener("abort", onAbort);
	});
}

function getWebSocketConstructor(): WebSocketConstructor | null {
	const webSocketConstructor = (globalThis as { WebSocket?: unknown }).WebSocket;
	return typeof webSocketConstructor === "function" ? (webSocketConstructor as unknown as WebSocketConstructor) : null;
}

function isWebSocketReusable(socket: ResponsesWebSocket): boolean {
	const readyState = (socket as { readyState?: unknown }).readyState;
	return typeof readyState !== "number" || readyState === 1;
}

function credentialFingerprint(headers: Record<string, string>): string {
	const credential = headers.Authorization ?? headers.authorization ?? "";
	let hash = 2166136261;
	for (let index = 0; index < credential.length; index += 1) {
		hash ^= credential.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}

function closeWebSocketSilently(socket: ResponsesWebSocket, code = 1000, reason = "done"): void {
	try {
		socket.close(code, reason);
	} catch {}
}

function scheduleSessionWebSocketExpiry(cacheKey: string, entry: CachedWebSocketConnection): void {
	if (entry.idleTimer) clearTimeout(entry.idleTimer);
	entry.idleTimer = setTimeout(() => {
		if (entry.busy) return;
		closeWebSocketSilently(entry.socket, 1000, "idle_timeout");
		websocketSessionCache.delete(cacheKey);
	}, SESSION_WEBSOCKET_CACHE_TTL_MS);
}

function extractWebSocketError(event: unknown): Error {
	const record = event && typeof event === "object" ? (event as Record<string, unknown>) : undefined;
	const message =
		typeof record?.message === "string" && record.message.length > 0 ? record.message : "WebSocket error";
	const status = readHandshakeStatus(record, message);
	return createWebSocketError(message, { status, retryable: isRetryableHandshakeStatus(status) });
}

/** 握手被拒时运行时通常只给出 HTTP 状态：优先取结构化字段，其次从消息里解析。 */
function readHandshakeStatus(record: Record<string, unknown> | undefined, message: string): number | undefined {
	if (record) {
		for (const key of ["status", "statusCode"]) {
			const value = record[key];
			if (typeof value === "number") return value;
		}
		const response = record.response;
		if (response && typeof response === "object") {
			const status = (response as { status?: unknown }).status;
			if (typeof status === "number") return status;
		}
	}
	const matched = /(?:server response|status(?: code)?|HTTP)\D{0,3}([1-5]\d{2})\b/i.exec(message);
	return matched ? Number(matched[1]) : undefined;
}

/** 4xx（除 408/429）是认证/参数类错误，重试无意义；无状态码的网络错误、5xx、408、429 可重试。 */
function isRetryableHandshakeStatus(status: number | undefined): boolean {
	if (status === undefined) return true;
	if (status === 408 || status === 429) return true;
	return status >= 500;
}

function isLifecycleOnlyEvent(event: Record<string, unknown>): boolean {
	return (
		event.type === "response.created" || event.type === "response.in_progress" || event.type === "response.queued"
	);
}

function createAbortedWebSocketError(): Error {
	return Object.assign(new Error("Request was aborted"), { retryable: false });
}

function markNotRetryable(error: Error): Error {
	return Object.assign(error, { retryable: false });
}

function extractWebSocketCloseError(event: unknown): Error {
	if (!event || typeof event !== "object") return createWebSocketError("WebSocket closed", { retryable: true });
	const code = "code" in event ? (event as { code?: unknown }).code : undefined;
	const reason = "reason" in event ? (event as { reason?: unknown }).reason : undefined;
	const codeText = typeof code === "number" ? ` ${code}` : "";
	const reasonText = typeof reason === "string" && reason.length > 0 ? ` ${reason}` : "";
	return createWebSocketError(`WebSocket closed${codeText}${reasonText}`.trim(), { retryable: true });
}

/**
 * 显式标记 retryable：无状态码的普通 Error 会被归一化为不可重试的 AI_TRANSPORT_FAILED，
 * 瞬时网络故障的自动重试会被跳过。带 HTTP 状态时由归一化器按状态码分类。
 */
function createWebSocketError(message: string, options: { status?: number; retryable: boolean }): Error {
	return Object.assign(new Error(message), {
		retryable: options.retryable,
		phase: "stream" as const,
		...(options.status === undefined ? {} : { status: options.status }),
	});
}

async function decodeWebSocketData(data: unknown): Promise<string | null> {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
	if (ArrayBuffer.isView(data)) {
		return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
	}
	if (data && typeof data === "object" && "arrayBuffer" in data) {
		const arrayBuffer = await (data as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
		return new TextDecoder().decode(new Uint8Array(arrayBuffer));
	}
	return null;
}

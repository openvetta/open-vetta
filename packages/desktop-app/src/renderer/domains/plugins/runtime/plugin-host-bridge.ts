import {
	activeSessionAtom,
	chatMessagesAtom,
	editImageAttachmentAtom,
	inputValueAtom,
	isStreamingAtom,
	languageAtom,
	selectedModelAtom,
} from "@shared/store/atoms";
import type { Message } from "@vetta/ai";
import type {
	ConversationEvent,
	ConversationMessage,
	ConversationState,
	Disposable,
	PluginAgentToolApi,
	PluginAgentToolHandler,
	PluginContinuationHandler,
	PluginConversationApi,
	PluginHostBridge,
	PluginImageRef,
} from "@vetta/plugin-sdk";
import { __setPluginHostBridge } from "@vetta/plugin-sdk";
import type { SessionEvent } from "@vetta/runtime-core";
import { getDefaultStore, useAtomValue } from "jotai";
import { useMemo } from "react";

const store = getDefaultStore();

interface PluginAgentToolHandlerEntry {
	handler: PluginAgentToolHandler;
	api: PluginAgentToolApi;
}

const agentToolHandlers = new Map<string, PluginAgentToolHandlerEntry>();
const continuationHandlers = new Map<string, PluginContinuationHandler>();

function handlerKey(pluginId: string, handlerId: string): string {
	return `${pluginId}:${handlerId}`;
}

// ─── Conversation event bus ───
//
// An isolated translator: it watches activeSessionAtom and opens its OWN
// session.subscribe on the active session, translating SessionEvents into
// plugin-facing ConversationEvents. This keeps useSessionManager's large
// handler untouched — IPC supports multiple subscribers per session.

type Listener = (event: ConversationEvent) => void;
const listeners = new Set<Listener>();

function emit(event: ConversationEvent): void {
	for (const listener of listeners) {
		try {
			listener(event);
		} catch (error) {
			console.error("Plugin conversation listener threw", error);
		}
	}
}

function snapshot(): ConversationState {
	const active = store.get(activeSessionAtom);
	return {
		id: active?.runtimeId ?? null,
		cwd: active?.cwd ?? null,
		sessionPath: active?.sessionPath ?? null,
		model: store.get(selectedModelAtom),
		isStreaming: store.get(isStreamingAtom),
	};
}

function messageText(message: Message): string {
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((block) =>
				block && typeof block === "object" && "text" in block
					? String((block as { text?: unknown }).text ?? "")
					: "",
			)
			.join("");
	}
	return "";
}

function translate(event: SessionEvent): void {
	switch (event.type) {
		case "session.lifecycle":
			if (event.phase === "agent_start") emit({ type: "turn-start" });
			else if (event.phase === "agent_end") emit({ type: "turn-end", stopReason: "stop" });
			else if (event.phase === "aborted") emit({ type: "turn-end", stopReason: "aborted" });
			return;
		case "message.delta":
			emit({ type: "message-updated", delta: event.delta });
			return;
		case "message.final":
			emit({
				type: "message-added",
				message: {
					id: event.eventId,
					role: (event.message.role === "user" ? "user" : "assistant") as ConversationMessage["role"],
					text: messageText(event.message),
					timestamp: event.timestamp,
				},
			});
			return;
		case "tool.start":
			emit({ type: "tool-call-start", toolCallId: event.toolCallId, toolName: event.toolName });
			return;
		case "tool.end":
			emit({
				type: "tool-call-end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				isError: event.isError,
			});
			return;
		default:
			return;
	}
}

let translatorStarted = false;
let currentRuntimeId: string | null = null;
let currentUnsub: (() => void) | null = null;

function startTranslator(): void {
	if (translatorStarted) return;
	translatorStarted = true;

	const sync = (): void => {
		const active = store.get(activeSessionAtom);
		const runtimeId = active?.runtimeId ?? null;
		if (runtimeId === currentRuntimeId) return;
		currentRuntimeId = runtimeId;
		currentUnsub?.();
		currentUnsub = null;
		emit({ type: "conversation-changed", conversation: snapshot() });
		if (!runtimeId) return;
		void window.vetta.session
			.subscribe(runtimeId, translate)
			.then((unsub) => {
				// The active session may have changed again before subscribe resolved.
				if (currentRuntimeId === runtimeId) currentUnsub = unsub;
				else unsub();
			})
			.catch((error: Error) => console.error("Plugin conversation subscribe failed", error));
	};

	store.sub(activeSessionAtom, sync);
	sync();
}

let toolRequestListenerStarted = false;

function startToolRequestListener(): void {
	if (toolRequestListenerStarted) return;
	toolRequestListenerStarted = true;
	window.vetta.plugins.onAgentToolRequest((request) => {
		const entry = agentToolHandlers.get(handlerKey(request.pluginId, request.handlerId));
		if (!entry) {
			void window.vetta.plugins.respondAgentTool(request.requestId, {
				error: `Plugin tool handler not found: ${request.pluginId}/${request.handlerId}`,
			});
			return;
		}
		void Promise.resolve(entry.handler(request.input, entry.api)).then(
			(value) => window.vetta.plugins.respondAgentTool(request.requestId, { value }),
			(error: unknown) =>
				window.vetta.plugins.respondAgentTool(request.requestId, {
					error: error instanceof Error ? error.message : String(error),
				}),
		);
	});
}

let continuationRequestListenerStarted = false;

function startContinuationRequestListener(): void {
	if (continuationRequestListenerStarted) return;
	continuationRequestListenerStarted = true;
	window.vetta.plugins.onContinuationRequest((request) => {
		const handler = continuationHandlers.get(handlerKey(request.pluginId, request.handlerId));
		if (!handler) {
			void window.vetta.plugins.respondContinuation(request.requestId, {
				error: `Plugin continuation handler not found: ${request.pluginId}/${request.handlerId}`,
			});
			return;
		}
		void Promise.resolve(handler({ sessionId: request.sessionId, cwd: request.cwd })).then(
			(value) => window.vetta.plugins.respondContinuation(request.requestId, { value }),
			(error: unknown) =>
				window.vetta.plugins.respondContinuation(request.requestId, {
					error: error instanceof Error ? error.message : String(error),
				}),
		);
	});
}

export function registerPluginAgentToolHandler(options: {
	pluginId: string;
	toolId: string;
	handlerId: string;
	handler: PluginAgentToolHandler;
	api: PluginAgentToolApi;
}): Disposable {
	const key = handlerKey(options.pluginId, options.handlerId);
	agentToolHandlers.set(key, { handler: options.handler, api: options.api });
	return {
		dispose: () => {
			const entry = agentToolHandlers.get(key);
			if (entry?.handler === options.handler) {
				agentToolHandlers.delete(key);
			}
		},
	};
}

export function registerPluginContinuationHandler(options: {
	pluginId: string;
	handlerId: string;
	handler: PluginContinuationHandler;
}): Disposable {
	const key = handlerKey(options.pluginId, options.handlerId);
	continuationHandlers.set(key, options.handler);
	return {
		dispose: () => {
			if (continuationHandlers.get(key) === options.handler) {
				continuationHandlers.delete(key);
			}
		},
	};
}

// ─── Conversation actions ───

/** Set by useSessionManager so sendPrompt reuses the full send path. */
export const pluginSendMessageRef: { current: ((text: string) => Promise<void>) | null } = {
	current: null,
};

const conversation: PluginConversationApi = {
	sendPrompt: async (text: string): Promise<void> => {
		const send = pluginSendMessageRef.current;
		if (!send) throw new Error("No active conversation to send to");
		await send(text);
	},
	insertText: (text: string): void => {
		store.set(inputValueAtom, text);
	},
	abort: async (): Promise<void> => {
		const active = store.get(activeSessionAtom);
		if (active?.runtimeId) await window.vetta.session.abort(active.runtimeId);
	},
	on: (listener: Listener): Disposable => {
		listeners.add(listener);
		return { dispose: () => listeners.delete(listener) };
	},
};

// ─── Hooks ───

function useActiveConversation(): ConversationState {
	const active = useAtomValue(activeSessionAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const model = useAtomValue(selectedModelAtom);
	return useMemo(
		() => ({
			id: active?.runtimeId ?? null,
			cwd: active?.cwd ?? null,
			sessionPath: active?.sessionPath ?? null,
			model,
			isStreaming,
		}),
		[active, model, isStreaming],
	);
}

function useConversationMessages(): ConversationMessage[] {
	const messages = useAtomValue(chatMessagesAtom);
	return useMemo(
		() => messages.map((m) => ({ id: m.id, role: m.role, text: m.text, timestamp: m.timestamp })),
		[messages],
	);
}

function useEditImageAttachment(): PluginImageRef | null {
	return useAtomValue(editImageAttachmentAtom);
}

function useLocale(): string {
	return useAtomValue(languageAtom);
}

/** The bridge the loader uses to build ctx.conversation (gated per plugin). */
export const pluginHostBridge: PluginHostBridge = {
	useActiveConversation,
	useConversationMessages,
	useEditImageAttachment,
	useLocale,
	conversation,
};

let installed = false;

/** Inject the bridge into the shared plugin-sdk and start the event translator. */
export function installPluginHostBridge(): void {
	startTranslator();
	startToolRequestListener();
	startContinuationRequestListener();
	if (installed) return;
	installed = true;
	__setPluginHostBridge(pluginHostBridge);
}

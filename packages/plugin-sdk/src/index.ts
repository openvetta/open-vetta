import type { ComponentType } from "react";

export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "agent.session.read"
	| "agent.session.write"
	| "agent.command.run"
	| "fs.read"
	| "fs.write"
	| "network.fetch"
	| "settings.read"
	| "settings.write";

export interface Disposable {
	dispose(): void;
}

// ─── UI slots ───

export interface PluginGlobalSlotContribution {
	id: string;
	component: ComponentType;
}

/**
 * The file handed to a file-preview plugin component. The host does NOT
 * pre-read or guess encoding — the plugin decides whether to read text or
 * bytes. `path` is also exposed for plugins that prefer native fetch.
 */
export interface PluginPreviewFile {
	path: string | null;
	name: string;
	extension: string;
	mime: string;
	size: number;
	/** Read the file as a UTF-8 string. */
	readText(): Promise<string>;
	/** Read the raw file bytes. */
	readBytes(): Promise<ArrayBuffer>;
	/** A fetchable streaming URL for the file (Range-capable). */
	getUrl(): string;
}

export interface PluginFilePreviewProps {
	file: PluginPreviewFile;
}

export interface PluginFilePreviewContribution {
	/** Lower-case extensions without the dot, e.g. ["svg"]. */
	extensions: string[];
	component: ComponentType<PluginFilePreviewProps>;
}

export interface PluginUiApi {
	registerGlobalSlot(contribution: PluginGlobalSlotContribution): Disposable;
	/**
	 * Register a preview component keyed by file extension. Honoured only for
	 * extensions the host has no built-in preview for ("fill the blanks");
	 * first registrant wins on conflict.
	 */
	registerFilePreview(contribution: PluginFilePreviewContribution): Disposable;
}

// ─── Conversation ───

export interface ConversationState {
	/** Active session runtimeId, or null when no conversation is active. */
	id: string | null;
	cwd: string | null;
	sessionPath: string | null;
	model: string | null;
	isStreaming: boolean;
}

export interface ConversationMessage {
	id: string;
	role: "user" | "assistant" | "compaction";
	text: string;
	timestamp?: number;
}

export type ConversationEvent =
	| { type: "turn-start" }
	| { type: "turn-end"; stopReason: string }
	| { type: "message-added"; message: ConversationMessage }
	| { type: "message-updated"; delta: string }
	| { type: "tool-call-start"; toolCallId: string; toolName: string }
	| { type: "tool-call-end"; toolCallId: string; toolName: string; isError: boolean }
	| { type: "conversation-changed"; conversation: ConversationState };

export interface PluginConversationApi {
	/** Send a prompt into the active conversation (renders as a user turn). */
	sendPrompt(text: string): Promise<void>;
	/** Fill the input bar without sending; the user can edit and send. */
	insertText(text: string): void;
	/** Abort the active conversation's current turn. */
	abort(): Promise<void>;
	/** Subscribe to real-time conversation events. */
	on(listener: (event: ConversationEvent) => void): Disposable;
}

// ─── Context & definition ───

export interface PluginPermissionApi {
	has(permission: PluginPermission): boolean;
	require(permission: PluginPermission): void;
}

export interface PluginContext {
	plugin: {
		id: string;
		version: string;
	};
	permissions: PluginPermissionApi;
	ui: PluginUiApi;
	conversation: PluginConversationApi;
}

export interface PluginDefinition {
	activate(ctx: PluginContext): void | Promise<void>;
	deactivate?(): void | Promise<void>;
}

export function definePlugin(plugin: PluginDefinition): PluginDefinition {
	return plugin;
}

// ─── Host bridge ───
//
// React hooks and conversation state read the host's jotai store. plugin-sdk
// cannot depend on desktop-app, so the host injects its implementation at
// startup (installPluginHostShim → __setPluginHostBridge). Module Federation
// makes host and plugins share this single pluginSdk instance, so the bridge
// the host sets is visible to the hooks the plugin calls.

export interface PluginHostBridge {
	useActiveConversation(): ConversationState;
	useConversationMessages(): ConversationMessage[];
	conversation: PluginConversationApi;
}

let hostBridge: PluginHostBridge | undefined;

export function __setPluginHostBridge(bridge: PluginHostBridge): void {
	hostBridge = bridge;
}

function requireBridge(): PluginHostBridge {
	if (!hostBridge) {
		throw new Error("Vetta plugin host bridge is not installed");
	}
	return hostBridge;
}

/** Reactive: the currently-active conversation's state. */
export function useActiveConversation(): ConversationState {
	return requireBridge().useActiveConversation();
}

/** Reactive: the active conversation's messages. */
export function useConversationMessages(): ConversationMessage[] {
	return requireBridge().useConversationMessages();
}

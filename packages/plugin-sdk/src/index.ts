import type { ComponentType, ReactNode } from "react";
import { createContext, useContext } from "react";

export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "ui.slot.activity-tab"
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
	/**
	 * Subscribe to on-disk changes of this file. The listener fires (debounced
	 * by the host) whenever the file's contents change, letting previews update
	 * live. Returns a Disposable; call dispose() to stop watching. A no-op for
	 * files without a real path (url-only sources).
	 */
	watch(listener: () => void): Disposable;
}

export interface PluginFilePreviewProps {
	file: PluginPreviewFile;
}

export interface PluginFilePreviewContribution {
	/** Lower-case extensions without the dot, e.g. ["svg"]. */
	extensions: string[];
	component: ComponentType<PluginFilePreviewProps>;
}

/**
 * An activity-panel tab contributed by a plugin. Registering only adds the
 * tab to the "addable pool" — it renders only after the user attaches it in
 * the activity panel (scoped by session cwd).
 */
export interface PluginActivityTabContribution {
	id: string;
	label: string;
	/** Tab icon as a React node (not an iconify class string). */
	icon?: ReactNode;
	component: ComponentType;
}

export interface PluginUiApi {
	registerGlobalSlot(contribution: PluginGlobalSlotContribution): Disposable;
	/**
	 * Register a preview component keyed by file extension. Honoured only for
	 * extensions the host has no built-in preview for ("fill the blanks");
	 * first registrant wins on conflict.
	 */
	registerFilePreview(contribution: PluginFilePreviewContribution): Disposable;
	/**
	 * Register an activity-panel tab into the addable pool. The user attaches
	 * it manually via the panel's "+" picker; attach records are keyed by the
	 * session cwd.
	 */
	registerActivityTab(contribution: PluginActivityTabContribution): Disposable;
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

// ─── Activity tab context ───

export interface ActivityTabContextValue {
	/**
	 * The cwd scope of the activity panel this tab is rendered in — the same
	 * key the attach record uses. Do NOT substitute useActiveConversation().cwd:
	 * on the project detail page the panel cwd is the project's, while the
	 * active conversation may belong to another project (or be null).
	 */
	cwd: string | null;
}

/**
 * Internal: the host wraps attached activity-tab components in this context's
 * Provider. Module Federation shares this single SDK instance, so the value
 * the host provides is visible to plugin components.
 */
export const __ActivityTabContext = createContext<ActivityTabContextValue>({ cwd: null });

/** The panel scope of the activity tab this component is rendered in. */
export function useActivityTab(): ActivityTabContextValue {
	return useContext(__ActivityTabContext);
}

/** Reactive: the currently-active conversation's state. */
export function useActiveConversation(): ConversationState {
	return requireBridge().useActiveConversation();
}

/** Reactive: the active conversation's messages. */
export function useConversationMessages(): ConversationMessage[] {
	return requireBridge().useConversationMessages();
}

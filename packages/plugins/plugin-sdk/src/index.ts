import type { ComponentType, ReactNode } from "react";
import { createContext, useContext } from "react";

export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "ui.slot.activity-tab"
	| "ui.slot.input-action"
	| "ui.slot.message"
	| "agent.session.read"
	| "agent.session.write"
	| "agent.command.run"
	| "fs.read"
	| "fs.write"
	| "network.fetch"
	| "images.generate"
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

/**
 * A reference to an image produced out-of-band by the host (e.g. an image
 * tool's result). The bytes are NOT carried inline — `url` is a host media
 * URL (Range-capable, usable directly as an `<img src>`).
 */
export interface PluginImageRef {
	id: string;
	url: string;
	mimeType?: string;
}

/**
 * Decoration a plugin contributes to the next outgoing prompt while its input
 * action is active. `metadata` is shallow-merged into the prompt request's
 * `metadata` bag, which the agent turn can read (e.g. `{ imageMode: true }`).
 */
export interface PluginPromptDecoration {
	metadata?: Record<string, unknown>;
}

/**
 * An action button shown in a row beneath the AI input bar. Rendered as a
 * toggle: clicking activates, clicking again deactivates. While active, the
 * host calls `decoratePrompt()` before each send and merges the returned
 * metadata into the outgoing prompt request. The plugin owns any side state
 * (it is the same Module Federation instance as its other slots).
 */
export interface PluginInputActionContribution {
	id: string;
	label: string;
	/** Button icon as a React node (not an iconify class string). */
	icon?: ReactNode;
	/** Whether the action begins in the active state. Defaults to false. */
	defaultActive?: boolean;
	/** Fired when the user toggles the action; `active` is the new state. */
	onToggle?(active: boolean): void;
	/**
	 * Called by the host before sending while the action is active. The
	 * returned metadata is merged into the outgoing prompt request.
	 */
	decoratePrompt?(): PluginPromptDecoration | void;
}

/**
 * The message handed to a per-message slot component. Extends the plain
 * conversation message with host-bound `imageRefs` — images whose generating
 * tool ran in this message's turn. Stored out-of-band, bound host-side; the
 * plugin renders from them and returns null when there are none.
 */
export interface PluginMessageSlotMessage extends ConversationMessage {
	imageRefs?: PluginImageRef[];
}

export interface PluginMessageSlotProps {
	message: PluginMessageSlotMessage;
}

/**
 * A component mounted beneath each (assistant) message in the message list.
 * Multiple plugins stack in registration order. The component should return
 * null for messages it has nothing to render for.
 */
export interface PluginMessageSlotContribution {
	id: string;
	component: ComponentType<PluginMessageSlotProps>;
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
	/**
	 * Register a toggle action shown beneath the AI input bar. While active,
	 * its `decoratePrompt()` annotates the next outgoing prompt.
	 */
	registerInputAction(contribution: PluginInputActionContribution): Disposable;
	/**
	 * Register a component mounted beneath each message in the message list.
	 * The component receives the message (with host-bound `imageRefs`).
	 */
	registerMessageSlot(contribution: PluginMessageSlotContribution): Disposable;
	/**
	 * Programmatically attach (if needed) and activate one of this plugin's
	 * own activity tabs in the current conversation's activity panel. `tabId`
	 * is the contribution id passed to registerActivityTab. Any payload (e.g.
	 * which image to edit) is passed via the plugin's own in-memory state.
	 */
	openActivityTab(tabId: string): void;
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

// ─── Images ───

export interface PluginGenerateImageInput {
	prompt: string;
	/** Optional reference id for grouping (e.g. the conversation/session). */
	sessionId?: string;
}

export interface PluginEditImageInput {
	prompt: string;
	/**
	 * Source image to edit. Either an existing host image id (continue a
	 * lineage) or raw base64 bytes (e.g. a user upload).
	 */
	source: { imageId: string } | { data: string; mimeType: string };
	sessionId?: string;
}

/**
 * Image generation, routed to the host's main-process image service (single
 * implementation shared with the agent's built-in image tool). Bytes are
 * stored out-of-band; results are returned as host media references.
 */
export interface PluginImagesApi {
	/** Text-to-image. Resolves to the produced image reference(s). */
	generate(input: PluginGenerateImageInput): Promise<PluginImageRef[]>;
	/** Image-to-image edit, producing the next version in a lineage. */
	edit(input: PluginEditImageInput): Promise<PluginImageRef[]>;
	/** The edit lineage (base image + its edits, oldest first) for an image. */
	lineage(imageId: string): Promise<PluginImageRef[]>;
}

// ─── Settings ───

/**
 * Read-side access to this plugin's settings (the values configured against
 * the `contributes.settings` schema declared in plugin.json, namespaced by
 * plugin id). Writes go through the host's settings UI, not the plugin.
 */
export interface PluginSettingsApi {
	get<T = unknown>(key: string): T | undefined;
	getAll(): Record<string, unknown>;
	/** Fired when any of this plugin's setting values change. */
	onChange(listener: (values: Record<string, unknown>) => void): Disposable;
}

export interface PluginContext {
	plugin: {
		id: string;
		version: string;
	};
	permissions: PluginPermissionApi;
	ui: PluginUiApi;
	conversation: PluginConversationApi;
	images: PluginImagesApi;
	settings: PluginSettingsApi;
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

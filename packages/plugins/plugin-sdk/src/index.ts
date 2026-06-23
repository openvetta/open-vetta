import type { ComponentType, ReactNode } from "react";
import { createContext, useContext } from "react";

export type PluginPermission =
	| "ui.slot.global"
	| "ui.slot.file-preview"
	| "ui.slot.activity-tab"
	| "ui.slot.input-action"
	| "ui.slot.message"
	| "ui.slot.tool-call"
	| "agent.session.read"
	| "agent.session.write"
	| "agent.command.run"
	| "agent.systemPrompt.read"
	| "agent.systemPrompt.write"
	| "agent.systemPrompt.fullControl"
	| "agent.skills.control"
	| "agent.tools.control"
	| "agent.tools.register"
	| "agent.toolHandler.execute"
	| "agent.state.read"
	| "agent.state.write"
	| "agent.continuation.register"
	| "agent.runtime.configure"
	| "fs.read"
	| "fs.write"
	| "network.fetch"
	| "images.generate"
	| "settings.read"
	| "settings.write";

export interface PluginAgentManifest {
	systemPrompt?: {
		/**
		 * Plugin-packaged prompt contribution file paths. Main-process aggregation
		 * resolves these relative to the installed plugin root.
		 */
		promptPaths?: string[];
	};
	/** Plugin-packaged skill files or directories to add to the agent resource graph. */
	skillPaths?: string[];
	/** Declarative tool visibility policy. Names are tool ids after registration. */
	toolPolicy?: {
		allow?: string[];
		deny?: string[];
	};
}

export interface Disposable {
	dispose(): void;
}

// ─── UI slots ───

export interface PluginGlobalSlotContribution {
	id: string;
	component: ComponentType;
}

export interface PluginAudioMetadata {
	/** Embedded title; preview renderers should fall back to file.name. */
	title?: string;
	artist?: string;
	/** Embedded cover art as a Data URL when available. */
	coverDataUrl?: string;
}

export interface PluginPreviewUrlOptions {
	/** Optional media hint for ambiguous containers such as webm. */
	mediaKind?: "audio" | "video";
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
	getUrl(options?: PluginPreviewUrlOptions): string;
	/**
	 * Subscribe to on-disk changes of this file. The listener fires (debounced
	 * by the host) whenever the file's contents change, letting previews update
	 * live. Returns a Disposable; call dispose() to stop watching. A no-op for
	 * files without a real path (url-only sources).
	 */
	watch(listener: () => void): Disposable;
	/**
	 * Host-provided audio metadata for local media files. Returns null when the
	 * host cannot provide metadata, e.g. url-only sources or unsupported files.
	 */
	getAudioMetadata?(): Promise<PluginAudioMetadata | null>;
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

/** Options for {@link PluginUiApi.openActivityTab}. */
export interface PluginOpenActivityTabOptions {
	/**
	 * Desired panel width as it opens: a pixel number, or `"max"` for the widest
	 * the current window allows. The host clamps to its min/max bounds. Omit to
	 * keep the user's current width.
	 */
	width?: number | "max";
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
	/**
	 * The edit-lineage root id this image belongs to (base image + all its edits
	 * share one rootId). Lets the host dedup per-message previews — only the
	 * latest message producing a given rootId renders the version swiper.
	 */
	rootId?: string;
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
	/**
	 * Fired when the user toggles the action; `active` is the new state. Return
	 * `false` when `active` is true to VETO the activation (e.g. the plugin needs
	 * configuration first) — the toggle stays off. Deactivation can't be vetoed.
	 */
	onToggle?(active: boolean): boolean | void;
	/**
	 * Called by the host before sending while the action is active. The
	 * returned metadata is merged into the outgoing prompt request.
	 */
	decoratePrompt?(): PluginPromptDecoration | void;
}

/**
 * A declarative, serializable descriptor for one card rendered beneath a
 * message. `type` selects a registered card renderer; `key` drives cross-turn
 * dedup (same key across turns = one logical card, shown only under its latest
 * anchor); `payload` carries STABLE REFERENCES (e.g. image ids), not a content
 * snapshot — the renderer resolves live state from it. `title`/`icon` label the
 * card's tab (override the renderer's registration defaults). Rides a tool
 * result's out-of-band `details.cards`; crosses the agent→host boundary, so
 * `icon` is an icon-symbol string, not a node.
 */
export interface CardDescriptor {
	type: string;
	key?: string;
	payload?: unknown;
	title?: string;
	icon?: string;
}

/** A pending (in-flight) tool call handed to a renderer's `pendingFor`. */
export interface PluginPendingToolCall {
	toolName: string;
	args: Record<string, unknown>;
}

/**
 * Props for a card renderer. `descriptor` is the card's data; `pending` is true
 * while it was synthesized from an in-flight tool (render a skeleton); `message`
 * is the anchoring conversation message.
 */
export interface PluginCardProps {
	descriptor: CardDescriptor;
	pending: boolean;
	message: ConversationMessage;
}

/**
 * A card renderer registered by a plugin, keyed by `type`. A descriptor whose
 * `type` matches is rendered by `component`. `title`/`icon` are the default tab
 * label/icon (a descriptor may override `title`). `pendingFor`, given an
 * in-flight tool call, returns a provisional descriptor so a skeleton card
 * appears (and claims a tab) before the tool's result lands — or null when this
 * renderer doesn't handle that tool. The `type` must be globally unique across
 * plugins (convention: prefix with the plugin id, e.g. "image-gen:preview").
 */
export interface PluginCardRendererContribution {
	type: string;
	component: ComponentType<PluginCardProps>;
	title?: string;
	/** Default tab icon as a React node (not an iconify class string). */
	icon?: ReactNode;
	pendingFor?: (toolCall: PluginPendingToolCall) => CardDescriptor | null;
}

/** A tool call handed to a tool-call slot renderer. */
export interface PluginToolCallSlotToolCall {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	status: "pending" | "success" | "error";
	result?: string;
	isError?: boolean;
}

export interface PluginToolCallSlotProps {
	toolCall: PluginToolCallSlotToolCall;
}

/**
 * A component that **replaces the host's default inline transcript rendering**
 * for a specific tool (matched by `toolName`; first registered renderer wins).
 * This is how a plugin renders rich UI for its OWN agent tool's output — plugin
 * tools cannot emit `details.cards`, so the message card system (registerCardRenderer)
 * does not serve them; the tool-call slot does.
 */
export interface PluginToolCallSlotContribution {
	id: string;
	toolName: string;
	component: ComponentType<PluginToolCallSlotProps>;
}

export interface PluginUiApi {
	registerGlobalSlot(contribution: PluginGlobalSlotContribution): Disposable;
	/**
	 * Register a preview component keyed by file extension. The host dispatches
	 * registered extensions before its built-in fallback renderers; first
	 * registrant wins on conflict.
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
	 * Register a card renderer keyed by `type`. Cards rendered beneath a message
	 * come from tool results' out-of-band `details.cards` (or `pendingFor` for
	 * in-flight tools); the host resolves each card's `type` to a registered
	 * renderer. Multiple cards under one message are shown as a tab-switcher
	 * ("收纳") or a flat list.
	 */
	registerCardRenderer(contribution: PluginCardRendererContribution): Disposable;
	/**
	 * Register a renderer that replaces the host's default inline transcript UI
	 * for a tool call (matched by `toolName`). The complement to card renderers:
	 * use it to render UI for a plugin's own agent tool output.
	 */
	registerToolCallSlot(contribution: PluginToolCallSlotContribution): Disposable;
	/**
	 * Programmatically attach (if needed) and activate one of this plugin's
	 * own activity tabs in the current conversation's activity panel. `tabId`
	 * is the contribution id passed to registerActivityTab. Any payload (e.g.
	 * which image to edit) is passed via the plugin's own in-memory state.
	 *
	 * Pass `options.width` to size the panel as it opens — a pixel number, or
	 * `"max"` to expand it to the widest the current window allows (the host
	 * still clamps to its min/max and auto-hides the sidebar when needed). Omit
	 * to leave the user's current width untouched.
	 */
	openActivityTab(tabId: string, options?: PluginOpenActivityTabOptions): void;
	/**
	 * Bind (or clear, with `null`) an image as the "edit target" for the next
	 * outgoing prompt. The host renders it as a thumbnail capsule in the AI input
	 * bar's top capsule strip and, at send time, injects `metadata.editImageId`
	 * (the ref's id) so this turn edits that image. One-shot: cleared after the
	 * prompt is sent (or when the user closes the capsule). Only the image
	 * reference (id/url) crosses over — bytes stay out-of-band.
	 */
	setEditImageAttachment(ref: PluginImageRef | null): void;
	/**
	 * Open the host's global full-screen image previewer for the given image.
	 * Only the image reference (id/url) crosses over — bytes stay out-of-band.
	 *
	 * Pass `group` (e.g. all images of the message) to open as an image group:
	 * the previewer shows a thumbnail strip + arrows and starts at `ref`.
	 */
	previewImage(ref: PluginImageRef, group?: PluginImageRef[]): void;
	/**
	 * Open the app settings, scrolled to and highlighting THIS plugin's own
	 * settings section (e.g. so the user can fill in a required API key/model).
	 * The host owns the navigation; the plugin only asks to jump there.
	 */
	openPluginSettings(): void;
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

// ─── Agent runtime ───

export type PluginJsonSchema = object;

export interface PluginAgentToolApi {
	fs: PluginFsApi;
	conversation: PluginConversationApi;
}

export type PluginAgentToolHandler<TInput = unknown> = (
	input: TInput,
	api: PluginAgentToolApi,
) => unknown | Promise<unknown>;

export interface PluginAgentToolRegistration<TInput = unknown> {
	id: string;
	name?: string;
	label?: string;
	description: string;
	parameters: PluginJsonSchema;
	timeoutMs?: number;
	handler: PluginAgentToolHandler<TInput>;
}

export interface PluginAgentApi {
	registerTool<TInput = unknown>(registration: PluginAgentToolRegistration<TInput>): Disposable;
	/**
	 * Register a policy consulted when the agent reaches a natural stopping point.
	 * Return null to allow the agent to stop, or a message to continue with another turn.
	 */
	registerContinuationProvider(registration: PluginContinuationRegistration): Disposable;
}

export interface PluginContinuationContext {
	sessionId: string;
	cwd: string;
}

export interface PluginContinuationResult {
	text: string;
	/** Stable key used by the host to suppress duplicate continuations in a session. */
	idempotencyKey?: string;
}

export type PluginContinuationHandler = (
	context: PluginContinuationContext,
) => PluginContinuationResult | null | Promise<PluginContinuationResult | null>;

export interface PluginContinuationRegistration {
	id: string;
	timeoutMs?: number;
	handler: PluginContinuationHandler;
}

// ─── Files ───

export interface PluginFsEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt: number;
}

export interface PluginFsFileRef {
	name: string;
	path: string;
	relPath: string;
}

export interface PluginFsStatResult {
	size: number;
	modifiedAt: number;
	createdAt: number;
}

export interface PluginFsReadResult {
	content: string;
	encoding: "utf8" | "base64";
}

export interface PluginFsApi {
	readDir(dirPath: string): Promise<PluginFsEntry[]>;
	readFile(filePath: string): Promise<PluginFsReadResult>;
	writeFile(filePath: string, content: string): Promise<void>;
	stat(filePath: string): Promise<PluginFsStatResult | null>;
	rename(oldPath: string, newPath: string): Promise<void>;
	delete(targetPath: string): Promise<void>;
	move(sourcePath: string, destDir: string): Promise<void>;
	createDirectory(dirPath: string): Promise<void>;
	listFilesRecursive(rootPath: string): Promise<PluginFsFileRef[]>;
}

// ─── Context & definition ───

export interface PluginPermissionApi {
	has(permission: PluginPermission): boolean;
	require(permission: PluginPermission): void;
}

// ─── Images ───

export interface PluginGenerateImageInput {
	prompt: string;
	/** Output size (e.g. "1024x1024"), decided by the agent and forwarded to the model. */
	size?: string;
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
	/**
	 * Every edit lineage the given session touched (generated or edited a version
	 * in), newest lineage first; each lineage's versions oldest → newest. The
	 * sessionId is the agent session id — derive it from the active conversation's
	 * `sessionPath` (the UUID embedded in the session file name).
	 */
	sessionLineages(sessionId: string): Promise<PluginImageRef[][]>;
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
	agent: PluginAgentApi;
	fs: PluginFsApi;
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
	useEditImageAttachment(): PluginImageRef | null;
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

/**
 * Reactive: the image currently bound as the edit target via
 * `ui.setEditImageAttachment` (or null). Single source of truth for the
 * "selected for edit" highlight — clears automatically when the host drops the
 * attachment (send, capsule close, or session switch).
 */
export function useEditImageAttachment(): PluginImageRef | null {
	return requireBridge().useEditImageAttachment();
}

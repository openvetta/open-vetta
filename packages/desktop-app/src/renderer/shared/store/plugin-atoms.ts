import type {
	PluginActivityTabContribution,
	PluginFilePreviewContribution,
	PluginImageRef,
	PluginInputActionContribution,
	PluginMessageSlotContribution,
} from "@vetta/plugin-sdk";
import { atom } from "jotai";

/** A file-preview contribution registered by a loaded plugin. */
export interface RegisteredFilePreview {
	/** Owning plugin id, for dedup/debugging. */
	pluginId: string;
	/** Lower-case extensions (no dot) this preview handles. */
	extensions: string[];
	component: PluginFilePreviewContribution["component"];
}

/**
 * Flat list of plugin file-preview registrations, published by
 * PluginGlobalSlotHost and consumed by FilePreviewView. First match wins.
 */
export const pluginFilePreviewsAtom = atom<RegisteredFilePreview[]>([]);

/** An activity-tab contribution registered by a loaded plugin（可添加池条目）. */
export interface RegisteredActivityTab {
	pluginId: string;
	/** Owning plugin display name, shown as the picker row subtitle. */
	pluginName: string;
	tabId: string;
	label: string;
	icon?: PluginActivityTabContribution["icon"];
	component: PluginActivityTabContribution["component"];
}

/**
 * 活动面板插件 tab 的「可添加池」，由 PluginGlobalSlotHost 发布、ActivityPanel
 * 消费。注册不直接渲染——attach 记录 ∩ 此池才渲染为 tab。
 */
export const pluginActivityTabsAtom = atom<RegisteredActivityTab[]>([]);

/** An input-action (toggle) contribution registered by a loaded plugin. */
export interface RegisteredInputAction {
	pluginId: string;
	/** Namespaced id (`${pluginId}:${contributionId}`). */
	actionId: string;
	label: string;
	icon?: PluginInputActionContribution["icon"];
	defaultActive?: boolean;
	onToggle?: PluginInputActionContribution["onToggle"];
	decoratePrompt?: PluginInputActionContribution["decoratePrompt"];
}

/** Input-action toggles shown beneath the AI input bar, published by PluginGlobalSlotHost. */
export const pluginInputActionsAtom = atom<RegisteredInputAction[]>([]);

/** The set of currently-active (toggled-on) input action ids. */
export const activeInputActionIdsAtom = atom<Set<string>>(new Set<string>());

/** A per-message slot contribution registered by a loaded plugin. */
export interface RegisteredMessageSlot {
	pluginId: string;
	/** Namespaced id (`${pluginId}:${contributionId}`). */
	slotId: string;
	component: PluginMessageSlotContribution["component"];
}

/** Per-message slot components, stacked beneath each assistant message in order. */
export const pluginMessageSlotsAtom = atom<RegisteredMessageSlot[]>([]);

/**
 * The image a plugin (image-gen) bound as the "edit target" via
 * `ui.setEditImageAttachment`. Rendered as a thumbnail capsule in the AI input
 * bar's top capsule strip; consumed at send time → `metadata.editImageId`, then
 * cleared (one-shot). `null` when nothing is attached.
 */
export const editImageAttachmentAtom = atom<PluginImageRef | null>(null);

/**
 * The source image id of the current in-flight edit turn (set at send when an
 * edit attachment was present, reset on each send). Lets PluginMessageSlotsHost
 * mark the generating message as editing that image's lineage — so its preview
 * card shows the full version swiper with a leading "generating" skeleton, and
 * the prior message's duplicate card self-hides.
 */
export const pendingEditImageIdAtom = atom<string | null>(null);

import type {
	PluginActivityTabContribution,
	PluginCardRendererContribution,
	PluginFilePreviewContribution,
	PluginImageRef,
	PluginInputActionContribution,
	PluginToolCallSlotContribution,
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
	/** 依赖的 agent 工具名；仅当其在当前会话激活时显示该 badge（见契约）。 */
	requiresActiveTool?: PluginInputActionContribution["requiresActiveTool"];
	onToggle?: PluginInputActionContribution["onToggle"];
	decoratePrompt?: PluginInputActionContribution["decoratePrompt"];
}

/** Input-action toggles shown beneath the AI input bar, published by PluginGlobalSlotHost. */
export const pluginInputActionsAtom = atom<RegisteredInputAction[]>([]);

/** The set of currently-active (toggled-on) input action ids. */
export const activeInputActionIdsAtom = atom<Set<string>>(new Set<string>());

/**
 * 原生「知识检索」开关（非插件输入动作）。开启后下一次发送携带
 * `metadata.knowledgeMode`，向 agent 注入一段仅模型可见的「优先查询知识库」提示。
 * 未开启时 agent 仍可按需调用知识库工具，开启只是明示。切换会话时重置。
 */
export const knowledgeRetrievalActiveAtom = atom<boolean>(false);

/**
 * 知识库总开关（镜像 desktop config 的 knowledgeBase.enabled，缺省开）。
 * 关闭后：隐藏「知识检索」按钮、agent 屏蔽知识库工具、停后台加工。
 * 由 useAppInit 启动同步、设置页保存时更新。
 */
export const knowledgeBaseEnabledAtom = atom<boolean>(true);

/**
 * 当前会话「激活（模型可见）的工具名集合」，由 useSessionManager 在打开会话时从
 * getState 的快照写入。`null` = 未知（新建会话页 / 尚未加载）→ 输入栏 badge 回退显示。
 * 非 null 时 badge 按其对应工具是否在集合内决定显示，跟随工具的 scope_use，消除双真相源漂移。
 */
export const activeToolNamesAtom = atom<Set<string> | null>(null);

/** A card renderer registered by a loaded plugin, keyed by `type`. */
export interface RegisteredCardRenderer {
	pluginId: string;
	/** Plugin-owned, globally-unique card type (matches a descriptor's `type`). */
	type: string;
	component: PluginCardRendererContribution["component"];
	/** Default tab label (a descriptor's `title` overrides this). */
	title?: string;
	/** Default tab icon (React node). */
	icon?: PluginCardRendererContribution["icon"];
	/** Synthesizes a provisional descriptor for an in-flight tool call. */
	pendingFor?: PluginCardRendererContribution["pendingFor"];
}

/**
 * Card renderers published by PluginGlobalSlotHost, consumed by the per-message
 * card host. The host resolves each card descriptor's `type` to one of these.
 */
export const pluginCardRenderersAtom = atom<RegisteredCardRenderer[]>([]);

/** A plugin renderer that replaces the default transcript UI for a specific tool. */
export interface RegisteredToolCallSlot {
	pluginId: string;
	/** Namespaced id (`${pluginId}:${contributionId}`). */
	slotId: string;
	toolName: string;
	component: PluginToolCallSlotContribution["component"];
}

/** Tool-call renderers keyed by `toolName`. First registered renderer wins. */
export const pluginToolCallSlotsAtom = atom<RegisteredToolCallSlot[]>([]);

/**
 * The image a plugin (image-gen) bound as the "edit target" via
 * `ui.setEditImageAttachment`. Rendered as a thumbnail capsule in the AI input
 * bar's top capsule strip; consumed at send time → `metadata.editImageId`, then
 * cleared (one-shot). `null` when nothing is attached.
 */
export const editImageAttachmentAtom = atom<PluginImageRef | null>(null);

/**
 * The source image id of the current in-flight edit turn (set at send when an
 * edit attachment was present, reset on each send). Lets the card host
 * mark the generating message as editing that image's lineage — so its preview
 * card shows the full version swiper with a leading "generating" skeleton, and
 * the prior message's duplicate card self-hides.
 */
export const pendingEditImageIdAtom = atom<string | null>(null);

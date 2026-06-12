import type { PluginActivityTabContribution, PluginFilePreviewContribution } from "@vetta/plugin-sdk";
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

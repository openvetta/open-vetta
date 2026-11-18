import { ChatDoodleBackdrop, type ChatDoodleBackdropProps } from "@shared/components/chat-doodle/ChatDoodleBackdrop";
import type { ComponentType } from "react";

/**
 * 聊天背景：对话页整页背后铺的那层底衬。
 *
 * 与「纹理」（新会话页底衬，见 `new-session-texture.ts`）同构：这里只定义「选了哪个」与
 * 目录元数据，画法由实现表给出。目录与实现表都放在 shared：对话页要按 id 铺，
 * 设置页要按同一张表画预览，两边共用一份表才不会出现「预览与页面对不上」。
 *
 * 默认是「无」：这层墙纸是可选的装饰，没选过的用户升级后对话页观感不变。
 */

export type ChatBackgroundId = "doodle" | "none";

export const CHAT_BACKGROUND_STORAGE_KEY = "vetta-chat-background";

export const DEFAULT_CHAT_BACKGROUND_ID: ChatBackgroundId = "none";

export interface ChatBackgroundCatalogEntry {
	/** i18n 描述文案（settings 命名空间）。 */
	readonly hintKey: string;
	readonly id: ChatBackgroundId;
	/** i18n 名称文案（settings 命名空间）。 */
	readonly labelKey: string;
}

/**
 * 背景目录：新增一档只要在这里加一项，再到实现表里挂上组件。
 * 保留 `as const` 是为了让 i18n key 收敛成字面量类型，`t()` 的键名校验才生效。
 */
export const CHAT_BACKGROUND_CATALOG = [
	{ id: "none", labelKey: "chatBackgroundNoneTitle", hintKey: "chatBackgroundNoneHint" },
	{ id: "doodle", labelKey: "chatBackgroundDoodleTitle", hintKey: "chatBackgroundDoodleHint" },
] as const satisfies readonly ChatBackgroundCatalogEntry[];

/**
 * 实现表：id → 组件。`null` 表示这一档什么都不画（「无」），对话页直接留出原本的底色。
 *
 * 预览与页面共用同一个组件：设置页那方格是裁小了的一块真纹路，不是另画的示意图。
 */
export const CHAT_BACKGROUND_COMPONENTS: Record<ChatBackgroundId, ComponentType<ChatDoodleBackdropProps> | null> = {
	doodle: ChatDoodleBackdrop,
	none: null,
};

export function isChatBackgroundId(value: string | null | undefined): value is ChatBackgroundId {
	return CHAT_BACKGROUND_CATALOG.some((entry) => entry.id === value);
}

export function getStoredChatBackgroundId(): ChatBackgroundId {
	const stored = localStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY);
	return isChatBackgroundId(stored) ? stored : DEFAULT_CHAT_BACKGROUND_ID;
}

export function setStoredChatBackgroundId(id: ChatBackgroundId): void {
	localStorage.setItem(CHAT_BACKGROUND_STORAGE_KEY, id);
}

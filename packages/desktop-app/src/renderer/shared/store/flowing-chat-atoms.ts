import type { ChatUnreadVO } from "@shared/lib/api";
import { atom } from "jotai";

/**
 * 全局：每个 flowing 的未读数。由 SSE 增量维护，
 * 也由初始一次性的 /chat/unread/summary 同步。
 */
export const flowingChatUnreadAtom = atom<Map<number, number>>(new Map());

/**
 * 全局：每个 flowing 的未读概况（含项目名 + 最近一条消息）。
 * 用于消息中心列表展示。SSE 收到新消息时增量更新。
 */
export const flowingChatSummaryAtom = atom<Map<number, ChatUnreadVO>>(new Map());

/** 总未读数（所有 flowing 累计） */
export const flowingChatTotalUnreadAtom = atom((get) => {
	const map = get(flowingChatUnreadAtom);
	let total = 0;
	for (const n of map.values()) total += n;
	return total;
});

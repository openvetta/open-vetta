import { atom } from "jotai";

/**
 * 全局：每个 flowing 的未读数。由 SSE 增量维护，
 * 也由初始一次性的 /chat/unread/summary 同步。
 */
export const flowingChatUnreadAtom = atom<Map<number, number>>(new Map());

/** 总未读数（所有 flowing 累计） */
export const flowingChatTotalUnreadAtom = atom((get) => {
	const map = get(flowingChatUnreadAtom);
	let total = 0;
	for (const n of map.values()) total += n;
	return total;
});

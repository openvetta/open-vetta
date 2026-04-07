import { useSSEEvent } from "@shared/hooks/useSSEEvent";
import { type ChatMessageVO, fetchChatUnreadSummary } from "@shared/lib/api";
import { authTokenAtom, authUserAtom, flowingChatUnreadAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";

/**
 * 应用级初始化：拉取初始未读概要 + 监听 SSE 维护未读 map。
 * 单挂载点：App.tsx 中调用一次。
 */
export function useFlowingChatInit(): void {
	const token = useAtomValue(authTokenAtom);
	const user = useAtomValue(authUserAtom);
	const setUnread = useSetAtom(flowingChatUnreadAtom);

	// 登录后拉取一次
	useEffect(() => {
		if (!token) {
			setUnread(new Map());
			return;
		}
		fetchChatUnreadSummary(token)
			.then((list) => {
				const m = new Map<number, number>();
				for (const item of list) {
					if (item.unread_count > 0) m.set(item.flowing_id, item.unread_count);
				}
				setUnread(m);
			})
			.catch(console.error);
	}, [token, setUnread]);

	// SSE: 新消息 → 增加未读（除非是自己发的）
	useSSEEvent(
		"chat:message:created",
		useCallback(
			(data: unknown) => {
				const msg = data as ChatMessageVO | null;
				if (!msg) return;
				if (user && msg.sender_id === user.id) return;
				setUnread((prev) => {
					const next = new Map(prev);
					next.set(msg.flowing_id, (next.get(msg.flowing_id) ?? 0) + 1);
					return next;
				});
			},
			[user, setUnread],
		),
	);

	// SSE: 已读位置更新（来自其他客户端）→ 当前 flowing 清零
	useSSEEvent(
		"chat:read:updated",
		useCallback(
			(data: unknown) => {
				const u = data as { flowing_id: number } | null;
				if (!u) return;
				setUnread((prev) => {
					if (!prev.has(u.flowing_id)) return prev;
					const next = new Map(prev);
					next.delete(u.flowing_id);
					return next;
				});
			},
			[setUnread],
		),
	);
}

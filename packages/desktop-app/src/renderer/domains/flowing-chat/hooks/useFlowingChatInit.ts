import { useSSEEvent } from "@shared/hooks/useSSEEvent";
import { type ChatMessageVO, fetchChatUnreadSummary } from "@shared/lib/api";
import { authTokenAtom, authUserAtom, flowingChatSummaryAtom, flowingChatUnreadAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";

/**
 * 应用级初始化：拉取初始未读概要 + 监听 SSE 维护未读 map / 摘要 map。
 * 单挂载点：App.tsx 中调用一次。
 */
export function useFlowingChatInit(): void {
	const token = useAtomValue(authTokenAtom);
	const user = useAtomValue(authUserAtom);
	const setUnread = useSetAtom(flowingChatUnreadAtom);
	const setSummary = useSetAtom(flowingChatSummaryAtom);

	// 登录后拉取一次
	useEffect(() => {
		if (!token) {
			setUnread(new Map());
			setSummary(new Map());
			return;
		}
		fetchChatUnreadSummary(token)
			.then((list) => {
				const um = new Map<number, number>();
				const sm = new Map<number, (typeof list)[number]>();
				for (const item of list) {
					if (item.unread_count > 0) um.set(item.flowing_id, item.unread_count);
					sm.set(item.flowing_id, item);
				}
				setUnread(um);
				setSummary(sm);
			})
			.catch(console.error);
	}, [token, setUnread, setSummary]);

	// SSE: 新消息 → 增加未读 + 更新摘要（除非是自己发的）
	useSSEEvent(
		"chat:message:created",
		useCallback(
			(data: unknown) => {
				const msg = data as ChatMessageVO | null;
				if (!msg) return;
				const isMine = !!user && msg.sender_id === user.id;

				// 摘要：每个 flowing 都更新最近一条
				setSummary((prev) => {
					const next = new Map(prev);
					const existing = next.get(msg.flowing_id);
					next.set(msg.flowing_id, {
						flowing_id: msg.flowing_id,
						project_name: existing?.project_name ?? "",
						unread_count: existing?.unread_count ?? 0,
						last_sender_id: msg.sender_id,
						last_sender: msg.sender_name,
						last_type: msg.type,
						last_content: previewOf(msg),
						last_created_at: msg.created_at,
					});
					return next;
				});

				if (isMine) return;
				setUnread((prev) => {
					const next = new Map(prev);
					next.set(msg.flowing_id, (next.get(msg.flowing_id) ?? 0) + 1);
					return next;
				});
			},
			[user, setUnread, setSummary],
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

function previewOf(msg: ChatMessageVO): string {
	if (msg.type === "image") return "[图片]";
	if (msg.type === "file") return "[文件]";
	if (msg.type === "system") return msg.content;
	const r = [...msg.content];
	if (r.length > 80) return `${r.slice(0, 80).join("")}…`;
	return msg.content;
}

import { useSSEEvent } from "@shared/hooks/useSSEEvent";
import {
	type ChatMember,
	type ChatMessageVO,
	deleteChatMessage,
	fetchChatMembers,
	fetchChatMessages,
	markChatRead,
	sendChatMessage,
	uploadChatAttachment,
} from "@shared/lib/api";
import {
	authTokenAtom,
	authUserAtom,
	flowingChatSummaryAtom,
	flowingChatUnreadAtom,
} from "@shared/store/atoms";
import type { ChatPanelViewProps } from "@vetta/theme-ui/flowing-chat";
import { useAtomValue, useSetAtom } from "jotai";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ChatComposer, type ChatComposerHandle } from "../components/ChatComposer";
import { ChatMembersBar } from "../components/ChatMembersBar";
import { ChatMessageList } from "../components/ChatMessageList";

const PAGE_SIZE = 50;

export function useChatPanelModel(flowingId: number): ChatPanelViewProps {
	const token = useAtomValue(authTokenAtom);
	const user = useAtomValue(authUserAtom);
	const setUnread = useSetAtom(flowingChatUnreadAtom);
	const setSummary = useSetAtom(flowingChatSummaryAtom);

	const [messages, setMessages] = useState<ChatMessageVO[]>([]);
	const [members, setMembers] = useState<ChatMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [hasMore, setHasMore] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [replyTo, setReplyTo] = useState<ChatMessageVO | null>(null);

	const scrollerRef = useRef<HTMLDivElement>(null);
	const composerRef = useRef<ChatComposerHandle>(null);
	const stickToBottomRef = useRef(true);
	const lastSeenIdRef = useRef(0);

	useEffect(() => {
		if (!token) return;
		setLoading(true);
		setMessages([]);
		setHasMore(true);
		setReplyTo(null);
		Promise.all([
			fetchChatMessages(token, flowingId, { limit: PAGE_SIZE }),
			fetchChatMembers(token, flowingId).catch(() => [] as ChatMember[]),
		])
			.then(([list, mems]) => {
				setMessages(list);
				setMembers(mems);
				setHasMore(list.length === PAGE_SIZE);
				stickToBottomRef.current = true;
			})
			.catch(console.error)
			.finally(() => setLoading(false));
	}, [token, flowingId]);

	useLayoutEffect(() => {
		if (loading) return;
		if (!stickToBottomRef.current) return;
		const el = scrollerRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [loading, messages]);

	const markReadIfNeeded = useCallback(() => {
		if (!token || messages.length === 0) return;
		const lastId = messages[messages.length - 1]!.id;
		if (lastId <= lastSeenIdRef.current) return;
		lastSeenIdRef.current = lastId;
		void markChatRead(token, flowingId, lastId).catch(console.error);
		setUnread((prev) => {
			if (!prev.has(flowingId)) return prev;
			const next = new Map(prev);
			next.delete(flowingId);
			return next;
		});
		setSummary((prev) => {
			const cur = prev.get(flowingId);
			if (!cur || cur.unread_count === 0) return prev;
			const next = new Map(prev);
			next.set(flowingId, { ...cur, unread_count: 0 });
			return next;
		});
	}, [token, flowingId, messages, setUnread, setSummary]);

	useEffect(() => {
		if (loading) return;
		if (!stickToBottomRef.current) return;
		markReadIfNeeded();
	}, [loading, messages, markReadIfNeeded]);

	useSSEEvent(
		"chat:message:created",
		useCallback(
			(data: unknown) => {
				const msg = data as ChatMessageVO | null;
				if (!msg || msg.flowing_id !== flowingId) return;
				setMessages((prev) => {
					if (prev.some((m) => m.id === msg.id)) return prev;
					return [...prev, msg];
				});
				if (msg.type === "system" && token) {
					void fetchChatMembers(token, flowingId).then(setMembers).catch(() => {});
				}
			},
			[flowingId, token],
		),
	);

	useSSEEvent(
		"chat:message:deleted",
		useCallback(
			(data: unknown) => {
				const msg = data as ChatMessageVO | null;
				if (!msg || msg.flowing_id !== flowingId) return;
				setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
			},
			[flowingId],
		),
	);

	const onScroll = useCallback(async () => {
		const el = scrollerRef.current;
		if (!el || !token) return;

		const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		stickToBottomRef.current = distanceToBottom < 64;

		if (el.scrollTop > 32 || loadingMore || !hasMore || messages.length === 0) return;

		setLoadingMore(true);
		const oldHeight = el.scrollHeight;
		const oldestId = messages[0]!.id;
		try {
			const older = await fetchChatMessages(token, flowingId, { before: oldestId, limit: PAGE_SIZE });
			if (older.length === 0) {
				setHasMore(false);
			} else {
				setMessages((prev) => [...older, ...prev]);
				if (older.length < PAGE_SIZE) setHasMore(false);
				requestAnimationFrame(() => {
					const cur = scrollerRef.current;
					if (!cur) return;
					cur.scrollTop = cur.scrollHeight - oldHeight;
				});
			}
		} catch (err) {
			console.error(err);
		} finally {
			setLoadingMore(false);
		}
	}, [token, flowingId, hasMore, loadingMore, messages]);

	const handleSendText = useCallback(
		async (text: string, mentionedUserIds: number[]) => {
			if (!token || !text.trim()) return;
			try {
				await sendChatMessage(token, flowingId, {
					type: "text",
					content: text,
					mentioned_user_ids: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
					reply_to_id: replyTo?.id,
				});
				stickToBottomRef.current = true;
				setReplyTo(null);
			} catch (err) {
				console.error(err);
			}
		},
		[token, flowingId, replyTo],
	);

	const handleSendFiles = useCallback(
		async (files: File[]) => {
			if (!token || files.length === 0) return;
			try {
				for (const f of files) {
					const att = await uploadChatAttachment(token, flowingId, f);
					await sendChatMessage(token, flowingId, {
						type: att.type,
						attachments: [att],
						reply_to_id: replyTo?.id,
					});
				}
				stickToBottomRef.current = true;
				setReplyTo(null);
			} catch (err) {
				console.error(err);
			}
		},
		[token, flowingId, replyTo],
	);

	const handleRecall = useCallback(
		async (msg: ChatMessageVO) => {
			if (!token) return;
			try {
				await deleteChatMessage(token, flowingId, msg.id);
			} catch (err) {
				console.error(err);
				alert(err instanceof Error ? err.message : "撤回失败");
			}
		},
		[token, flowingId],
	);

	const handleMention = useCallback((member: ChatMember) => {
		composerRef.current?.insertMention(member);
		composerRef.current?.focus();
	}, []);

	const mentionFromSender = useCallback(
		(senderId: number, senderName: string, senderAvatar: string) => {
			handleMention({ id: senderId, username: senderName, avatar: senderAvatar });
		},
		[handleMention],
	);

	const currentUserId = useMemo(() => user?.id ?? 0, [user]);

	return {
		labels: {
			loadingMore: "加载更早消息",
			noMore: "没有更早的消息",
			empty: "还没有消息，发送第一条吧",
		},
		loading,
		loadingMore,
		hasMore,
		isEmpty: messages.length === 0,
		scrollerRef,
		onScroll: () => void onScroll(),
		membersBar: (
			<ChatMembersBar
				members={members}
				currentUserId={currentUserId}
				onMention={handleMention}
			/>
		),
		messageList: (
			<ChatMessageList
				messages={messages}
				currentUserId={currentUserId}
				onReply={setReplyTo}
				onRecall={handleRecall}
				onMentionSender={mentionFromSender}
			/>
		),
		composer: (
			<ChatComposer
				ref={composerRef}
				replyTo={replyTo}
				onClearReply={() => setReplyTo(null)}
				onSendText={handleSendText}
				onSendFiles={handleSendFiles}
				members={members}
				currentUserId={currentUserId}
			/>
		),
	};
}

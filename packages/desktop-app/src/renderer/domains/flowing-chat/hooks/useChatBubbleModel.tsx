import type { ChatAttachment, ChatMessageVO } from "@shared/lib/api";
import { chatAttachmentUrl } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { authTokenAtom, filePreviewAtom } from "@shared/store/atoms";
import type { ChatBubbleViewProps } from "@vetta/theme-ui/flowing-chat";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState, type ReactNode } from "react";

const RECALL_WINDOW_MS = 2 * 60 * 1000;

export function useChatBubbleModel(input: {
	msg: ChatMessageVO;
	isMine: boolean;
	compact: boolean;
	onReply: (msg: ChatMessageVO) => void;
	onRecall: (msg: ChatMessageVO) => void;
	onMentionSender: (senderId: number, senderName: string, senderAvatar: string) => void;
}): ChatBubbleViewProps {
	const { msg, isMine, compact } = input;
	const canRecall = isMine && Date.now() - new Date(msg.created_at).getTime() < RECALL_WINDOW_MS;

	let mediaContent: ReactNode = null;
	if (msg.type === "image" && msg.attachments[0]) {
		mediaContent = (
			<div className="overflow-hidden rounded-2xl">
				<ImagePreview att={msg.attachments[0]} />
			</div>
		);
	} else if (msg.type === "file") {
		mediaContent = (
			<div className="flex flex-col gap-1.5">
				{msg.attachments.map((a) => (
					<FileAttachment key={a.storage_key} att={a} isMine={isMine} />
				))}
			</div>
		);
	}

	return {
		isMine,
		compact,
		type: msg.type,
		content: msg.content,
		senderName: msg.sender_name,
		senderAvatar: msg.sender_avatar,
		deleted: !!msg.deleted_at,
		canRecall,
		timeLabel: formatTime(msg.created_at),
		replySnapshot: msg.reply_to_snapshot
			? {
					senderName: msg.reply_to_snapshot.sender_name,
					deleted: !!msg.reply_to_snapshot.deleted,
					preview: msg.reply_to_snapshot.preview,
				}
			: null,
		labels: {
			recalledMine: "你撤回了一条消息",
			recalledOther: (name) => `${name} 撤回了一条消息`,
			reply: "引用",
			recall: "撤回",
			recalledSuffix: "已撤回",
			mentionTitle: (name, mine) => (mine ? name : `${name}（右键 @ 提及）`),
		},
		mediaContent,
		onReply: () => input.onReply(msg),
		onRecall: () => input.onRecall(msg),
		onMentionSender: () =>
			input.onMentionSender(msg.sender_id, msg.sender_name, msg.sender_avatar),
	};
}

function ImagePreview({ att }: { att: ChatAttachment }): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const setPreview = useSetAtom(filePreviewAtom);
	const [url, setUrl] = useState<string>("");
	useEffect(() => {
		if (!token) return;
		void chatAttachmentUrl(token, att.storage_key).then(setUrl);
	}, [token, att.storage_key]);
	if (!url) return <div className="h-32 w-32 animate-pulse rounded-xl bg-muted/40" />;
	return (
		<button
			type="button"
			onClick={() => setPreview({ name: att.name, url, kind: "image", mime: att.mime, size: att.size })}
			className="block"
		>
			<img
				src={url}
				alt={att.name}
				className="max-h-64 max-w-full rounded-xl object-cover transition-opacity duration-200 hover:opacity-95"
			/>
		</button>
	);
}

function FileAttachment({ att, isMine }: { att: ChatAttachment; isMine: boolean }): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const setPreview = useSetAtom(filePreviewAtom);
	const [url, setUrl] = useState<string>("");
	useEffect(() => {
		if (!token) return;
		void chatAttachmentUrl(token, att.storage_key).then(setUrl);
	}, [token, att.storage_key]);
	return (
		<button
			type="button"
			onClick={() => {
				if (!url) return;
				setPreview({ name: att.name, url, kind: "file", mime: att.mime, size: att.size });
			}}
			className={cn(
				"flex w-full max-w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-shadow duration-200",
				"shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_-2px_rgba(15,23,42,0.05)]",
				"hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_4px_12px_-2px_rgba(15,23,42,0.08)]",
				isMine
					? "rounded-br-md bg-blue-50 dark:bg-indigo-500/15"
					: "rounded-bl-md border border-border/40 bg-card",
			)}
		>
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
				<span className="icon-[mdi--file-document-outline] h-4.5 w-4.5 text-primary" />
			</div>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="line-clamp-2 break-all text-[12px] font-medium text-foreground">{att.name}</span>
				<span className="text-[10px] text-muted-foreground/70">{formatSize(att.size)}</span>
			</span>
		</button>
	);
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

import type { ChatAttachment, ChatMessageVO } from "@shared/lib/api";
import { chatAttachmentUrl } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { authTokenAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";

interface ChatBubbleProps {
	msg: ChatMessageVO;
	isMine: boolean;
	compact: boolean;
	onReply: (msg: ChatMessageVO) => void;
	onRecall: (msg: ChatMessageVO) => void;
}

const RECALL_WINDOW_MS = 2 * 60 * 1000;

export function ChatBubble({ msg, isMine, compact, onReply, onRecall }: ChatBubbleProps): JSX.Element {
	// 系统消息：居中胶囊
	if (msg.type === "system") {
		return (
			<div className="my-1 flex justify-center">
				<div className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] text-muted-foreground/70">
					{msg.content}
				</div>
			</div>
		);
	}

	if (msg.deleted_at) {
		return (
			<div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
				<div className="rounded-full bg-muted/40 px-2.5 py-0.5 text-[10px] italic text-muted-foreground/60">
					{isMine ? "你撤回了一条消息" : `${msg.sender_name} 撤回了一条消息`}
				</div>
			</div>
		);
	}

	const canRecall = isMine && Date.now() - new Date(msg.created_at).getTime() < RECALL_WINDOW_MS;

	return (
		<div className={cn("group flex gap-2", isMine ? "flex-row-reverse" : "flex-row")}>
			<div className="w-7 flex-shrink-0">
				{!compact && <Avatar name={msg.sender_name} url={msg.sender_avatar} />}
			</div>
			<div className={cn("flex max-w-[75%] flex-col", isMine ? "items-end" : "items-start")}>
				{!compact && (
					<div className="mb-0.5 px-1 text-[10px] text-muted-foreground/60">{msg.sender_name}</div>
				)}
				{msg.reply_to_snapshot && (
					<div
						className={cn(
							"mb-0.5 max-w-full truncate rounded-md border-l-2 px-2 py-1 text-[10px]",
							isMine
								? "border-primary/40 bg-primary/5 text-muted-foreground"
								: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
						)}
					>
						<div className="font-medium">
							{msg.reply_to_snapshot.sender_name}
							{msg.reply_to_snapshot.deleted && " · 已撤回"}
						</div>
						<div className="truncate">{msg.reply_to_snapshot.preview}</div>
					</div>
				)}
				<div
					className={cn(
						"relative rounded-2xl px-3 py-1.5 text-[12px] leading-[18px] whitespace-pre-wrap break-words",
						isMine
							? "rounded-br-sm bg-primary text-primary-foreground"
							: "rounded-bl-sm bg-muted text-foreground",
					)}
				>
					{msg.type === "text" && msg.content}
					{msg.type === "image" && msg.attachments[0] && <ImagePreview att={msg.attachments[0]} />}
					{msg.type === "file" &&
						msg.attachments.map((a) => <FileAttachment key={a.storage_key} att={a} />)}
				</div>
				<div className={cn("mt-0.5 flex items-center gap-2 px-1 text-[9px] text-muted-foreground/50")}>
					<span>{formatTime(msg.created_at)}</span>
					<button
						type="button"
						onClick={() => onReply(msg)}
						className="hidden hover:underline group-hover:inline"
					>
						引用
					</button>
					{canRecall && (
						<button
							type="button"
							onClick={() => onRecall(msg)}
							className="hidden hover:underline group-hover:inline"
						>
							撤回
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

function Avatar({ name, url }: { name: string; url: string }): JSX.Element {
	if (url) {
		return <img src={url} alt={name} className="h-7 w-7 rounded-full object-cover" />;
	}
	const ch = name?.[0] ?? "?";
	return (
		<div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground">
			{ch}
		</div>
	);
}

function ImagePreview({ att }: { att: ChatAttachment }): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const [url, setUrl] = useState<string>("");
	useEffect(() => {
		if (!token) return;
		void chatAttachmentUrl(token, att.storage_key).then(setUrl);
	}, [token, att.storage_key]);
	if (!url) return <div className="h-32 w-32 rounded bg-muted/40" />;
	return (
		<a href={url} target="_blank" rel="noreferrer">
			<img src={url} alt={att.name} className="max-h-60 max-w-full rounded" />
		</a>
	);
}

function FileAttachment({ att }: { att: ChatAttachment }): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const [url, setUrl] = useState<string>("");
	useEffect(() => {
		if (!token) return;
		void chatAttachmentUrl(token, att.storage_key).then(setUrl);
	}, [token, att.storage_key]);
	return (
		<a
			href={url}
			target="_blank"
			rel="noreferrer"
			className="flex items-center gap-2 rounded border border-current/10 bg-background/40 px-2 py-1.5 text-current"
		>
			<span className="icon-[mdi--file-outline] h-4 w-4 flex-shrink-0" />
			<span className="flex flex-col">
				<span className="text-[12px]">{att.name}</span>
				<span className="text-[10px] opacity-60">{formatSize(att.size)}</span>
			</span>
		</a>
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

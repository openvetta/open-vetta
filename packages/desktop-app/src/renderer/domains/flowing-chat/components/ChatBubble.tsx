import type { ChatAttachment, ChatMessageVO } from "@shared/lib/api";
import { chatAttachmentUrl } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { authTokenAtom, filePreviewAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface ChatBubbleProps {
	msg: ChatMessageVO;
	isMine: boolean;
	compact: boolean;
	onReply: (msg: ChatMessageVO) => void;
	onRecall: (msg: ChatMessageVO) => void;
	onMentionSender: (senderId: number, senderName: string, senderAvatar: string) => void;
}

const RECALL_WINDOW_MS = 2 * 60 * 1000;

export function ChatBubble({
	msg,
	isMine,
	compact,
	onReply,
	onRecall,
	onMentionSender,
}: ChatBubbleProps): JSX.Element {
	// 系统消息：居中胶囊
	if (msg.type === "system") {
		return (
			<motion.div
				initial={{ opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.18 }}
				className="my-2 flex justify-center"
			>
				<div className="rounded-full bg-muted/60 px-3 py-1 text-[10.5px] tracking-wide text-muted-foreground/70 backdrop-blur-sm">
					{msg.content}
				</div>
			</motion.div>
		);
	}

	if (msg.deleted_at) {
		return (
			<motion.div
				initial={{ opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.18 }}
				className={cn("flex gap-2.5", isMine ? "flex-row-reverse" : "flex-row")}
			>
				<div className="w-8 flex-shrink-0" />
				<div className="rounded-full bg-muted/60 px-3 py-1 text-[10.5px] italic text-muted-foreground/70">
					{isMine ? "你撤回了一条消息" : `${msg.sender_name} 撤回了一条消息`}
				</div>
			</motion.div>
		);
	}

	const canRecall = isMine && Date.now() - new Date(msg.created_at).getTime() < RECALL_WINDOW_MS;

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
			className={cn("group flex gap-2.5", isMine ? "flex-row-reverse" : "flex-row")}
		>
			<div className="w-8 flex-shrink-0">
				{!compact && (
					<button
						type="button"
						onContextMenu={(e) => {
							e.preventDefault();
							if (isMine) return;
							onMentionSender(msg.sender_id, msg.sender_name, msg.sender_avatar);
						}}
						title={isMine ? msg.sender_name : `${msg.sender_name}（右键 @ 提及）`}
						className="block rounded-full transition-transform hover:scale-105"
					>
						<Avatar name={msg.sender_name} url={msg.sender_avatar} />
					</button>
				)}
			</div>
			<div className={cn("flex max-w-[78%] flex-col", isMine ? "items-end" : "items-start")}>
				{!compact && (
					<div className="mb-1 px-1 text-[10.5px] font-medium text-muted-foreground/70">
						{msg.sender_name}
					</div>
				)}

				{msg.type === "text" && (
					<div
						className={cn(
							"relative rounded-2xl px-3.5 py-2 text-[12.5px] leading-[18px] whitespace-pre-wrap break-words",
							"shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_-2px_rgba(15,23,42,0.05)]",
							"transition-shadow duration-200 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_4px_12px_-2px_rgba(15,23,42,0.08)]",
							isMine
								? "rounded-br-md bg-blue-50 text-foreground dark:bg-indigo-500/15"
								: "rounded-bl-md border border-border/40 bg-card text-foreground",
						)}
					>
						{renderTextWithMentions(msg.content, isMine)}
					</div>
				)}

				{msg.type === "image" && msg.attachments[0] && (
					<div className="overflow-hidden rounded-2xl">
						<ImagePreview att={msg.attachments[0]} />
					</div>
				)}

				{msg.type === "file" && (
					<div className="flex flex-col gap-1.5">
						{msg.attachments.map((a) => (
							<FileAttachment key={a.storage_key} att={a} isMine={isMine} />
						))}
					</div>
				)}

				{msg.reply_to_snapshot && (
					<div
						className={cn(
							"mt-1 max-w-full truncate rounded-xl bg-muted/70 px-3 py-1.5 text-[11px] text-muted-foreground",
							"shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
						)}
					>
						<span className="font-medium text-foreground/70">
							{msg.reply_to_snapshot.sender_name}
							{msg.reply_to_snapshot.deleted && " · 已撤回"}：
						</span>
						<span>{msg.reply_to_snapshot.preview}</span>
					</div>
				)}

				<div
					className={cn(
						"mt-1 flex items-center gap-2 px-1 text-[9.5px] text-muted-foreground/50",
						isMine ? "flex-row-reverse" : "flex-row",
					)}
				>
					<span>{formatTime(msg.created_at)}</span>
					<div
						className={cn(
							"flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
						)}
					>
						<button
							type="button"
							onClick={() => onReply(msg)}
							className="hover:text-foreground"
						>
							引用
						</button>
						{canRecall && (
							<button
								type="button"
								onClick={() => onRecall(msg)}
								className="hover:text-destructive"
							>
								撤回
							</button>
						)}
					</div>
				</div>
			</div>
		</motion.div>
	);
}

function renderTextWithMentions(content: string, isMine: boolean): JSX.Element {
	// 高亮 @xxx
	const parts = content.split(/(@\S+)/g);
	return (
		<span>
			{parts.map((p, i) => {
				if (p.startsWith("@") && p.length > 1) {
					return (
						<span
							key={i}
							className={cn(
								"font-medium",
								isMine ? "text-indigo-600 dark:text-indigo-300" : "text-primary",
							)}
						>
							{p}
						</span>
					);
				}
				return <span key={i}>{p}</span>;
			})}
		</span>
	);
}

function Avatar({ name, url }: { name: string; url: string }): JSX.Element {
	if (url) {
		return (
			<div className="relative">
				<img
					src={url}
					alt={name}
					className="h-8 w-8 rounded-full object-cover ring-2 ring-background"
				/>
			</div>
		);
	}
	const ch = name?.[0]?.toUpperCase() ?? "?";
	return (
		<div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 text-[12px] font-medium text-muted-foreground ring-2 ring-background">
			{ch}
		</div>
	);
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
				<span className="line-clamp-2 break-all text-[12px] font-medium text-foreground">
					{att.name}
				</span>
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

import type { ChatMessageVO } from "@shared/lib/api";
import { Textarea } from "@shared/components/ui/textarea";
import { cn } from "@shared/lib/utils";
import { useCallback, useRef, useState } from "react";

interface ChatComposerProps {
	replyTo: ChatMessageVO | null;
	onClearReply: () => void;
	onSendText: (text: string) => Promise<void>;
	onSendFiles: (files: File[]) => Promise<void>;
}

export function ChatComposer({
	replyTo,
	onClearReply,
	onSendText,
	onSendFiles,
}: ChatComposerProps): JSX.Element {
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);

	const submit = useCallback(async () => {
		const text = value.trim();
		if (!text || busy) return;
		setBusy(true);
		try {
			await onSendText(text);
			setValue("");
		} finally {
			setBusy(false);
		}
	}, [value, busy, onSendText]);

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault();
				void submit();
			}
		},
		[submit],
	);

	const handleFiles = useCallback(
		async (files: FileList | null) => {
			if (!files || files.length === 0 || busy) return;
			setBusy(true);
			try {
				await onSendFiles(Array.from(files));
			} finally {
				setBusy(false);
			}
		},
		[busy, onSendFiles],
	);

	return (
		<div className="border-t border-border bg-background/40 px-2 pb-2 pt-1.5">
			{replyTo && (
				<div className="mb-1 flex items-center gap-2 rounded-md border-l-2 border-primary/40 bg-muted/40 px-2 py-1 text-[10px]">
					<span className="icon-[mdi--reply] h-3 w-3 text-muted-foreground/70" />
					<div className="min-w-0 flex-1 truncate">
						<span className="font-medium">{replyTo.sender_name}：</span>
						<span className="text-muted-foreground">{getReplyPreview(replyTo)}</span>
					</div>
					<button
						type="button"
						onClick={onClearReply}
						className="text-muted-foreground/60 hover:text-foreground"
					>
						<span className="icon-[mdi--close] h-3 w-3" />
					</button>
				</div>
			)}
			<div className="flex items-end gap-1">
				<button
					type="button"
					onClick={() => imageInputRef.current?.click()}
					disabled={busy}
					title="发送图片"
					className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground disabled:opacity-40"
				>
					<span className="icon-[mdi--image-outline] h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					disabled={busy}
					title="发送文件"
					className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground disabled:opacity-40"
				>
					<span className="icon-[mdi--paperclip] h-4 w-4" />
				</button>
				<Textarea
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={onKeyDown}
					disabled={busy}
					placeholder="输入消息，Enter 发送，Shift+Enter 换行"
					rows={1}
					className="min-h-[28px] resize-none rounded border border-border bg-background px-2 py-1 text-[12px]"
				/>
				<button
					type="button"
					onClick={() => void submit()}
					disabled={busy || value.trim() === ""}
					className={cn(
						"flex h-7 w-7 items-center justify-center rounded transition-colors",
						value.trim() && !busy
							? "bg-primary text-primary-foreground hover:bg-primary/90"
							: "bg-muted text-muted-foreground/50",
					)}
				>
					<span className="icon-[mdi--send] h-4 w-4" />
				</button>
			</div>
			<input
				ref={imageInputRef}
				type="file"
				accept="image/*"
				multiple
				className="hidden"
				onChange={(e) => {
					void handleFiles(e.target.files);
					e.target.value = "";
				}}
			/>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={(e) => {
					void handleFiles(e.target.files);
					e.target.value = "";
				}}
			/>
		</div>
	);
}

function getReplyPreview(msg: ChatMessageVO): string {
	if (msg.type === "text") return msg.content.slice(0, 80);
	if (msg.type === "image") return "[图片]";
	if (msg.type === "file") return `[文件] ${msg.attachments[0]?.name ?? ""}`;
	return msg.content;
}

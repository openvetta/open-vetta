import type { ChatMessageVO } from "@shared/lib/api";
import { Fragment } from "react";
import { ChatBubble } from "./ChatBubble";

interface ChatMessageListProps {
	messages: ChatMessageVO[];
	currentUserId: number;
	onReply: (msg: ChatMessageVO) => void;
	onRecall: (msg: ChatMessageVO) => void;
	onMentionSender: (senderId: number, senderName: string, senderAvatar: string) => void;
}

export function ChatMessageList({
	messages,
	currentUserId,
	onReply,
	onRecall,
	onMentionSender,
}: ChatMessageListProps): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			{messages.map((m, i) => {
				const prev = messages[i - 1];
				const showDate = !prev || dateKey(prev.created_at) !== dateKey(m.created_at);
				const compact =
					!!prev &&
					!showDate &&
					prev.sender_id === m.sender_id &&
					m.type !== "system" &&
					prev.type !== "system" &&
					new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

				return (
					<Fragment key={m.id}>
						{showDate && <DateDivider iso={m.created_at} />}
						<ChatBubble
							msg={m}
							isMine={m.sender_id === currentUserId}
							compact={compact}
							onReply={onReply}
							onRecall={onRecall}
							onMentionSender={onMentionSender}
						/>
					</Fragment>
				);
			})}
		</div>
	);
}

function DateDivider({ iso }: { iso: string }): JSX.Element {
	return (
		<div className="my-2 flex items-center justify-center">
			<span className="rounded-full bg-muted/40 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
				{formatDate(iso)}
			</span>
		</div>
	);
}

function dateKey(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	const now = new Date();
	const sameDay =
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate();
	if (sameDay) return "今天";
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (
		d.getFullYear() === yesterday.getFullYear() &&
		d.getMonth() === yesterday.getMonth() &&
		d.getDate() === yesterday.getDate()
	) {
		return "昨天";
	}
	return `${d.getMonth() + 1}月${d.getDate()}日`;
}

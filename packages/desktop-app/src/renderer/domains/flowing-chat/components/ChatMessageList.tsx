import type { ChatMessageVO } from "@shared/lib/api";
import { ChatBubble } from "./ChatBubble";

interface ChatMessageListProps {
	messages: ChatMessageVO[];
	currentUserId: number;
	onReply: (msg: ChatMessageVO) => void;
	onRecall: (msg: ChatMessageVO) => void;
}

export function ChatMessageList({
	messages,
	currentUserId,
	onReply,
	onRecall,
}: ChatMessageListProps): JSX.Element {
	return (
		<div className="flex flex-col gap-2">
			{messages.map((m, i) => {
				const prev = messages[i - 1];
				// 同一发送者连续消息内省略头像
				const compact = !!prev && prev.sender_id === m.sender_id && m.type !== "system" && prev.type !== "system";
				return (
					<ChatBubble
						key={m.id}
						msg={m}
						isMine={m.sender_id === currentUserId}
						compact={compact}
						onReply={onReply}
						onRecall={onRecall}
					/>
				);
			})}
		</div>
	);
}

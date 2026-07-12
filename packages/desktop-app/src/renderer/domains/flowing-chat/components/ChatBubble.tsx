import type { ChatMessageVO } from "@shared/lib/api";
import { ChatBubbleView } from "@vetta/theme-ui/flowing-chat";
import { useChatBubbleModel } from "../hooks/useChatBubbleModel";

interface ChatBubbleProps {
	msg: ChatMessageVO;
	isMine: boolean;
	compact: boolean;
	onReply: (msg: ChatMessageVO) => void;
	onRecall: (msg: ChatMessageVO) => void;
	onMentionSender: (senderId: number, senderName: string, senderAvatar: string) => void;
}

export function ChatBubble(props: ChatBubbleProps): JSX.Element {
	const model = useChatBubbleModel(props);
	return <ChatBubbleView {...model} />;
}

import { ChatMessageListView } from "./ChatMessageListView";
import { useChatMessageListModel } from "./useChatMessageListModel";

export function ChatMessageList({ onClose }: { onClose: () => void }): JSX.Element {
	const model = useChatMessageListModel(onClose);
	return <ChatMessageListView {...model} />;
}

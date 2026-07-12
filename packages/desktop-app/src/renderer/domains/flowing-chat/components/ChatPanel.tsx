import { ChatPanelView } from "@vetta/theme-ui/flowing-chat";
import { useChatPanelModel } from "../hooks/useChatPanelModel";

interface ChatPanelProps {
	flowingId: number;
}

/**
 * 单个流转项目的聊天面板。
 * 加载策略：进入时拉取最新一页 → 滚到底；上拉加载更早历史。
 */
export function ChatPanel({ flowingId }: ChatPanelProps): JSX.Element {
	const model = useChatPanelModel(flowingId);
	return <ChatPanelView {...model} />;
}

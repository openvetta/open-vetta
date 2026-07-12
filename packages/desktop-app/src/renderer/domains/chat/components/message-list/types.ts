import type { ChatMessage } from "@shared/store/atoms";
import type { MessageListScrollModel } from "../../hooks/useMessageListScrollModel";
import type { AssistantFoldData, BlockSegment } from "./messageBlockModel";

export type { ChatMessage };

export interface MessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
	sessionId?: string | null;
	onSend?: (overrideText?: string) => Promise<void>;
	onAbort?: () => void;
}

export interface MessageListModel {
	isCompacting: boolean;
	isStreaming: boolean;
	messages: ChatMessage[];
	modelSwitchLabels: Map<string, string>;
	scroll: MessageListScrollModel;
	showWaiting: boolean;
	tailMessageId: string | null;
}

export interface AssistantMessageModel {
	conclusionText: string;
	exportProcessSegments: BlockSegment[];
	foldData: AssistantFoldData | null;
	isCurrentlyStreaming: boolean;
	isPredicting: boolean;
	segments: BlockSegment[];
	showDuration: boolean;
	streamingTailIndex: number;
}

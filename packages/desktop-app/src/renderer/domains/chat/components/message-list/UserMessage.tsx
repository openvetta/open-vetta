import type { ChatMessage } from "@shared/store/atoms";
import { UserMessageView, type UserMessageEntryState } from "@vetta/theme-ui/chat";
import { memo } from "react";
import { useUserMessageModel } from "../../hooks/useUserMessageModel";

export type { UserMessageEntryState };

interface UserMessageProps {
	entryState: UserMessageEntryState;
	hasAssistantAfter?: boolean;
	isLastUserMessage?: boolean;
	isStreaming?: boolean;
	message: ChatMessage;
	onAbortEdit?: () => void;
	onEntryComplete?: () => void;
}

export const UserMessage = memo(function UserMessage(props: UserMessageProps) {
	const model = useUserMessageModel(props);
	return <UserMessageView {...model} />;
});

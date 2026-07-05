import { forwardRef, memo } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@shared/store/atoms";
import { AssistantMessage } from "./AssistantMessage";
import { UserMessage, type UserMessageEntryState } from "./UserMessage";

export const CompactionBoundary = memo(function CompactionBoundary() {
	const { t } = useTranslation("chat");
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-muted-foreground/15" />
			<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
				<span className="icon-[mdi--compress] h-3 w-3" />
				{t("messageList.compactionBoundary")}
			</span>
			<div className="h-px flex-1 bg-muted-foreground/15" />
		</div>
	);
});

export const ModelSwitchBoundary = memo(function ModelSwitchBoundary({
	label,
}: {
	label: string;
}) {
	const { t } = useTranslation("chat");
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-muted-foreground/8" />
			<span className="flex items-center gap-1.5 text-[11px] text-primary/70">
				<span className="icon-[mdi--swap-horizontal] h-3 w-3" />
				{t("messageList.modelSwitched", { name: label })}
			</span>
			<div className="h-px flex-1 bg-muted-foreground/8" />
		</div>
	);
});

interface MessageItemProps {
	exportMode?: boolean;
	isStreaming: boolean;
	isTailMessage: boolean;
	message: ChatMessage;
	onUserMessageEntryComplete?: () => void;
	userMessageEntryState: UserMessageEntryState;
}

export const MessageItem = memo(function MessageItem({
	message,
	isTailMessage,
	isStreaming,
	userMessageEntryState,
	onUserMessageEntryComplete,
	exportMode = false,
}: MessageItemProps) {
	if (message.role === "compaction") return <CompactionBoundary />;
	if (message.role === "user") {
		return (
			<UserMessage
				message={message}
				entryState={userMessageEntryState}
				onEntryComplete={onUserMessageEntryComplete}
			/>
		);
	}
	return (
		<AssistantMessage
			message={message}
			isTailMessage={isTailMessage}
			isStreaming={isStreaming}
			exportMode={exportMode}
		/>
	);
});

export const ExportMessageList = forwardRef<
	HTMLDivElement,
	{ messages: ChatMessage[] }
>(function ExportMessageList({ messages }, ref) {
	const tailMessageId = messages.at(-1)?.id ?? null;
	return (
		<div
			ref={ref}
			className="chat-export-document mx-auto flex w-full max-w-3xl flex-col px-5 py-5"
		>
			{messages.map((message) => (
				<div key={message.id} className="pb-5">
					<MessageItem
						message={message}
						isTailMessage={message.id === tailMessageId}
						isStreaming={false}
						userMessageEntryState="static"
						exportMode
					/>
				</div>
			))}
		</div>
	);
});

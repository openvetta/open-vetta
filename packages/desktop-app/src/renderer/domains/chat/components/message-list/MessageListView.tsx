import { MessageListView as ThemeMessageListView, VirtuosoListContainer } from "@vetta/theme-ui/chat";
import { forwardRef, useCallback, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { SuggestionBubbles } from "../SuggestionBubbles";
import { MessageItem, ModelSwitchBoundary, ExportMessageList } from "./MessageItem";
import { MessageListFooter } from "./MessageListFooter";
import type { ChatMessage, MessageListModel, MessageListProps } from "./types";

export { ExportMessageList };

const STREAMING_OVERSCAN = 80;
const IDLE_OVERSCAN = 400;
const STREAMING_INCREASE_VIEWPORT_BY = { top: 0, bottom: 80 };
const IDLE_INCREASE_VIEWPORT_BY = { top: 200, bottom: 200 };
const VIRTUOSO_STYLE = { overflowX: "hidden" as const };

export function MessageListView({
	model,
	onAbort,
	onSend,
}: {
	model: MessageListModel;
	onAbort: MessageListProps["onAbort"];
	onSend: MessageListProps["onSend"];
}): JSX.Element {
	const {
		isCompacting,
		isStreaming,
		messages,
		modelSwitchLabels,
		scroll,
		showWaiting,
		tailMessageId,
	} = model;
	const lastUserMessageId = useMemo(() => {
		const lastUser = [...messages].reverse().find((m) => m.role === "user");
		return lastUser?.id ?? null;
	}, [messages]);
	const itemContent = useCallback(
		(index: number, message: ChatMessage) => (
			<div
				className={
					index === messages.length - 1 && message.role === "user" ? "pb-9" : "pb-5"
				}
			>
				{modelSwitchLabels.has(message.id) && (
					<ModelSwitchBoundary label={modelSwitchLabels.get(message.id) as string} />
				)}
				<MessageItem
					message={message}
					isTailMessage={message.id === tailMessageId}
					isStreaming={isStreaming}
					isLastUserMessage={message.id === lastUserMessageId}
					hasAssistantAfter={
						index < messages.length - 1 &&
						messages.slice(index + 1).some((m) => m.role !== "user")
					}
					userMessageEntryState={
						message.id === scroll.activeUserAnimationId
							? "enter"
							: message.id === scroll.pendingUserAnimationId ||
									message.id === scroll.enteringUserMessageId
								? "hidden"
								: "static"
					}
					onUserMessageEntryComplete={
						message.id === scroll.activeUserAnimationId
							? scroll.onUserMessageEntryComplete
							: undefined
					}
					onAbortEdit={onAbort}
				/>
			</div>
		),
		[
			isStreaming,
			lastUserMessageId,
			messages.length,
			messages,
			modelSwitchLabels,
			onAbort,
			scroll.activeUserAnimationId,
			scroll.enteringUserMessageId,
			scroll.onUserMessageEntryComplete,
			scroll.pendingUserAnimationId,
			tailMessageId,
		],
	);
	const footer = useCallback(
		() => (
			<>
				{onSend && <SuggestionBubbles onSend={onSend} />}
				<MessageListFooter isCompacting={isCompacting} showWaiting={showWaiting} />
			</>
		),
		[isCompacting, showWaiting, onSend],
	);
	const components = useMemo(
		() => ({ List: VirtuosoListContainer, Footer: footer }),
		[footer],
	);

	return (
		<ThemeMessageListView
			virtuoso={
				<Virtuoso
					ref={scroll.virtuosoRef}
					scrollerRef={scroll.scrollerRef}
					data={messages}
					className="flex-1 pt-2"
					style={VIRTUOSO_STYLE}
					atBottomStateChange={scroll.onAtBottomChange}
					atBottomThreshold={80}
					overscan={isStreaming ? STREAMING_OVERSCAN : IDLE_OVERSCAN}
					increaseViewportBy={
						isStreaming ? STREAMING_INCREASE_VIEWPORT_BY : IDLE_INCREASE_VIEWPORT_BY
					}
					defaultItemHeight={80}
					components={components}
					itemContent={itemContent}
					initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
				/>
			}
		/>
	);
}

// re-export for any external consumers that used the local container
export const MessageListVirtuosoListContainer = VirtuosoListContainer;

import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import type { ConversationParticipantViewModel } from "@shared/conversation";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import type { Usage } from "@vetta/ai/protocol";
import {
	CompactionBoundaryView,
	ExportMessageListView,
	Message,
	MessageLayout,
	MessageVisual,
	ModelSwitchBoundaryView,
} from "@vetta-org/theme-ui/chat";
import { forwardRef, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AssistantMessage } from "./AssistantMessage";
import { useMessageRendering } from "./MessageRendering";
import { ReadonlyUserMessage } from "./ReadonlyUserMessage";
import { TeamMemberReplyCard } from "./TeamMemberReplyCard";
import type { ChatConversationItem } from "./types";

export const CompactionBoundary = memo(function CompactionBoundary() {
	const { t } = useTranslation("chat");
	return <CompactionBoundaryView label={t("messageList.compactionBoundary")} />;
});

export const ModelSwitchBoundary = memo(function ModelSwitchBoundary({ label }: { label: string }) {
	const { t } = useTranslation("chat");
	// t includes name interpolation — pass preformatted label from host
	return <ModelSwitchBoundaryView prefix="" label={t("messageList.modelSwitched", { name: label })} />;
});

export interface MessageItemProps {
	exportMode?: boolean;
	isLastUserMessage?: boolean;
	isStreaming: boolean;
	isTailMessage: boolean;
	message: ChatConversationItem;
	onAbortEdit?: () => void;
	pendingLabel?: string;
	participant?: ConversationParticipantViewModel;
	participants?: readonly ConversationParticipantViewModel[];
	onTeamMemberOpen?: (memberId: string) => void;
	sessionUsages?: readonly Usage[];
}

export const MessageItem = memo(function MessageItem(props: MessageItemProps) {
	const definition = useMessageRendering();
	const message = definition.project?.(props.message) ?? props.message;
	const Renderer = definition.renderers?.[message.kind] ?? DefaultMessageItem;
	return <Renderer {...props} message={message} />;
});

export const DefaultMessageItem = memo(function DefaultMessageItem({
	message,
	isTailMessage,
	isStreaming,
	pendingLabel,
	participant,
	participants,
	onTeamMemberOpen,
	sessionUsages,
	exportMode = false,
}: MessageItemProps) {
	if (message.kind === "event") {
		if (message.event.kind === "compaction") return <CompactionBoundary />;
		if (message.event.kind === "team-member-summary") {
			return <TeamMemberReplyCard event={message.event} onOpen={onTeamMemberOpen} />;
		}
		return (
			<Message.Root>
				<MessageLayout.Event>
					<MessageVisual.EventBubble>
						<span className="icon-[solar--forward-linear] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
						<span className="truncate">{message.event.label}</span>
					</MessageVisual.EventBubble>
				</MessageLayout.Event>
			</Message.Root>
		);
	}
	if (message.kind === "user") {
		return <ReadonlyUserMessage message={message} participants={participants} />;
	}
	return (
		<AssistantMessage
			message={message}
			isTailMessage={isTailMessage}
			isStreaming={isStreaming}
			pendingLabel={pendingLabel}
			onTeamMemberOpen={onTeamMemberOpen}
			exportMode={exportMode}
			participant={participant}
			sessionUsages={sessionUsages}
		/>
	);
});

export const ExportMessageList = forwardRef<HTMLDivElement, { messages: readonly ChatConversationItem[] }>(
	function ExportMessageList({ messages }, ref) {
		const markdown = useRendererMarkdownModel();
		// Export snapshots have no React handlers; keep HTML source readable for
		// every message role instead of cloning a live iframe/control surface.
		const staticMarkdown = useMemo(
			() => ({
				...markdown,
				labels: { copy: markdown.labels.copy, copied: markdown.labels.copied },
			}),
			[markdown],
		);
		const tailMessageId = messages.at(-1)?.id ?? null;
		return (
			<RendererMarkdownScope value={staticMarkdown}>
				<ExportMessageListView listRef={ref}>
					{messages.map((message) => (
						<div key={message.id} className="pb-5">
							<MessageItem message={message} isTailMessage={message.id === tailMessageId} isStreaming={false} exportMode />
						</div>
					))}
				</ExportMessageListView>
			</RendererMarkdownScope>
		);
	},
);

import { BotAvatar } from "@shared/components/BotAvatar";
import type { ChatMessage } from "@shared/store/atoms";
import { useThemeSurface } from "@vetta/theme-sdk/appearance";
import {
	AssistantMessageView,
	StreamingIndicator as ThemeStreamingIndicator,
} from "@vetta/theme-ui/chat";

/** Desktop wrapper: injects i18n streaming phrases into theme-ui indicator. */
export function StreamingIndicator(): JSX.Element {
	const { t } = useTranslation("chat");
	const phrases = t("messageList.streamingPhrases", { returnObjects: true });
	const list = Array.isArray(phrases) ? (phrases as string[]) : [];
	return <ThemeStreamingIndicator phrases={list} />;
}
import { memo, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAssistantMessageModel } from "../../hooks/useAssistantMessageModel";
import { MessageCardsHost } from "../MessageCardsHost";
import { SegmentRenderer } from "./MessageBlockSegments";
import { segmentKey } from "./messageBlockModel";
import { CopyButton, formatDuration, formatTime, RelativeTimeLabel } from "./MessageActions";

interface AssistantMessageProps {
	exportMode?: boolean;
	isStreaming: boolean;
	isTailMessage: boolean;
	message: ChatMessage;
}

export const AssistantMessage = memo(function AssistantMessage({
	message,
	isTailMessage,
	isStreaming,
	exportMode = false,
}: AssistantMessageProps) {
	const { t } = useTranslation("chat");
	const surface = useThemeSurface("chat.assistantMessage");
	const [expanded, setExpanded] = useState(false);
	const generatedId = useId();
	const exportFoldPanelId = exportMode ? `export-assistant-fold-${generatedId}` : undefined;
	const model = useAssistantMessageModel({
		expanded,
		exportMode,
		isStreaming,
		isTailMessage,
		message,
	});

	const labels = useMemo(() => {
		const phrases = t("messageList.streamingPhrases", { returnObjects: true });
		return {
			processing: t("messageList.assistantMessage.processing"),
			predicting: t("messageList.assistantMessage.predicting"),
			streamingFold: (elapsed: number) =>
				t("messageList.assistantFoldTip.streaming", { elapsed }),
			expandFold: (count: number) => t("messageList.assistantFoldTip.expand", { count }),
			collapseFold: (count: number) => t("messageList.assistantFoldTip.collapse", { count }),
			streamingPhrases: Array.isArray(phrases) ? (phrases as string[]) : [],
		};
	}, [t]);

	const {
		conclusionText,
		exportProcessSegments,
		foldData,
		isCurrentlyStreaming,
		isPredicting,
		segments,
		showDuration,
		streamingTailIndex,
	} = model;

	const fold =
		isCurrentlyStreaming
			? {
					kind: "streaming" as const,
					count: message.blocks?.length ?? 0,
					startedAt: message.startedAt ?? message.timestamp,
				}
			: foldData
				? {
						kind: "complete" as const,
						count: foldData.hiddenCount,
						expanded,
						exportPanelId: exportFoldPanelId,
					}
				: null;

	const hasBlocks = Boolean(message.blocks?.length);

	return (
		<AssistantMessageView
			rootClassName={surface?.rootClassName}
			timestampLabel={message.timestamp ? formatTime(message.timestamp) : undefined}
			durationLabel={formatDuration(message.durationSeconds ?? 0)}
			showDuration={showDuration}
			isCurrentlyStreaming={isCurrentlyStreaming}
			isPredicting={isPredicting}
			conclusionText={conclusionText}
			fold={fold}
			labels={labels}
			botAvatar={<BotAvatar active={isCurrentlyStreaming} />}
			segments={
				hasBlocks ? (
					<>
						{exportProcessSegments.length > 0 && (
							<div
								id={exportFoldPanelId}
								data-export-collapse-panel=""
								hidden
								className="flex flex-col gap-0.5"
							>
								{exportProcessSegments.map((segment) => (
									<SegmentRenderer
										key={`export-${segmentKey(segment)}`}
										segment={segment}
										exportMode
									/>
								))}
							</div>
						)}
						{segments.map((segment, index) => (
							<SegmentRenderer
								key={segmentKey(segment)}
								segment={segment}
								isStreamingTail={index === streamingTailIndex}
								animateIn={isCurrentlyStreaming && index === segments.length - 1}
								exportMode={exportMode}
							/>
						))}
					</>
				) : null
			}
			fallbackText={message.text || "\u2026"}
			actions={
				conclusionText.length > 0 ? (
					<div className="flex items-center gap-1">
						<CopyButton getText={() => conclusionText} />
						{(message.endedAt ?? message.timestamp) && (
							<RelativeTimeLabel endedAt={(message.endedAt ?? message.timestamp) as number} />
						)}
					</div>
				) : undefined
			}
			messageCards={<MessageCardsHost message={message} />}
			onToggleExpanded={() => setExpanded((value) => !value)}
		/>
	);
});

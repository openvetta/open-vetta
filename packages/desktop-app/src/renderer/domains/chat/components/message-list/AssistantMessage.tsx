import { memo, useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@shared/store/atoms";
import { BotAvatar } from "@shared/components/BotAvatar";
import { cn } from "@shared/lib/utils";
import { useAssistantMessageModel } from "../../hooks/useAssistantMessageModel";
import { MessageCardsHost } from "../MessageCardsHost";
import { SegmentRenderer } from "./MessageBlockSegments";
import { segmentKey } from "./messageBlockModel";
import {
	CopyButton,
	formatDuration,
	formatTime,
	RelativeTimeLabel,
} from "./MessageActions";
import type { AssistantMessageModel } from "./types";

const STREAM_CHAR_HIDDEN = { opacity: 0, filter: "blur(6px)" };
const STREAM_CHAR_SHOWN = { opacity: 1, filter: "blur(0px)" };
const STREAM_CHAR_TRANSITION = {
	duration: 0.42,
	ease: [0.25, 0.1, 0.25, 1] as const,
};

function useElapsedSeconds(startedAt: number | undefined, active: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [active]);
	if (!startedAt) return 0;
	return Math.max(0, Math.floor((now - startedAt) / 1000));
}

interface AssistantFoldTipProps {
	state: "streaming" | "complete";
	count: number;
	expanded: boolean;
	startedAt?: number;
	onToggle: () => void;
	exportPanelId?: string;
}

function AssistantFoldTip({
	state,
	count,
	expanded,
	startedAt,
	onToggle,
	exportPanelId,
}: AssistantFoldTipProps): JSX.Element {
	const { t } = useTranslation("chat");
	const elapsedSeconds = useElapsedSeconds(startedAt, state === "streaming");
	if (state === "streaming") {
		return (
			<div className="mb-3">
				<div className="mb-2 flex items-center">
					<span className="processing-shimmer text-[12px] font-medium">
						{t("messageList.assistantFoldTip.streaming", { elapsed: elapsedSeconds })}
					</span>
				</div>
				<div className="h-px w-full rounded-full bg-border/80" />
			</div>
		);
	}
	return (
		<div className="mb-3">
			<button
				type="button"
				onClick={onToggle}
				data-export-toggle={exportPanelId}
				data-export-label-collapsed={t("messageList.assistantFoldTip.expand", { count })}
				data-export-label-expanded={t("messageList.assistantFoldTip.collapse", { count })}
				aria-expanded={expanded}
				className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-lg py-1 pr-1.5 text-[12px] font-medium text-muted-foreground/55 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
			>
				<span
					className={cn(
						"icon-[mdi--chevron-right] h-3.5 w-3.5 shrink-0 transition-transform duration-200",
						expanded && "rotate-90",
					)}
				/>
				<span data-export-toggle-label="">
					{expanded
						? t("messageList.assistantFoldTip.collapse", { count })
						: t("messageList.assistantFoldTip.expand", { count })}
				</span>
			</button>
			<div className="h-px w-full rounded-full bg-border/80" />
		</div>
	);
}

export function StreamingIndicator(): JSX.Element {
	const { t } = useTranslation("chat");
	const phrases = t("messageList.streamingPhrases", { returnObjects: true });
	const list = Array.isArray(phrases) ? (phrases as string[]) : [];
	const [index, setIndex] = useState(0);
	const text = list[index] ?? "";
	const chars = Array.from(text);
	useEffect(() => {
		if (list.length <= 1) return;
		const revealMs = chars.length * 35 + 420;
		const timer = window.setTimeout(
			() => setIndex((value) => (value + 1) % list.length),
			revealMs + 1100,
		);
		return () => window.clearTimeout(timer);
	}, [index, list.length, chars.length]);
	return (
		<span
			className="inline-flex text-[11px] font-medium text-muted-foreground/55"
			aria-label={text}
		>
			{chars.map((character, characterIndex) => (
				<motion.span
					key={`${index}-${characterIndex}`}
					aria-hidden
					className="inline-block whitespace-pre"
					initial={STREAM_CHAR_HIDDEN}
					animate={STREAM_CHAR_SHOWN}
					transition={{
						...STREAM_CHAR_TRANSITION,
						delay: characterIndex * 0.035,
					}}
				>
					{character}
				</motion.span>
			))}
		</span>
	);
}

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
	const [expanded, setExpanded] = useState(false);
	const generatedId = useId();
	const exportFoldPanelId = exportMode
		? `export-assistant-fold-${generatedId}`
		: undefined;
	const model = useAssistantMessageModel({
		expanded,
		exportMode,
		isStreaming,
		isTailMessage,
		message,
	});
	return (
		<AssistantMessageView
			expanded={expanded}
			exportFoldPanelId={exportFoldPanelId}
			exportMode={exportMode}
			message={message}
			model={model}
			onToggleExpanded={() => setExpanded((value) => !value)}
		/>
	);
});

interface AssistantMessageViewProps {
	expanded: boolean;
	exportFoldPanelId?: string;
	exportMode: boolean;
	message: ChatMessage;
	model: AssistantMessageModel;
	onToggleExpanded: () => void;
}

export function AssistantMessageView({
	expanded,
	exportFoldPanelId,
	exportMode,
	message,
	model,
	onToggleExpanded,
}: AssistantMessageViewProps): JSX.Element {
	const { t } = useTranslation("chat");
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
	return (
		<div className="flex flex-col">
			<div className="mb-2 flex items-center gap-2">
				<BotAvatar active={isCurrentlyStreaming} />
				<span className="text-[13px] font-semibold text-foreground/80">Vetta</span>
				{message.timestamp && (
					<span className="text-[11px] text-muted-foreground/35">
						{formatTime(message.timestamp)}
					</span>
				)}
				{showDuration && (
					<>
						<span className="text-[11px] text-muted-foreground/20">·</span>
						<span className="text-[11px] text-muted-foreground/35">
							{formatDuration(message.durationSeconds ?? 0)}
						</span>
					</>
				)}
				{isCurrentlyStreaming && (
					<div className="flex items-center gap-1">
						<span
							className="h-1.5 w-1.5 rounded-full bg-primary/60"
							style={{ animation: "pulse 1.5s infinite" }}
						/>
						<span className="text-[11px] text-muted-foreground/35">
							{t("messageList.assistantMessage.processing")}
						</span>
					</div>
				)}
			</div>
			{isCurrentlyStreaming ? (
				<AssistantFoldTip
					state="streaming"
					count={message.blocks?.length ?? 0}
					expanded
					startedAt={message.startedAt ?? message.timestamp}
					onToggle={() => undefined}
				/>
			) : foldData ? (
				<AssistantFoldTip
					state="complete"
					count={foldData.hiddenCount}
					expanded={expanded}
					startedAt={message.startedAt}
					onToggle={onToggleExpanded}
					exportPanelId={exportFoldPanelId}
				/>
			) : null}
			<div>
				{message.blocks?.length ? (
					<div className="flex flex-col gap-0.5">
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
								animateIn={
									isCurrentlyStreaming && index === segments.length - 1
								}
								exportMode={exportMode}
							/>
						))}
					</div>
				) : (
					<div
						className="text-[13px] leading-[1.6] text-foreground"
						style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
					>
						{message.text || "\u2026"}
					</div>
				)}
			</div>
			{isCurrentlyStreaming && (
				<div className="mt-2 flex items-center">
					<StreamingIndicator />
				</div>
			)}
			{(conclusionText.length > 0 || isPredicting) && !isCurrentlyStreaming && (
				<div className="mt-2 flex items-center gap-2">
					{conclusionText.length > 0 && (
						<div className="flex items-center gap-1">
							<CopyButton getText={() => conclusionText} />
							{(message.endedAt ?? message.timestamp) && (
								<RelativeTimeLabel
									endedAt={(message.endedAt ?? message.timestamp) as number}
								/>
							)}
						</div>
					)}
					{isPredicting && (
						<span className="processing-shimmer text-[11px] font-medium">
							{t("messageList.assistantMessage.predicting")}
						</span>
					)}
				</div>
			)}
			<div className="mt-2">
				<MessageCardsHost message={message} />
			</div>
		</div>
	);
}

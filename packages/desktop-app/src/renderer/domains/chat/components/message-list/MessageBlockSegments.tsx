import { memo, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Transition } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ThinkingBlock, ToolCallBlock } from "@shared/store/atoms";
import { TextBlockView } from "../blocks/TextBlock";
import { ThinkingBlockView } from "../blocks/ThinkingBlock";
import { ToolCallBlockView } from "../blocks/ToolCallBlock";
import type { BlockSegment } from "./messageBlockModel";
export {
	findLastProcessBlockIndex,
	getAssistantFoldData,
	groupBlocks,
	segmentKey,
} from "./messageBlockModel";
export type { AssistantFoldData, BlockSegment } from "./messageBlockModel";

const SEGMENT_INITIAL = { opacity: 0, y: 4 };
const SEGMENT_ANIMATE = { opacity: 1, y: 0 };
const SEGMENT_TRANSITION = {
	duration: 0.18,
	ease: [0.25, 0.1, 0.25, 1] as const,
} satisfies Transition;
const COLLAPSE_INITIAL = { height: 0, opacity: 0 };
const COLLAPSE_ANIMATE = { height: "auto", opacity: 1 };
const COLLAPSE_EXIT = { height: 0, opacity: 0 };
const COLLAPSE_TRANSITION = {
	duration: 0.2,
	ease: [0.25, 0.1, 0.25, 1] as const,
} satisfies Transition;


const ToolCallGroup = memo(function ToolCallGroup({
	blocks,
	exportMode = false,
}: {
	blocks: (ToolCallBlock | ThinkingBlock)[];
	exportMode?: boolean;
}) {
	const { t } = useTranslation("chat");
	const [expanded, setExpanded] = useState(false);
	const generatedId = useId();
	const panelId = exportMode ? `export-tool-group-${generatedId}` : undefined;
	const toolBlocks = blocks.filter(
		(block): block is ToolCallBlock => block.type === "tool_call",
	);
	const thinkingCount = blocks.filter((block) => block.type === "thinking").length;
	const completedCount = toolBlocks.filter((block) => block.status !== "pending").length;
	const allDone = completedCount === toolBlocks.length;
	const summary: string[] = [];
	if (toolBlocks.length > 0) {
		summary.push(
			allDone
				? t("messageList.toolCallGroup.completed", { count: completedCount })
				: t("messageList.toolCallGroup.inProgress", {
						completed: completedCount,
						total: toolBlocks.length,
					}),
		);
	}
	if (thinkingCount > 0) {
		summary.push(t("messageList.toolCallGroup.thinking", { count: thinkingCount }));
	}

	return (
		<div className="relative w-fit max-w-full overflow-hidden rounded-lg px-1 py-0.5">
			<div className="inline-block max-w-full align-top">
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					data-export-toggle={panelId}
					aria-expanded={expanded}
					className="inline-flex max-w-full items-center gap-2 rounded-lg pr-2 py-1 text-left transition-colors hover:bg-muted/60"
				>
					<span
						className={`icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground/80 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
					/>
					<span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground/60">
						{blocks.length}
					</span>
					<span
						className={`min-w-0 truncate text-[12px] text-muted-foreground/50 ${allDone ? "" : "tool-call-shimmer-text"}`}
					>
						{summary.join("，")}
					</span>
				</button>
			</div>
			<AnimatePresence initial={false}>
				{(expanded || exportMode) && (
					<motion.div
						id={panelId}
						data-export-collapse-panel={exportMode ? "" : undefined}
						hidden={exportMode && !expanded}
						initial={COLLAPSE_INITIAL}
						animate={COLLAPSE_ANIMATE}
						exit={COLLAPSE_EXIT}
						transition={COLLAPSE_TRANSITION}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-0.5 pl-2 pr-1 pb-1">
							{blocks.map((block) =>
								block.type === "tool_call" ? (
									<ToolCallBlockView
										key={block.toolCallId}
										block={block}
										exportMode={exportMode}
									/>
								) : (
									<ThinkingBlockView
										key={`thinking-${block.id}`}
										text={block.text}
										exportMode={exportMode}
									/>
								),
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
});

interface SegmentRendererProps {
	segment: BlockSegment;
	isStreamingTail?: boolean;
	animateIn?: boolean;
	exportMode?: boolean;
}

function areSegmentsEqual(previous: BlockSegment, next: BlockSegment): boolean {
	if (previous.type === "single") {
		return next.type === "single" && previous.block === next.block;
	}
	if (next.type !== "tool_group" || previous.blocks.length !== next.blocks.length) {
		return false;
	}
	return previous.blocks.every((block, index) => block === next.blocks[index]);
}

function areSegmentRendererPropsEqual(
	previous: SegmentRendererProps,
	next: SegmentRendererProps,
): boolean {
	return (
		previous.isStreamingTail === next.isStreamingTail &&
		previous.animateIn === next.animateIn &&
		previous.exportMode === next.exportMode &&
		areSegmentsEqual(previous.segment, next.segment)
	);
}

export const SegmentRenderer = memo(function SegmentRenderer({
	segment,
	isStreamingTail = false,
	animateIn = false,
	exportMode = false,
}: SegmentRendererProps) {
	let content: JSX.Element | null;
	if (segment.type === "tool_group") {
		content = <ToolCallGroup blocks={segment.blocks} exportMode={exportMode} />;
	} else {
		switch (segment.block.type) {
			case "text":
				content = (
					<TextBlockView
						text={segment.block.text}
						isStreamingTail={isStreamingTail}
					/>
				);
				break;
			case "thinking":
				content = (
					<ThinkingBlockView text={segment.block.text} exportMode={exportMode} />
				);
				break;
			case "tool_call":
				content = <ToolCallBlockView block={segment.block} exportMode={exportMode} />;
				break;
			case "error":
				content = (
					<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
						<span className="icon-[mdi--alert-circle-outline] mt-0.5 h-4 w-4 shrink-0 text-destructive/70" />
						<span
							className="text-[13px] leading-[1.6] text-destructive/90"
							style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
						>
							{segment.block.text}
						</span>
					</div>
				);
				break;
			default:
				content = null;
		}
	}

	if (!content) return null;
	if (!animateIn) return content;
	return (
		<motion.div
			initial={SEGMENT_INITIAL}
			animate={SEGMENT_ANIMATE}
			transition={SEGMENT_TRANSITION}
		>
			{content}
		</motion.div>
	);
}, areSegmentRendererPropsEqual);

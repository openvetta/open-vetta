import { forwardRef, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Transition } from "motion/react";
import { useAtomValue } from "jotai";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
	type ChatMessage,
	type ContentBlock,
	type TextBlock,
	type ThinkingBlock,
	type ToolCallBlock,
	activeSessionAtom,
	isCompactingAtom,
	pluginToolCallSlotsAtom,
	promptPredictingAtom,
	turnModifiedFilesAtom,
} from "@shared/store/atoms";
import { ArtifactCard } from "@shared/components/ArtifactCard";
import { BotAvatar } from "@shared/components/BotAvatar";
import { cn, pathBasename } from "@shared/lib/utils";
import { MessageCardsHost } from "./MessageCardsHost";
import { TextBlockView } from "./blocks/TextBlock";
import { ThinkingBlockView } from "./blocks/ThinkingBlock";
import { ToolCallBlockView } from "./blocks/ToolCallBlock";
import { SuggestionBubbles } from "./SuggestionBubbles";

interface MessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
	sessionId?: string | null;
	/** 输入预测建议直发回调；省略则不渲染建议气泡（如只读 viewer）。 */
	onSend?: (overrideText?: string) => Promise<void>;
}

/** A grouped segment of content blocks for rendering. */
type BlockSegment =
	| { type: "single"; block: ContentBlock }
	| { type: "tool_group"; blocks: (ToolCallBlock | ThinkingBlock)[] };

const SEGMENT_INITIAL = { opacity: 0, y: 4 };
const SEGMENT_ANIMATE = { opacity: 1, y: 0 };
const SEGMENT_TRANSITION = { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] as const } satisfies Transition;
const COLLAPSE_INITIAL = { height: 0, opacity: 0 };
const COLLAPSE_ANIMATE = { height: "auto", opacity: 1 };
const COLLAPSE_EXIT = { height: 0, opacity: 0 };
const COLLAPSE_TRANSITION = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const } satisfies Transition;
const USER_HIDDEN_VISUAL_STATE = { opacity: 0, scale: 0.82, x: 14, y: 12 };
const USER_VISIBLE_VISUAL_STATE = { opacity: 1, scale: 1, x: 0, y: 0 };
const USER_ENTRY_TRANSITION = { type: "spring", stiffness: 520, damping: 24, mass: 0.8 } satisfies Transition;
const USER_TEXT_INITIAL = { filter: "blur(6px)" };
const USER_TEXT_VISIBLE = { filter: "blur(0px)" };
const USER_TEXT_TRANSITION = { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as const } satisfies Transition;
const USER_MESSAGE_STYLE = { originX: 1, originY: 1 };
const INDICATOR_INITIAL = { opacity: 0, y: 6 };
const INDICATOR_ANIMATE = { opacity: 1, y: 0 };
const INDICATOR_EXIT = { opacity: 0, y: 6 };
const INDICATOR_TRANSITION = { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const } satisfies Transition;
const STREAMING_OVERSCAN = 80;
const IDLE_OVERSCAN = 400;
const STREAMING_INCREASE_VIEWPORT_BY = { top: 0, bottom: 80 };
const IDLE_INCREASE_VIEWPORT_BY = { top: 200, bottom: 200 };
const VIRTUOSO_STYLE = { overflowX: "hidden" as const };
const STREAMING_SCROLL_LERP_RATIO = 0.35;
const IDLE_SCROLL_LERP_RATIO = 0.2;

/**
 * Stable React key for a content block. Used so segments survive reorder when
 * streaming inserts a new block in the middle (e.g. a tool_call landing between
 * two text blocks). Avoids index-based keys which cause DOM reuse across
 * mismatched content.
 */
function blockKey(block: ContentBlock): string {
	switch (block.type) {
		case "tool_call":
			return `tc-${block.toolCallId}`;
		case "tool_result":
			return `tr-${block.toolCallId}`;
		case "text":
		case "thinking":
		case "error":
			return `${block.type}-${block.id}`;
	}
}

function segmentKey(segment: BlockSegment): string {
	if (segment.type === "single") return blockKey(segment.block);
	// Tool group: first block's key is stable because tool/thinking blocks are
	// only appended (never reordered within a batch).
	return `group-${blockKey(segment.blocks[0])}`;
}

function isCustomToolUiBlock(block: ContentBlock, customToolNames: Set<string>): boolean {
	return block.type === "tool_call" && customToolNames.has(block.toolName);
}

/** Group consecutive tool_call and thinking blocks into collapsible groups. */
function groupBlocks(blocks: ContentBlock[], customToolNames: Set<string>): BlockSegment[] {
	const segments: BlockSegment[] = [];
	let batch: (ToolCallBlock | ThinkingBlock)[] = [];

	function flushBatch(): void {
		if (batch.length === 0) return;
		if (batch.length === 1) {
			segments.push({ type: "single", block: batch[0] });
		} else {
			segments.push({ type: "tool_group", blocks: [...batch] });
		}
		batch = [];
	}

	for (const block of blocks) {
		if (isCustomToolUiBlock(block, customToolNames)) {
			flushBatch();
			segments.push({ type: "single", block });
		} else if (block.type === "tool_call" || block.type === "thinking") {
			batch.push(block);
		} else if (block.type === "tool_result") {
			// skip — results are rendered inside tool_call blocks
		} else if (block.type === "text" && !block.text.trim() && batch.length > 0) {
			// skip empty text blocks between tool/thinking runs
		} else {
			flushBatch();
			segments.push({ type: "single", block });
		}
	}
	flushBatch();
	return segments;
}

function findLastProcessBlockIndex(blocks: ContentBlock[], customToolNames: Set<string> = new Set()): number {
	for (let i = blocks.length - 1; i >= 0; i--) {
		const block = blocks[i];
		if (isCustomToolUiBlock(block, customToolNames)) continue;
		if (block.type === "tool_call" || block.type === "thinking") return i;
	}
	return -1;
}

interface AssistantFoldData {
	processBlocks: ContentBlock[];
	trailingBlocks: ContentBlock[];
	outputBlocks: TextBlock[];
	hiddenCount: number;
}

function getAssistantFoldData(blocks: ContentBlock[], customToolNames: Set<string>): AssistantFoldData | null {
	const lastProcessIndex = findLastProcessBlockIndex(blocks, customToolNames);
	if (lastProcessIndex === -1) return null;
	const outputBlocks = blocks
		.slice(lastProcessIndex + 1)
		.filter((block): block is TextBlock => block.type === "text" && block.text.trim().length > 0);
	if (outputBlocks.length === 0) return null;
	return {
		processBlocks: blocks.slice(0, lastProcessIndex + 1),
		trailingBlocks: blocks.slice(lastProcessIndex + 1),
		outputBlocks,
		hiddenCount: blocks.length - outputBlocks.length,
	};
}

/** Collapsed group of multiple tool calls and/or thinking blocks. */
const ToolCallGroup = memo(function ToolCallGroup({
	blocks,
	exportMode = false,
}: {
	blocks: (ToolCallBlock | ThinkingBlock)[];
	exportMode?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const generatedId = useId();
	const panelId = exportMode ? `export-tool-group-${generatedId}` : undefined;
	const toolBlocks = blocks.filter((b): b is ToolCallBlock => b.type === "tool_call");
	const thinkingCount = blocks.filter((b) => b.type === "thinking").length;
	const completedCount = toolBlocks.filter((b) => b.status !== "pending").length;
	const allDone = completedCount === toolBlocks.length;

	function getSummary(): string {
		const parts: string[] = [];
		if (toolBlocks.length > 0) {
			parts.push(
				allDone
					? `${completedCount} 个工具调用完成`
					: `${completedCount}/${toolBlocks.length} 个工具调用`,
			);
		}
		if (thinkingCount > 0) {
			parts.push(`${thinkingCount} 个思考过程`);
		}
		return parts.join("，");
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
					<span className={`min-w-0 truncate text-[12px] text-muted-foreground/50 ${allDone ? "" : "tool-call-shimmer-text"}`}>
						{getSummary()}
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
									<ToolCallBlockView key={block.toolCallId} block={block} exportMode={exportMode} />
								) : (
									<ThinkingBlockView key={`thinking-${block.id}`} text={block.text} exportMode={exportMode} />
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

function areSegmentsEqual(prev: BlockSegment, next: BlockSegment): boolean {
	if (prev.type === "single") return next.type === "single" && prev.block === next.block;
	if (next.type !== "tool_group") return false;
	if (prev.blocks.length !== next.blocks.length) return false;
	return prev.blocks.every((block, index) => block === next.blocks[index]);
}

function areSegmentRendererPropsEqual(prev: SegmentRendererProps, next: SegmentRendererProps): boolean {
	return (
		prev.isStreamingTail === next.isStreamingTail &&
		prev.animateIn === next.animateIn &&
		prev.exportMode === next.exportMode &&
		areSegmentsEqual(prev.segment, next.segment)
	);
}

const SegmentRenderer = memo(function SegmentRenderer({
	segment,
	isStreamingTail = false,
	animateIn = false,
	exportMode = false,
}: SegmentRendererProps) {
	let content: JSX.Element | null;
	if (segment.type === "tool_group") {
		content = <ToolCallGroup blocks={segment.blocks} exportMode={exportMode} />;
	} else {
		const { block } = segment;
		switch (block.type) {
			case "text":
				content = <TextBlockView text={block.text} isStreamingTail={isStreamingTail} />;
				break;
			case "thinking":
				content = <ThinkingBlockView text={block.text} exportMode={exportMode} />;
				break;
			case "tool_call":
				content = <ToolCallBlockView block={block} exportMode={exportMode} />;
				break;
			case "error":
				content = (
					<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
						<span className="icon-[mdi--alert-circle-outline] mt-0.5 h-4 w-4 shrink-0 text-destructive/70" />
						<span className="text-[13px] leading-[1.6] text-destructive/90" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
							{block.text}
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

/** Format timestamp to HH:mm:ss */
function formatTime(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * 人性化相对时间（基于回答结束时间）。返回 null 表示应隐藏。
 * - 5 分钟以内：隐藏
 * - 1 小时以内：「n分钟前」
 * - 1~2 小时：「1小时n分钟前」
 * - 2~24 小时：「n小时前」（省略分钟）
 * - 超过 24 小时：「n天前」
 */
function formatRelativeTime(ts: number, now: number): string | null {
	const diffMin = Math.floor((now - ts) / 60000);
	if (diffMin < 5) return null;
	if (diffMin < 60) return `${diffMin}分钟前`;
	if (diffMin < 120) {
		const mins = diffMin % 60;
		return mins > 0 ? `1小时${mins}分钟前` : "1小时前";
	}
	if (diffMin < 1440) return `${Math.floor(diffMin / 60)}小时前`;
	return `${Math.floor(diffMin / 1440)}天前`;
}

/** 回答结束时间的相对 label，随时间自动刷新（30s 一次）。 */
function RelativeTimeLabel({ endedAt }: { endedAt: number }): JSX.Element | null {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 30000);
		return () => window.clearInterval(timer);
	}, []);
	const label = formatRelativeTime(endedAt, now);
	if (!label) return null;
	return (
		<span className="text-[11px] text-muted-foreground/40" title={formatTime(endedAt)}>
			{label}
		</span>
	);
}

/** Format duration */
function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}秒`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}分${s}秒`;
}

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
	const elapsedSeconds = useElapsedSeconds(startedAt, state === "streaming");

	if (state === "streaming") {
		return (
			<div className="mb-3">
				<div className="mb-2 flex items-center">
					<span className="processing-shimmer text-[12px] font-medium">
						正在处理{elapsedSeconds}s
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
				data-export-label-collapsed={`展开${count}条内容`}
				data-export-label-expanded={`收起${count}条内容`}
				aria-expanded={expanded}
				className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-lg py-1 pr-1.5 text-[12px] font-medium text-muted-foreground/55 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
			>
				<span
					className={cn(
						"icon-[mdi--chevron-right] h-3.5 w-3.5 shrink-0 transition-transform duration-200",
						expanded && "rotate-90",
					)}
				/>
				<span data-export-toggle-label="">{expanded ? "收起" : "展开"}{count}条内容</span>
			</button>
			<div className="h-px w-full rounded-full bg-border/80" />
		</div>
	);
}

/** Parse prefixes from user message text: /skill:<name>, /scene:<name>, and @<path> lines. */
function parseUserPrefixes(text: string): {
	skillName: string | null;
	skillType: "skill" | "scene" | null;
	files: string[];
	body: string;
} {
	let remaining = text;
	let skillName: string | null = null;
	let skillType: "skill" | "scene" | null = null;
	const files: string[] = [];

	const skillMatch = remaining.match(/^\/(skill|scene):([^\n]+)\n?([\s\S]*)$/);
	if (skillMatch) {
		skillType = skillMatch[1] as "skill" | "scene";
		skillName = skillMatch[2].trim();
		remaining = skillMatch[3];
	}

	while (true) {
		const fileMatch = remaining.match(/^@([^\n]+)\n?([\s\S]*)$/);
		if (!fileMatch) break;
		files.push(fileMatch[1].trim());
		remaining = fileMatch[2];
	}

	return { skillName, skillType, files, body: remaining };
}

/** 提取 user 消息的可复制文本：去掉 /skill: 与 @file 前缀，仅保留正文 body。 */
function getUserCopyText(message: ChatMessage): string {
	const { body } = parseUserPrefixes(message.text ?? "");
	return body.trim();
}

/**
 * 提取 assistant 消息的结论文本：取最后一个 tool_call/thinking 之后的所有 text block。
 * 无 tool/thinking 时整段都是结论；纯工具轮 / 仅 error 时返回空字符串。
 */
function getAssistantConclusionText(message: ChatMessage, customToolNames: Set<string>): string {
	const blocks = message.blocks ?? [];
	if (blocks.length === 0) return (message.text ?? "").trim();
	const lastProcessIndex = findLastProcessBlockIndex(blocks, customToolNames);
	const texts = blocks
		.slice(lastProcessIndex + 1)
		.filter((b): b is TextBlock => b.type === "text")
		.map((b) => b.text.trim())
		.filter(Boolean);
	return texts.join("\n\n");
}

/** 复制按钮：icon-only + tooltip，点击后原位切到 check 持续 1.5s。 */
function CopyButton({ getText }: { getText: () => string }): JSX.Element {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, []);

	const onClick = useCallback(() => {
		const text = getText();
		if (!text) return;
		void navigator.clipboard.writeText(text).then(
			() => {
				setCopied(true);
				if (timerRef.current !== null) window.clearTimeout(timerRef.current);
				timerRef.current = window.setTimeout(() => {
					setCopied(false);
					timerRef.current = null;
				}, 1500);
			},
			(err) => {
				console.warn("[MessageActions] copy failed", err);
			},
		);
	}, [getText]);

	const label = copied ? "已复制" : "复制";

	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/45 transition-colors hover:bg-muted/60 hover:text-foreground"
		>
			<span
				className={cn(
					"h-3.5 w-3.5",
					copied ? "icon-[mdi--check]" : "icon-[mdi--content-copy]",
				)}
			/>
		</button>
	);
}

function SkillBadge({ name, type = "skill" }: { name: string; type?: "skill" | "scene" }): JSX.Element {
	const icon = type === "scene" ? "icon-[mdi--movie-open-outline]" : "icon-[mdi--puzzle-outline]";
	return (
		<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-muted-foreground">
			<span className={`${icon} h-3 w-3`} />
			{name}
		</span>
	);
}

function FileBadge({ path }: { path: string }): JSX.Element {
	const name = pathBasename(path);
	return (
		<span
			className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground"
			title={path}
		>
			<span className="icon-[mdi--file-outline] h-3 w-3" />
			{name}
		</span>
	);
}

type UserMessageEntryState = "static" | "hidden" | "enter";

/** User message — right-aligned bubble */
const UserMessage = memo(function UserMessage({
	message,
	entryState,
	onEntryComplete,
}: {
	message: ChatMessage;
	entryState: UserMessageEntryState;
	onEntryComplete?: () => void;
}) {
	const hasImages = message.images && message.images.length > 0;
	const { skillName, skillType, files, body } = parseUserPrefixes(message.text);
	const displayText = body;
	const hasBadges = skillName || files.length > 0;
	const copyText = displayText.trim();
	const shouldAnimateIn = entryState === "enter";
	const shouldHoldHidden = entryState === "hidden";

	return (
		<motion.div
			className="group/user flex justify-end"
			initial={shouldAnimateIn ? USER_HIDDEN_VISUAL_STATE : false}
			animate={shouldHoldHidden ? USER_HIDDEN_VISUAL_STATE : USER_VISIBLE_VISUAL_STATE}
			transition={USER_ENTRY_TRANSITION}
			onAnimationComplete={shouldAnimateIn ? onEntryComplete : undefined}
			style={USER_MESSAGE_STYLE}
		>
			<div className="relative max-w-[72%] before:absolute before:inset-x-0 before:top-full before:h-8 before:content-['']">
				{hasImages && (
					<div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
						{message.images!.map((img, i) => (
							<div
								key={i}
								className="h-20 w-20 overflow-hidden rounded-xl border border-border/50"
							>
								<img
									src={`data:${img.mimeType};base64,${img.data}`}
									alt={img.name}
									className="h-full w-full object-cover"
								/>
							</div>
						))}
					</div>
				)}
				{(displayText || hasBadges) && (
					<div
						className="rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-[13px] leading-[1.6] text-foreground"
						style={{ wordBreak: "break-word" }}
					>
						{hasBadges && (
							<div className="mb-1 flex flex-wrap justify-end gap-1">
								{skillName && <SkillBadge name={skillName} type={skillType ?? "skill"} />}
								{files.map((f) => (
									<FileBadge key={f} path={f} />
								))}
							</div>
						)}
						{displayText && (
							<motion.div
								initial={shouldAnimateIn ? USER_TEXT_INITIAL : false}
								animate={shouldHoldHidden ? USER_TEXT_INITIAL : USER_TEXT_VISIBLE}
								transition={USER_TEXT_TRANSITION}
								style={{ whiteSpace: "pre-wrap" }}
							>
								{displayText}
							</motion.div>
						)}
					</div>
				)}
				{!displayText && !hasBadges && !hasImages && (
					<div
						className="rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-[13px] leading-[1.6] text-foreground"
						style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
					>
						{"\u2026"}
					</div>
				)}
				{copyText && (
					<div className="pointer-events-none absolute right-0 top-full mt-1 flex items-center justify-end gap-1 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/user:pointer-events-auto group-hover/user:opacity-100">
						{message.timestamp && <RelativeTimeLabel endedAt={message.timestamp} />}
						<CopyButton getText={() => copyText} />
					</div>
				)}
			</div>
		</motion.div>
	);
});

/** Assistant message — full-width, no bubble, with header */
const AssistantMessage = memo(function AssistantMessage({ message, isTailMessage, isStreaming, exportMode = false }: {
	message: ChatMessage;
	isTailMessage: boolean;
	isStreaming: boolean;
	exportMode?: boolean;
}) {
	const hasBlocks = message.blocks && message.blocks.length > 0;
	const isCurrentlyStreaming = isTailMessage && isStreaming;
	const showDuration = message.durationSeconds && message.durationSeconds > 0 && !isCurrentlyStreaming;
	const [expanded, setExpanded] = useState(false);
	const generatedId = useId();
	const exportFoldPanelId = exportMode ? `export-assistant-fold-${generatedId}` : undefined;
	// 输入预测「生成中」：仅末条 assistant 消息、且当前会话正在预测时展示闪光提示。
	const activeRid = useAtomValue(activeSessionAtom)?.runtimeId;
	const toolCallSlots = useAtomValue(pluginToolCallSlotsAtom);
	const customToolNames = useMemo(
		() => new Set(toolCallSlots.map((slot) => slot.toolName)),
		[toolCallSlots],
	);
	const predictingMap = useAtomValue(promptPredictingAtom);
	const isPredicting = isTailMessage && !isCurrentlyStreaming && !!activeRid && predictingMap[activeRid] === true;
	const foldData = useMemo(
		() => getAssistantFoldData(message.blocks ?? [], customToolNames),
		[message.blocks, customToolNames],
	);
	const visibleBlocks = useMemo(() => {
		if (exportMode && foldData) return foldData.trailingBlocks;
		if (!foldData || expanded || isCurrentlyStreaming) return message.blocks ?? [];
		return foldData.outputBlocks;
	}, [expanded, exportMode, foldData, isCurrentlyStreaming, message.blocks]);
	const segments = useMemo(() => groupBlocks(visibleBlocks, customToolNames), [visibleBlocks, customToolNames]);
	const exportProcessSegments = useMemo(
		() => exportMode && foldData ? groupBlocks(foldData.processBlocks, customToolNames) : [],
		[customToolNames, exportMode, foldData],
	);
	// streaming 时给最后一个非空 text segment 标记 streaming tail，
	// 由 TextBlockView 控制展示节奏，避免高速 token 直接整块刷出。
	const streamingTailIndex = useMemo(() => {
		if (!isCurrentlyStreaming) return -1;
		for (let i = segments.length - 1; i >= 0; i--) {
			const seg = segments[i];
			if (seg.type !== "single") continue;
			const b = seg.block;
			if (b.type === "text" && b.text.length > 0) {
				return i;
			}
		}
		return -1;
	}, [segments, isCurrentlyStreaming]);
	const conclusionText = useMemo(
		() => getAssistantConclusionText(message, customToolNames),
		[message, customToolNames],
	);
	const showActions = !isCurrentlyStreaming && conclusionText.length > 0;

	return (
		<div className="flex flex-col">
			{/* Header: avatar + name + timestamp + duration */}
			<div className="mb-2 flex items-center gap-2">
				<BotAvatar active={isCurrentlyStreaming} />
				<span className="text-[13px] font-semibold text-foreground/80">
					Vetta
				</span>
				{message.timestamp && (
					<span className="text-[11px] text-muted-foreground/35">
						{formatTime(message.timestamp)}
					</span>
				)}
				{showDuration && (
					<>
						<span className="text-[11px] text-muted-foreground/20">·</span>
						<span className="text-[11px] text-muted-foreground/35">
							{formatDuration(message.durationSeconds!)}
						</span>
					</>
				)}
				{isCurrentlyStreaming && (
					<div className="flex items-center gap-1">
						<span
							className="h-1.5 w-1.5 rounded-full bg-primary/60"
							style={{ animation: "pulse 1.5s infinite" }}
						/>
						<span className="text-[11px] text-muted-foreground/35">处理中...</span>
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
					onToggle={() => setExpanded((value) => !value)}
					exportPanelId={exportFoldPanelId}
				/>
			) : null}

			{/* Content blocks */}
			<div>
				{hasBlocks ? (
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
						{segments.map((segment, i) => (
							<SegmentRenderer
								key={segmentKey(segment)}
								segment={segment}
								isStreamingTail={i === streamingTailIndex}
								animateIn={isCurrentlyStreaming && i === segments.length - 1}
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

			{(showActions || isPredicting) && (
				<div className="mt-2 flex items-center gap-2">
					{showActions && (
						<div className="flex items-center gap-1">
							<CopyButton getText={() => conclusionText} />
							{(message.endedAt ?? message.timestamp) && (
								<RelativeTimeLabel endedAt={(message.endedAt ?? message.timestamp)!} />
							)}
						</div>
					)}
					{isPredicting && (
						<span className="processing-shimmer text-[11px] font-medium">Vetta 正在预测…</span>
					)}
				</div>
			)}

			<div className="mt-2">
				<MessageCardsHost message={message} />
			</div>
		</div>
	);
});

const Message = memo(function Message({ message, isTailMessage, isStreaming, userMessageEntryState, onUserMessageEntryComplete, exportMode = false }: {
	message: ChatMessage;
	isTailMessage: boolean;
	isStreaming: boolean;
	userMessageEntryState: UserMessageEntryState;
	onUserMessageEntryComplete?: () => void;
	exportMode?: boolean;
}) {
	if (message.role === "compaction") {
		return <CompactionBoundary />;
	}
	if (message.role === "user") {
		return (
			<UserMessage
				message={message}
				entryState={userMessageEntryState}
				onEntryComplete={onUserMessageEntryComplete}
			/>
		);
	}
	return <AssistantMessage message={message} isTailMessage={isTailMessage} isStreaming={isStreaming} exportMode={exportMode} />;
});

export const ExportMessageList = forwardRef<HTMLDivElement, { messages: ChatMessage[] }>(
	function ExportMessageList({ messages }, ref) {
		const tailMessageId = messages.at(-1)?.id ?? null;
		return (
			<div ref={ref} className="chat-export-document mx-auto flex w-full max-w-3xl flex-col px-5 py-5">
				{messages.map((message) => (
					<div key={message.id} className="pb-5">
						<Message
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
	},
);

/** Compaction boundary marker — shows where context was compressed. */
const CompactionBoundary = memo(function CompactionBoundary() {
	return (
		<div className="flex items-center gap-3 py-1">
			<div className="h-px flex-1 bg-muted-foreground/15" />
			<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
				<span className="icon-[mdi--compress] h-3 w-3" />
				上下文已压缩
			</span>
			<div className="h-px flex-1 bg-muted-foreground/15" />
		</div>
	);
});

function CompactionIndicator(): JSX.Element {
	return (
		<motion.div
			initial={INDICATOR_INITIAL}
			animate={INDICATOR_ANIMATE}
			exit={INDICATOR_EXIT}
			transition={INDICATOR_TRANSITION}
			className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
		>
			<svg width={14} height={14} style={{ animation: "context-ring-spin 1s linear infinite" }}>
				<circle cx={7} cy={7} r={5} fill="none" stroke="var(--secondary, #333)" strokeWidth={2} opacity={0.3} />
				<circle
					cx={7} cy={7} r={5} fill="none" stroke="#f59e0b" strokeWidth={2}
					strokeDasharray={`${Math.PI * 5 * 0.25} ${Math.PI * 5 * 0.75}`}
					strokeLinecap="round"
				/>
			</svg>
			<span className="text-[12px] text-amber-500/80">正在压缩上下文...</span>
		</motion.div>
	);
}

/** Footer component rendered below the virtualized list — contains compaction indicator, artifacts */
const ListFooter = memo(function ListFooter({
	isCompacting,
}: {
	isCompacting: boolean;
}) {
	const files = useAtomValue(turnModifiedFilesAtom);
	if (!isCompacting && files.length === 0) return <div style={{ height: 64 }} />;
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-1 pb-16">
			<AnimatePresence initial={false}>
				{isCompacting && <CompactionIndicator key="compacting" />}
			</AnimatePresence>
			<ArtifactCard files={files} />
		</div>
	);
});

export function MessageList({ messages, isStreaming, sessionId, onSend }: MessageListProps): JSX.Element {
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const scrollerRef = useRef<HTMLElement | null>(null);
	const isCompacting = useAtomValue(isCompactingAtom);

	// 末尾消息 id：仅当末尾是 assistant 时才用它判断「正在吐字」。
	// 不能用「最后一条 assistant 的 id」——用户追加新消息后，旧 assistant 仍会被
	// 误判为 streaming，触发短暂展开后再折叠的闪烁。
	const tailMessageId = messages.at(-1)?.id ?? null;

	// 是否处于真实贴底状态，由 Virtuoso 的 atBottomStateChange 维护。
	const atBottomRef = useRef(true);
	// 是否应该继续跟随底部。内容增长会让 atBottom 短暂变 false，但不应关闭跟随；
	// 只有用户主动滚动离开底部时才关闭。
	const shouldFollowBottomRef = useRef(true);
	const lastMessage = messages.at(-1);
	const previousRenderMsgCountRef = useRef(messages.length);
	const enteringUserMessageId =
		messages.length > previousRenderMsgCountRef.current && lastMessage?.role === "user"
			? lastMessage.id
			: null;
	const [pendingUserAnimationId, setPendingUserAnimationId] = useState<string | null>(null);
	const pendingUserAnimationIdRef = useRef<string | null>(null);
	const [activeUserAnimationId, setActiveUserAnimationId] = useState<string | null>(null);
	const releasePendingUserAnimation = useCallback(() => {
		const id = pendingUserAnimationIdRef.current;
		if (!id) return;
		pendingUserAnimationIdRef.current = null;
		setPendingUserAnimationId(null);
		setActiveUserAnimationId(id);
	}, []);
	const lerpRafRef = useRef<number | null>(null);
	const lastTouchYRef = useRef<number | null>(null);
	const isStreamingRef = useRef(isStreaming);
	isStreamingRef.current = isStreaming;

	const tickLerp = useCallback(() => {
		const el = scrollerRef.current;
		if (!el || !shouldFollowBottomRef.current) {
			lerpRafRef.current = null;
			return;
		}
		const target = Math.max(0, el.scrollHeight - el.clientHeight);
		const diff = target - el.scrollTop;
		if (diff > 0.5) {
			// 线性 lerp：每帧吃掉差值的一部分，开局快收尾稳，视觉上「持续追着底部」
			// 而非「跳—停—跳」。streaming 期间系数更高，避免内容生成时明显落后底部。
			el.scrollTop =
				el.scrollTop + diff * (isStreamingRef.current ? STREAMING_SCROLL_LERP_RATIO : IDLE_SCROLL_LERP_RATIO);
			lerpRafRef.current = requestAnimationFrame(tickLerp);
		} else if (isStreamingRef.current) {
			releasePendingUserAnimation();
			lerpRafRef.current = requestAnimationFrame(tickLerp);
		} else {
			releasePendingUserAnimation();
			lerpRafRef.current = null;
		}
	}, [releasePendingUserAnimation]);

	const startLerp = useCallback(() => {
		if (lerpRafRef.current === null) {
			lerpRafRef.current = requestAnimationFrame(tickLerp);
		}
	}, [tickLerp]);

	const handleAtBottom = useCallback(
		(atBottom: boolean) => {
			atBottomRef.current = atBottom;
			if (atBottom) {
				shouldFollowBottomRef.current = true;
				releasePendingUserAnimation();
				startLerp();
			}
		},
		[releasePendingUserAnimation, startLerp],
	);

	// 用户主动「向上滚」即视为离开底部，立刻停止自动跟随。
	// 关键：按滚动「方向」判定，而非「距底距离」。旧实现用 distanceFromBottom > 80
	// 做判定，导致贴底 80px 内的小幅上滚被无视，lerp 每帧又把 scrollTop 拉回底部，
	// 和用户打架。重新跟随由 Virtuoso 的 atBottomStateChange(true) 在用户滚回底部时触发。
	const stopFollowingBottom = useCallback(() => {
		shouldFollowBottomRef.current = false;
		if (lerpRafRef.current !== null) {
			cancelAnimationFrame(lerpRafRef.current);
			lerpRafRef.current = null;
		}
	}, []);

	const handleWheelIntent = useCallback(
		(event: WheelEvent) => {
			if (event.deltaY < 0) stopFollowingBottom();
		},
		[stopFollowingBottom],
	);

	const handleTouchStart = useCallback((event: TouchEvent) => {
		lastTouchYRef.current = event.touches[0]?.clientY ?? null;
	}, []);

	const handleTouchMove = useCallback(
		(event: TouchEvent) => {
			const y = event.touches[0]?.clientY;
			if (y == null) return;
			const last = lastTouchYRef.current;
			lastTouchYRef.current = y;
			// 手指下移（y 增大）= 内容向上滚 = 用户想看上文
			if (last != null && y > last) stopFollowingBottom();
		},
		[stopFollowingBottom],
	);

	// session 切换：瞬间跳到底部，且取消任何 in-flight lerp 动画，避免出现
	// 「从旧位置滑向新底部」的视觉动画。
	const prevSessionIdRef = useRef<string | null | undefined>(sessionId);
	const skipNextLerpRef = useRef(false);
	useEffect(() => {
		if (prevSessionIdRef.current === sessionId) return;
		prevSessionIdRef.current = sessionId;
		if (lerpRafRef.current !== null) {
			cancelAnimationFrame(lerpRafRef.current);
			lerpRafRef.current = null;
		}
		atBottomRef.current = true;
		shouldFollowBottomRef.current = true;
		pendingUserAnimationIdRef.current = null;
		setPendingUserAnimationId(null);
		setActiveUserAnimationId(null);
		// 同 tick 触发的 messages/isStreaming effect 会另起一轮 lerp，标记跳过一次。
		skipNextLerpRef.current = true;
		// Virtuoso 接收新 data 后下一帧再 scrollToIndex 才稳。
		requestAnimationFrame(() => {
			virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" });
		});
	}, [sessionId]);

	// streaming 开关、消息变更都可能拉高 scrollHeight，触发一次 lerp。
	// 实际是否真跟随由 atBottomRef 决定；用户向上滚走后下一帧就退出。
	useEffect(() => {
		if (skipNextLerpRef.current) {
			skipNextLerpRef.current = false;
			return;
		}
		if (shouldFollowBottomRef.current) startLerp();
	}, [messages, isStreaming, startLerp]);

	// 用户发送新消息：无论之前是否贴底，都强制接管为「跟随」并启动 lerp 滑到底。
	const prevMsgCountRef = useRef(messages.length);
	useLayoutEffect(() => {
		const prevCount = prevMsgCountRef.current;
		prevMsgCountRef.current = messages.length;
		const newMsg = messages.at(-1);
		if (messages.length > prevCount && newMsg?.role === "user") {
			if (atBottomRef.current) {
				setActiveUserAnimationId(newMsg.id);
			} else {
				pendingUserAnimationIdRef.current = newMsg.id;
				setPendingUserAnimationId(newMsg.id);
			}
			atBottomRef.current = true;
			shouldFollowBottomRef.current = true;
			startLerp();
		}
	}, [messages, startLerp]);

	useEffect(() => {
		previousRenderMsgCountRef.current = messages.length;
	}, [messages.length]);

	const handleUserMessageEntryComplete = useCallback(() => {
		setActiveUserAnimationId(null);
	}, []);

	// 卸载时停掉跟随循环
	useEffect(() => {
		return () => {
			if (lerpRafRef.current !== null) {
				cancelAnimationFrame(lerpRafRef.current);
				lerpRafRef.current = null;
			}
		};
	}, []);

	const itemContent = useCallback((index: number, message: ChatMessage) => (
		// 末条 user 消息：hover 出的 action list 绝对定位在气泡下方，需额外底部留白，
		// 否则被 List 容器的 overflow-hidden 在底边裁掉一截（agent 回复出现后即非末条，自动还原）。
		<div className={index === messages.length - 1 && message.role === "user" ? "pb-9" : "pb-5"}>
			<Message
				message={message}
				isTailMessage={message.id === tailMessageId}
				isStreaming={isStreaming}
				userMessageEntryState={
					message.id === activeUserAnimationId
						? "enter"
						: message.id === pendingUserAnimationId || message.id === enteringUserMessageId
							? "hidden"
							: "static"
				}
				onUserMessageEntryComplete={
					message.id === activeUserAnimationId ? handleUserMessageEntryComplete : undefined
				}
			/>
		</div>
	), [
		activeUserAnimationId,
		enteringUserMessageId,
		handleUserMessageEntryComplete,
		isStreaming,
		messages.length,
		pendingUserAnimationId,
		tailMessageId,
	]);

	const scrollerRefCallback = useCallback((el: HTMLElement | Window | null) => {
		scrollerRef.current = el instanceof HTMLElement ? el : null;
		// Disable native CSS scroll-anchoring. When a variable-height item above the
		// viewport is re-measured (e.g. an image card's row settles its width/overflow),
		// the browser's overflow-anchor silently shifts scrollTop to "keep position" —
		// fighting Virtuoso's own JS scroll management and producing a one-shot jump as
		// the item's top edge crosses the viewport. The list owns scroll; opt out of the
		// browser's. (This adjustment is native, so it never showed up in JS scrollTop probes.)
		if (scrollerRef.current) scrollerRef.current.style.overflowAnchor = "none";
	}, []);

	useEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		el.addEventListener("wheel", handleWheelIntent, { passive: true });
		el.addEventListener("touchstart", handleTouchStart, { passive: true });
		el.addEventListener("touchmove", handleTouchMove, { passive: true });
		return () => {
			el.removeEventListener("wheel", handleWheelIntent);
			el.removeEventListener("touchstart", handleTouchStart);
			el.removeEventListener("touchmove", handleTouchMove);
		};
	}, [handleWheelIntent, handleTouchStart, handleTouchMove]);

	const footer = useCallback(() => (
		<>
			{onSend && <SuggestionBubbles onSend={onSend} />}
			<ListFooter isCompacting={isCompacting} />
		</>
	), [isCompacting, onSend]);

	const virtuosoComponents = useMemo(() => ({
		List: VirtuosoListContainer,
		Footer: footer,
	}), [footer]);

	return (
		<>
			<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.4; }
				}
				textarea::placeholder { color: var(--muted-foreground); opacity: 0.5; }
				@keyframes context-ring-spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
				@keyframes processing-shimmer {
					0%, 100% { opacity: 0.58; }
					50% { opacity: 1; }
				}
				.processing-shimmer {
					color: var(--foreground);
					animation: processing-shimmer 1.6s ease-in-out infinite;
					will-change: opacity;
				}
			`}</style>
			<Virtuoso
				ref={virtuosoRef}
				scrollerRef={scrollerRefCallback}
				data={messages}
				className="flex-1 pt-2"
				style={VIRTUOSO_STYLE}
				atBottomStateChange={handleAtBottom}
				atBottomThreshold={80}
				overscan={isStreaming ? STREAMING_OVERSCAN : IDLE_OVERSCAN}
				increaseViewportBy={isStreaming ? STREAMING_INCREASE_VIEWPORT_BY : IDLE_INCREASE_VIEWPORT_BY}
				defaultItemHeight={80}
				components={virtuosoComponents}
				itemContent={itemContent}
				initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
			/>
		</>
	);
}

const VirtuosoListContainer = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	function VirtuosoListContainer(props, ref) {
		return (
			<div
				{...props}
				ref={ref}
				className="mx-auto flex max-w-3xl flex-col overflow-hidden px-5 pb-5"
				style={{ ...props.style }}
			/>
		);
	},
);

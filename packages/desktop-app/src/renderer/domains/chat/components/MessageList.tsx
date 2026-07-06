import { forwardRef, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Transition } from "motion/react";
import { useAtomValue, useSetAtom } from "jotai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useTranslation } from "react-i18next";
import {
	type ChatMessage,
	type FilePreviewItem,
	type ContentBlock,
	type TextBlock,
	type ThinkingBlock,
	type ToolCallBlock,
	activeSessionAtom,
	isCompactingAtom,
	pluginToolCallSlotsAtom,
	filePreviewAtom,
	openUrlInBrowserAtom,
	promptPredictingAtom,
	resolvedThemeAtom,
} from "@shared/store/atoms";
import { chatMessagesAtom, inputValueAtom } from "@shared/store/chat-atoms";
import { BotAvatar } from "@shared/components/BotAvatar";
import { useModelOptions } from "@shared/components/ModelSelect/useModelOptions";
import { SyntaxHighlightedCode } from "@shared/components/SyntaxHighlightedCode";
import { cn, pathBasename } from "@shared/lib/utils";
import { PluginTurnCardHost } from "../../plugins/components/PluginTurnCardHost";
import { MessageCardsHost } from "./MessageCardsHost";
import { AppshotCard, type AppshotCardData } from "./AppshotCard";
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
	/** 暂停当前 streaming 会话的回调 */
	onAbort?: () => void;
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
const STREAM_CHAR_HIDDEN = { opacity: 0, filter: "blur(6px)" };
const STREAM_CHAR_SHOWN = { opacity: 1, filter: "blur(0px)" };
const STREAM_CHAR_TRANSITION = { duration: 0.42, ease: [0.25, 0.1, 0.25, 1] as const } satisfies Transition;
const STREAMING_OVERSCAN = 80;
const IDLE_OVERSCAN = 400;
const STREAMING_INCREASE_VIEWPORT_BY = { top: 0, bottom: 80 };
const IDLE_INCREASE_VIEWPORT_BY = { top: 200, bottom: 200 };
const VIRTUOSO_STYLE = { overflowX: "hidden" as const };
const MIN_SCROLL_LERP_RATIO = 0.045;
const IDLE_MAX_SCROLL_LERP_RATIO = 0.18;
const STREAMING_MAX_SCROLL_LERP_RATIO = 0.28;
const SCROLL_DISTANCE_FOR_MAX_RATIO = 900;
const USER_MESSAGE_COLLAPSED_LINES = 10;
const USER_MESSAGE_COLLAPSED_MAX_HEIGHT = `${USER_MESSAGE_COLLAPSED_LINES * 1.6}em`;

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

function getScrollLerpRatio(diff: number, isStreaming: boolean): number {
	const maxRatio = isStreaming ? STREAMING_MAX_SCROLL_LERP_RATIO : IDLE_MAX_SCROLL_LERP_RATIO;
	const distanceRatio = Math.min(1, diff / SCROLL_DISTANCE_FOR_MAX_RATIO);
	return MIN_SCROLL_LERP_RATIO + (maxRatio - MIN_SCROLL_LERP_RATIO) * distanceRatio;
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

const SHORT_EPILOGUE_MAX_CHARS = 80;
const PRIMARY_ANSWER_MIN_CHARS = 160;

function hasStructuredAnswerContent(text: string): boolean {
	return /```|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|\|.+\|/m.test(text);
}

function isShortEpilogueText(blocks: TextBlock[]): boolean {
	if (blocks.length !== 1) return false;
	const text = blocks[0].text.trim();
	return text.length > 0 && text.length <= SHORT_EPILOGUE_MAX_CHARS && !hasStructuredAnswerContent(text);
}

function isMaintenanceToolCall(block: ContentBlock): boolean {
	if (block.type !== "tool_call") return false;
	const toolName = block.toolName.toLowerCase();
	if (!toolName.includes("todo")) return false;
	return block.args.action === "update";
}

function findPreviousPrimaryAnswerIndex(blocks: ContentBlock[], beforeIndex: number): number {
	for (let i = beforeIndex - 1; i >= 0; i--) {
		const block = blocks[i];
		if (block.type === "tool_call" || block.type === "thinking") return -1;
		if (block.type !== "text") continue;
		if (block.text.trim().length >= PRIMARY_ANSWER_MIN_CHARS) return i;
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
	const trailingTextBlocks = blocks
		.slice(lastProcessIndex + 1)
		.filter((block): block is TextBlock => block.type === "text" && block.text.trim().length > 0);
	if (trailingTextBlocks.length === 0) return null;

	const lastProcessBlock = blocks[lastProcessIndex];
	const primaryAnswerIndex =
		isMaintenanceToolCall(lastProcessBlock) && isShortEpilogueText(trailingTextBlocks)
			? findPreviousPrimaryAnswerIndex(blocks, lastProcessIndex)
			: -1;
	if (primaryAnswerIndex !== -1) {
		const primaryAnswerBlock = blocks[primaryAnswerIndex] as TextBlock;
		const outputBlocks = [primaryAnswerBlock, ...trailingTextBlocks];
		const outputBlockSet = new Set<ContentBlock>(outputBlocks);
		return {
			processBlocks: blocks.filter((block) => !outputBlockSet.has(block)),
			trailingBlocks: blocks.filter((block) => outputBlockSet.has(block)),
			outputBlocks,
			hiddenCount: blocks.length - outputBlocks.length,
		};
	}

	return {
		processBlocks: blocks.slice(0, lastProcessIndex + 1),
		trailingBlocks: blocks.slice(lastProcessIndex + 1),
		outputBlocks: trailingTextBlocks,
		hiddenCount: blocks.length - trailingTextBlocks.length,
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
	const { t } = useTranslation("chat");
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
					? t("messageList.toolCallGroup.completed", { count: completedCount })
					: t("messageList.toolCallGroup.inProgress", { completed: completedCount, total: toolBlocks.length }),
			);
		}
		if (thinkingCount > 0) {
			parts.push(t("messageList.toolCallGroup.thinking", { count: thinkingCount }));
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

/** 从 @path 文件列表分离出 appshot 截图（路径特征：image-cache/appshot/*.png）。
 *  这样已发送消息里的 appshot 走专属卡片渲染，而非两个普通文件 badge（png+md）。 */
function splitAppshotFiles(files: string[]): { appshotImage: string | null; rest: string[] } {
	const isAppshot = (p: string): boolean => /[/\\]image-cache[/\\]appshot[/\\]/.test(p);
	const appshotImage = files.find((p) => isAppshot(p) && /\.png$/i.test(p)) ?? null;
	const rest = files.filter((p) => !isAppshot(p));
	return { appshotImage, rest };
}

const USER_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);

function getPathExtension(path: string): string {
	const basename = pathBasename(path);
	const dotIndex = basename.lastIndexOf(".");
	return dotIndex === -1 ? "" : basename.slice(dotIndex + 1).toLowerCase();
}

function isUserImageFile(path: string): boolean {
	return USER_IMAGE_EXTENSIONS.has(getPathExtension(path));
}

function toFileProtocolUrl(path: string): string {
	const prefix = path.startsWith("/") ? "" : "/";
	return `vetta-file://local${prefix}${encodeURI(path)}`;
}

function getPreviewImageSrc(item: FilePreviewItem): string {
	if (item.url) return item.url;
	if (item.path) return toFileProtocolUrl(item.path);
	return "";
}

/** 提取 user 消息的可复制文本：去掉 /skill: 与 @file 前缀，仅保留正文 body。 */
function getUserCopyText(message: ChatMessage): string {
	const { body } = parseUserPrefixes(message.text ?? "");
	return body.trim();
}

/**
 * 提取 assistant 消息的结论文本：与折叠展示保持一致。
 * 无 tool/thinking 时整段都是结论；纯工具轮 / 仅 error 时返回空字符串。
 */
function getAssistantConclusionText(message: ChatMessage, customToolNames: Set<string>): string {
	const blocks = message.blocks ?? [];
	if (blocks.length === 0) return (message.text ?? "").trim();
	const foldData = getAssistantFoldData(blocks, customToolNames);
	if (foldData) {
		return foldData.outputBlocks
			.map((block) => block.text.trim())
			.filter(Boolean)
			.join("\n\n");
	}
	if (findLastProcessBlockIndex(blocks, customToolNames) !== -1) return "";
	return blocks
		.filter((b): b is TextBlock => b.type === "text")
		.map((b) => b.text.trim())
		.filter(Boolean)
		.join("\n\n");
}

/** 复制按钮：icon-only + tooltip，点击后原位切到 check 持续 1.5s。 */
function CopyButton({ getText }: { getText: () => string }): JSX.Element {
	const { t } = useTranslation("chat");
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

	const label = copied ? t("messageList.copyButton.copied") : t("messageList.copyButton.copy");

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

/** 编辑按钮：仅最后一条 user 消息可见，点击后将消息文本送回 input bar */
function EditButton({ onClick }: { onClick: () => void }): JSX.Element {
	const { t } = useTranslation("chat");
	const label = t("messageList.editButton");

	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/45 transition-colors hover:bg-muted/60 hover:text-foreground"
		>
			<span className="icon-[mdi--pencil] h-3.5 w-3.5" />
		</button>
	);
}

function SkillBadge({ name, type = "skill" }: { name: string; type?: "skill" | "scene" }): JSX.Element {
	const { t } = useTranslation("chat");
	const icon = type === "scene" ? "icon-[mdi--movie-open-outline]" : "icon-[mdi--puzzle-outline]";
	const label = t(type === "scene" ? "messageList.userMessage.sceneBadge" : "messageList.userMessage.skillBadge");
	return (
		<span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
			<span className={`${icon} h-3 w-3`} />
			<span className="text-primary/75">{label}</span>
			<span>{name}</span>
		</span>
	);
}

function FileBadge({ path }: { path: string }): JSX.Element {
	const setFilePreview = useSetAtom(filePreviewAtom);
	const name = pathBasename(path);
	return (
		<button
			type="button"
			className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition hover:bg-primary/20"
			title={path}
			onClick={() => setFilePreview({ name, path })}
		>
			<span className="icon-[mdi--file-outline] h-3 w-3" />
			{name}
		</button>
	);
}

function ImageAttachmentGroup({ items }: { items: FilePreviewItem[] }): JSX.Element {
	const setFilePreview = useSetAtom(filePreviewAtom);
	return (
		<div className="flex max-w-full justify-end gap-2 overflow-x-auto">
			{items.map((item, index) => {
				const src = getPreviewImageSrc(item);
				return (
					<button
						key={item.path ?? item.url ?? `${item.name}-${index}`}
						type="button"
						onClick={() => setFilePreview({ items, index })}
						className="group relative h-20 w-20 overflow-hidden rounded-xl border border-border/60 bg-muted/60 shadow-sm transition hover:border-primary/50 hover:shadow-md"
						title={item.path ?? item.name}
					>
						<img src={src} alt={item.name} className="h-full w-full object-cover" />
						<span className="pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
					</button>
				);
			})}
		</div>
	);
}

type UserMessageEntryState = "static" | "hidden" | "enter";

interface UserMessageTextProps {
	text: string;
	shouldAnimateIn: boolean;
	shouldHoldHidden: boolean;
}

function resolveFileLinkPath(href: string | undefined): string | null {
	if (!href) return null;
	const decode = (raw: string): string => {
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	};
	if (href.startsWith("file://")) {
		return decode(href.replace(/^file:\/\//, ""));
	}
	if (href.startsWith("/")) return decode(href);
	return null;
}

const LINK_BADGE_CLASS =
	"inline-flex max-w-full items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px align-middle text-[12px] font-medium text-primary no-underline transition-colors hover:bg-primary/20";

function UserMessageText({ text, shouldAnimateIn, shouldHoldHidden }: UserMessageTextProps): JSX.Element {
	const { t } = useTranslation("chat");
	const contentRef = useRef<HTMLDivElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [canExpand, setCanExpand] = useState(false);
	const theme = useAtomValue(resolvedThemeAtom);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const openUrlInBrowser = useSetAtom(openUrlInBrowserAtom);

	const measureOverflow = useCallback(() => {
		const content = contentRef.current;
		if (!content) return;
		const fontSize = Number.parseFloat(window.getComputedStyle(content).fontSize);
		const collapsedHeight = fontSize * 1.6 * USER_MESSAGE_COLLAPSED_LINES;
		setCanExpand(content.scrollHeight > collapsedHeight + 1);
	}, []);

	useLayoutEffect(() => {
		setExpanded(false);
		measureOverflow();
		const content = contentRef.current;
		if (!content) return;
		const observer = new ResizeObserver(measureOverflow);
		observer.observe(content);
		return () => observer.disconnect();
	}, [measureOverflow, text]);

	const components = useMemo<Components>(() => ({
		h1: ({ children }) => (
			<h1 className="mb-2 mt-3 text-[15px] font-bold leading-tight text-foreground">{children}</h1>
		),
		h2: ({ children }) => (
			<h2 className="mb-1.5 mt-2.5 text-[14px] font-bold leading-tight text-foreground">{children}</h2>
		),
		h3: ({ children }) => (
			<h3 className="mb-1.5 mt-2 text-[13px] font-semibold leading-tight text-foreground">{children}</h3>
		),
		h4: ({ children }) => (
			<h4 className="mb-1 mt-1.5 text-[12px] font-semibold text-foreground">{children}</h4>
		),
		p: ({ children }) => (
			<p className="my-1 text-[13px] leading-[1.6] text-foreground">{children}</p>
		),
		ul: ({ children }) => (
			<ul className="my-1 ml-4 space-y-0.5 text-[13px] leading-[1.6] text-foreground list-disc marker:text-foreground/40">{children}</ul>
		),
		ol: ({ children }) => (
			<ol className="my-1 ml-4 list-decimal space-y-0.5 text-[13px] leading-[1.6] text-foreground marker:text-foreground/40">{children}</ol>
		),
		li: ({ children }) => <li className="pl-0.5">{children}</li>,
		code: ({ className, children }) => {
			const raw = String(children);
			const isBlock = (className?.startsWith("language-") ?? false) || raw.includes("\n");
			if (isBlock) {
				const lang = className?.replace("language-", "") ?? "";
				const code = raw.replace(/\n$/, "");
				return (
					<div className="my-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/80">
						{lang && (
							<div className="border-b border-border/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/50">
								{lang}
							</div>
						)}
						<SyntaxHighlightedCode code={code} lang={lang} theme={theme} />
					</div>
				);
			}
			return (
				<code className="rounded bg-muted/80 px-1 py-0.5 text-[12px] text-foreground">
					{children}
				</code>
			);
		},
		pre: ({ children }) => <>{children}</>,
		blockquote: ({ children }) => (
			<blockquote className="my-1.5 border-l-2 border-primary/10 pl-2.5 text-[13px] italic text-muted-foreground">
				{children}
			</blockquote>
		),
		strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
		em: ({ children }) => <em className="italic">{children}</em>,
		hr: () => <hr className="my-2 border-border/40" />,
		a: ({ href, children }) => {
			const filePath = resolveFileLinkPath(href);
			if (filePath) {
				return (
					<button
						type="button"
						title={filePath}
						className={cn(LINK_BADGE_CLASS, "cursor-pointer")}
						onClick={() => setFilePreview({ name: filePath.split("/").pop() ?? filePath, path: filePath })}
					>
						<span className="icon-[mdi--file-outline] h-3.5 w-3.5 shrink-0" />
						<span className="truncate">{children}</span>
					</button>
				);
			}
			if (href && /^https?:\/\//i.test(href)) {
				return (
					<a
						href={href}
						title={href}
						className={LINK_BADGE_CLASS}
						onClick={(e) => {
							e.preventDefault();
							openUrlInBrowser(href);
						}}
					>
						<span className="icon-[mdi--web] h-3.5 w-3.5 shrink-0" />
						<span className="truncate">{children}</span>
					</a>
				);
			}
			return (
				<a href={href} className="text-chart-2 underline decoration-chart-2/30 hover:decoration-chart-2" target="_blank" rel="noopener noreferrer">
					{children}
				</a>
			);
		},
	}), [theme, setFilePreview, openUrlInBrowser]);

	return (
		<div
			className="relative overflow-hidden"
			style={{ maxHeight: expanded ? undefined : USER_MESSAGE_COLLAPSED_MAX_HEIGHT }}
		>
			<motion.div
				ref={contentRef}
				initial={shouldAnimateIn ? USER_TEXT_INITIAL : false}
				animate={shouldHoldHidden ? USER_TEXT_INITIAL : USER_TEXT_VISIBLE}
				transition={USER_TEXT_TRANSITION}
			>
				<div className="markdown-body break-words">
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						components={components}
					>
						{text}
					</ReactMarkdown>
				</div>
			</motion.div>
			{canExpand && !expanded && (
				<div className="absolute inset-x-0 bottom-0 flex h-20 items-end justify-center rounded-b-2xl bg-gradient-to-t from-secondary via-secondary/80 to-secondary/0 pb-1.5">
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[12px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
					>
						<span className="icon-[solar--alt-arrow-down-linear] h-3.5 w-3.5" />
						<span>{t("messageList.userMessage.expand")}</span>
					</button>
				</div>
			)}
		</div>
	);
}

/** User message — right-aligned bubble */
const UserMessage = memo(function UserMessage({
	message,
	entryState,
	onEntryComplete,
	isLastUserMessage = false,
	hasAssistantAfter = false,
	isStreaming = false,
	onAbortEdit,
}: {
	message: ChatMessage;
	entryState: UserMessageEntryState;
	onEntryComplete?: () => void;
	isLastUserMessage?: boolean;
	hasAssistantAfter?: boolean;
	isStreaming?: boolean;
	onAbortEdit?: () => void;
}) {
	const parsed = parseUserPrefixes(message.text);
	const { skillName, skillType } = parsed;
	const { appshotImage, rest: displayFiles } = splitAppshotFiles(parsed.files);
	const isImageCache = (p: string): boolean => /[/\\]image-cache[/\\]/.test(p);
	const imageFiles = displayFiles.filter(
		(file) => isUserImageFile(file) && !isImageCache(file),
	);
	// 新消息：file badge 精确按 message.mentionedFiles 渲染；
	//         提到文件为空时 body 不剥离任何文本（防止手打 @ 开头的文字被误吞）。
	// 旧消息：fallback 到 parseUserPrefixes 从 message.text 解析。
	const hasExplicitMentionedFiles = message.mentionedFiles !== undefined;
	const fileBadges: string[] = hasExplicitMentionedFiles
		? message.mentionedFiles!.map((f) => f.path).filter((p) => !isUserImageFile(p))
		: displayFiles.filter((file) => !isUserImageFile(file));
	const displayText = hasExplicitMentionedFiles && message.mentionedFiles!.length === 0
		? message.text
		: parsed.body;
	const appshotData: AppshotCardData | null = message.appshot ?? (appshotImage ? { imagePath: appshotImage } : null);
	const imageItems = useMemo<FilePreviewItem[]>(
		() => [
			...(message.images ?? []).map((img) => ({
				name: img.name,
				url: `data:${img.mimeType};base64,${img.data}`,
				kind: "image" as const,
				mime: img.mimeType,
			})),
			...imageFiles.map((path) => ({ name: pathBasename(path), path, kind: "image" as const })),
		],
		[message.images, imageFiles],
	);
	const hasImages = imageItems.length > 0;
	const hasSkillBadge = Boolean(skillName);
	const hasFileBadges = fileBadges.length > 0;
	const copyText = displayText.trim();
	const shouldAnimateIn = entryState === "enter";
	const shouldHoldHidden = entryState === "hidden";

	const setInputValue = useSetAtom(inputValueAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);

	const handleEdit = useCallback(() => {
		// Case 1: agent 已回复下方，且不在 streaming → 复制文本到 input bar
		// Case 2: 无 agent 回复下方，且 streaming（正准备回答还没消息） → 暂停 + 撤回 user + pending agent + 回到 input bar
		// Case 3: agent 已回复下方，且 streaming（已生成一半） → 暂停 + 复制文本到 input bar
		if (hasAssistantAfter) {
			if (isStreaming) {
				// Case 3
				onAbortEdit?.();
			}
			// Case 1 or 3: copy text to input bar
			setInputValue(message.text);
		} else {
			if (isStreaming) {
				// Case 2: abort + remove this user message and pending agent message + put text back
				onAbortEdit?.();
				// Remove in-progress messages starting from this user message
				setChatMessages((prev) => {
					const idx = prev.findIndex((m) => m.id === message.id);
					if (idx === -1) return prev;
					return prev.slice(0, idx);
				});
			}
			setInputValue(message.text);
		}
	}, [hasAssistantAfter, isStreaming, message.id, message.text, onAbortEdit, setChatMessages, setInputValue]);

	return (
		<motion.div
			className="group/user flex justify-end"
			initial={shouldAnimateIn ? USER_HIDDEN_VISUAL_STATE : false}
			animate={shouldHoldHidden ? USER_HIDDEN_VISUAL_STATE : USER_VISIBLE_VISUAL_STATE}
			transition={USER_ENTRY_TRANSITION}
			onAnimationComplete={shouldAnimateIn ? onEntryComplete : undefined}
			style={USER_MESSAGE_STYLE}
		>
			<div className="relative flex max-w-[72%] flex-col items-end before:absolute before:inset-x-0 before:top-full before:h-8 before:content-['']">
				{appshotData && (
					<div className="mb-1.5 flex justify-end">
						<AppshotCard data={appshotData} />
					</div>
				)}
				{hasImages && (
					<div className="mb-1.5 flex justify-end">
						<ImageAttachmentGroup items={imageItems} />
					</div>
				)}
				{hasSkillBadge && (
					<div className="mb-1 flex flex-wrap justify-end gap-1">
						{skillName && <SkillBadge name={skillName} type={skillType ?? "skill"} />}
					</div>
				)}
				{displayText && (
					<div
						className="cursor-text rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-[13px] leading-[1.6] text-foreground"
						style={{ wordBreak: "break-word" }}
					>
						<UserMessageText text={displayText} shouldAnimateIn={shouldAnimateIn} shouldHoldHidden={shouldHoldHidden} />
					</div>
				)}
				{!displayText && !hasSkillBadge && !hasFileBadges && !hasImages && !appshotData && (
					<div
						className="cursor-text rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-[13px] leading-[1.6] text-foreground"
						style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
					>
						{"\u2026"}
					</div>
				)}
				{hasFileBadges && (
					<div className="mt-1 flex flex-wrap justify-end gap-1">
						{fileBadges.map((f) => (
							<FileBadge key={f} path={f} />
						))}
					</div>
				)}
				{copyText && (
					<div className="pointer-events-none absolute right-0 top-full mt-1 flex items-center justify-end gap-1 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/user:pointer-events-auto group-hover/user:opacity-100">
						{message.timestamp && <RelativeTimeLabel endedAt={message.timestamp} />}
						{isLastUserMessage && <EditButton onClick={handleEdit} />}
						<CopyButton getText={() => copyText} />
					</div>
				)}
			</div>
		</motion.div>
	);
});

/**
 * streaming 时的「正在回复」提示：逐字毛玻璃渐显（停在清晰态，不做持续模糊以免发脏），
 * 一句显现完成并停留后轮换到下一句文案，循环往复。
 */
function StreamingIndicator(): JSX.Element {
	const { t } = useTranslation("chat");
	const phrases = t("messageList.streamingPhrases", { returnObjects: true });
	const list = Array.isArray(phrases) ? (phrases as string[]) : [];
	const [index, setIndex] = useState(0);
	const text = list[index] ?? "";
	const chars = Array.from(text);

	useEffect(() => {
		if (list.length <= 1) return;
		// 显现耗时（末字 delay + 单字时长）+ 停留，到点切下一句
		const revealMs = chars.length * 35 + 420;
		const id = setTimeout(() => setIndex((v) => (v + 1) % list.length), revealMs + 1100);
		return () => clearTimeout(id);
	}, [index, list.length, chars.length]);

	return (
		<span className="inline-flex text-[11px] font-medium text-muted-foreground/55" aria-label={text}>
			{chars.map((ch, i) => (
				<motion.span
					key={`${index}-${i}`}
					aria-hidden
					className="inline-block whitespace-pre"
					initial={STREAM_CHAR_HIDDEN}
					animate={STREAM_CHAR_SHOWN}
					transition={{ ...STREAM_CHAR_TRANSITION, delay: i * 0.035 }}
				>
					{ch}
				</motion.span>
			))}
		</span>
	);
}

/** Assistant message — full-width, no bubble, with header */
const AssistantMessage = memo(function AssistantMessage({ message, isTailMessage, isStreaming, exportMode = false }: {
	message: ChatMessage;
	isTailMessage: boolean;
	isStreaming: boolean;
	exportMode?: boolean;
}) {
	const { t } = useTranslation("chat");
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
						<span className="text-[11px] text-muted-foreground/35">{t("messageList.assistantMessage.processing")}</span>
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
						className="cursor-text text-[13px] leading-[1.6] text-foreground"
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
						<span className="processing-shimmer text-[11px] font-medium">{t("messageList.assistantMessage.predicting")}</span>
					)}
				</div>
			)}

			<div className="mt-2">
				<MessageCardsHost message={message} />
			</div>
		</div>
	);
});

const Message = memo(function Message({ message, isTailMessage, isStreaming, userMessageEntryState, onUserMessageEntryComplete, isLastUserMessage = false, hasAssistantAfter = false, onAbortEdit, exportMode = false }: {
	message: ChatMessage;
	isTailMessage: boolean;
	isStreaming: boolean;
	userMessageEntryState: UserMessageEntryState;
	onUserMessageEntryComplete?: () => void;
	isLastUserMessage?: boolean;
	hasAssistantAfter?: boolean;
	onAbortEdit?: () => void;
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
				isLastUserMessage={isLastUserMessage}
				hasAssistantAfter={hasAssistantAfter}
				isStreaming={isStreaming}
				onAbortEdit={onAbortEdit}
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

/** Model-switch boundary marker — shows where the user turn switched to a different model. */
const ModelSwitchBoundary = memo(function ModelSwitchBoundary({ label }: { label: string }) {
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

function CompactionIndicator(): JSX.Element {
	const { t } = useTranslation("chat");
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
			<span className="text-[12px] text-amber-500/80">{t("messageList.compactionIndicator")}</span>
		</motion.div>
	);
}

/** Footer component rendered below the virtualized list — compaction indicator, streaming, plugin turn cards */
const ListFooter = memo(function ListFooter({
	isCompacting,
	showWaiting,
}: {
	isCompacting: boolean;
	/** assistant 消息尚未出现、但已在 streaming 的空档，需要先给出「正在回复」提示。 */
	showWaiting: boolean;
}) {
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-1 pb-16">
			<AnimatePresence initial={false}>
				{isCompacting && <CompactionIndicator key="compacting" />}
			</AnimatePresence>
			{showWaiting && !isCompacting && (
				<div className="flex items-center">
					<StreamingIndicator />
				</div>
			)}
			<PluginTurnCardHost />
		</div>
	);
});

export function MessageList({ messages, isStreaming, sessionId, onSend, onAbort }: MessageListProps): JSX.Element {
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const scrollerRef = useRef<HTMLElement | null>(null);
	const isCompacting = useAtomValue(isCompactingAtom);

	const { options } = useModelOptions();
	const modelDisplayName = useMemo(() => {
		const map = new Map<string, string>();
		for (const o of options) map.set(o.key, o.displayName);
		return (key: string) => map.get(key) ?? key;
	}, [options]);
	const modelSwitchAt = useMemo(() => {
		const at = new Map<string, string>();
		let prevKey: string | null = null;
		for (const m of messages) {
			if (m.role !== "user") continue;
			const key = m.model ? `${m.model.provider}/${m.model.id}` : null;
			if (key && prevKey && key !== prevKey) at.set(m.id, key);
			if (key) prevKey = key;
		}
		return at;
	}, [messages]);

	// 末尾消息 id：仅当末尾是 assistant 时才用它判断「正在吐字」。
	// 不能用「最后一条 assistant 的 id」——用户追加新消息后，旧 assistant 仍会被
	// 误判为 streaming，触发短暂展开后再折叠的闪烁。
	const tailMessageId = messages.at(-1)?.id ?? null;

	// 最后一条 user 消息的 id，用于判断哪条用户消息可以编辑
	const lastUserMessageId = useMemo(() => {
		const lastUser = [...messages].reverse().find((m) => m.role === "user");
		return lastUser?.id ?? null;
	}, [messages]);

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
			// 跟随速度按剩余距离递增：短距离慢一点，长距离才加速，避免小幅补位看起来像瞬移。
			el.scrollTop = el.scrollTop + diff * getScrollLerpRatio(diff, isStreamingRef.current);
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

	// 用户发送新消息：先播放入场动画，再由动画完成回调启动 lerp，避免插入消息和滚动同时发生。
	const prevMsgCountRef = useRef(messages.length);
	useLayoutEffect(() => {
		const prevCount = prevMsgCountRef.current;
		prevMsgCountRef.current = messages.length;
		const newMsg = messages.at(-1);
		if (messages.length > prevCount && newMsg?.role === "user") {
			setActiveUserAnimationId(newMsg.id);
			pendingUserAnimationIdRef.current = null;
			setPendingUserAnimationId(null);
			atBottomRef.current = true;
			shouldFollowBottomRef.current = false;
			skipNextLerpRef.current = true;
		}
	}, [messages]);

	useEffect(() => {
		previousRenderMsgCountRef.current = messages.length;
	}, [messages.length]);

	const handleUserMessageEntryComplete = useCallback(() => {
		setActiveUserAnimationId(null);
		shouldFollowBottomRef.current = true;
		startLerp();
	}, [startLerp]);

	// 卸载时停掉跟随循环
	useEffect(() => {
		return () => {
			if (lerpRafRef.current !== null) {
				cancelAnimationFrame(lerpRafRef.current);
				lerpRafRef.current = null;
			}
		};
	}, []);

	const itemContent = useCallback((index: number, message: ChatMessage) => {
		// 判断该 user 消息后是否有 assistant 消息
		const hasAssistantAfter =
			index < messages.length - 1 &&
			messages.slice(index + 1).some((m) => m.role !== "user");
		const isLastUserMessage = message.id === lastUserMessageId;
		return (
		// 末条 user 消息：hover 出的 action list 绝对定位在气泡下方，需额外底部留白，
		// 否则被 List 容器的 overflow-hidden 在底边裁掉一截（agent 回复出现后即非末条，自动还原）。
		<div className={index === messages.length - 1 && message.role === "user" ? "pb-9" : "pb-5"}>
			{modelSwitchAt.has(message.id) && <ModelSwitchBoundary label={modelDisplayName(modelSwitchAt.get(message.id)!)} />}
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
				isLastUserMessage={isLastUserMessage}
				hasAssistantAfter={hasAssistantAfter}
				onAbortEdit={onAbort}
			/>
		</div>
		);
	}, [
		activeUserAnimationId,
		enteringUserMessageId,
		handleUserMessageEntryComplete,
		isStreaming,
		lastUserMessageId,
		messages,
		modelDisplayName,
		modelSwitchAt,
		onAbort,
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

	// assistant 消息出现前的空档（末条仍是 user）也要显示「正在回复」提示，避免看起来卡住。
	const showWaiting = isStreaming && messages.at(-1)?.role !== "assistant";
	const footer = useCallback(() => (
		<>
			{onSend && <SuggestionBubbles onSend={onSend} />}
			<ListFooter isCompacting={isCompacting} showWaiting={showWaiting} />
		</>
	), [isCompacting, showWaiting, onSend]);

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
				/* code blocks in messages: allow text selection (override cursor-grab cascade) */
				.msg-content pre,
				.msg-content code,
				.msg-content .code-block {
					cursor: text !important;
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

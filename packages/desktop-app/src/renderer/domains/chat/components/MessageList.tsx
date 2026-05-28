import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAtomValue } from "jotai";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
	type ChatMessage,
	type ContentBlock,
	type TextBlock,
	type ThinkingBlock,
	type ToolCallBlock,
	isCompactingAtom,
	isReloadingMcpAtom,
	turnModifiedFilesAtom,
} from "@shared/store/atoms";
import { ArtifactCard } from "@shared/components/ArtifactCard";
import { BotAvatar } from "@shared/components/BotAvatar";
import { cn, pathBasename } from "@shared/lib/utils";
import { TextBlockView } from "./blocks/TextBlock";
import { ThinkingBlockView } from "./blocks/ThinkingBlock";
import { ToolCallBlockView } from "./blocks/ToolCallBlock";

interface MessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
	sessionId?: string | null;
}

/** A grouped segment of content blocks for rendering. */
type BlockSegment =
	| { type: "single"; block: ContentBlock }
	| { type: "tool_group"; blocks: (ToolCallBlock | ThinkingBlock)[] };

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

/** Group consecutive tool_call and thinking blocks into collapsible groups. */
function groupBlocks(blocks: ContentBlock[]): BlockSegment[] {
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
		if (block.type === "tool_call" || block.type === "thinking") {
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

interface AssistantFoldData {
	outputBlocks: TextBlock[];
	hiddenCount: number;
}

function getAssistantFoldData(blocks: ContentBlock[]): AssistantFoldData | null {
	const lastProcessIndex = blocks.findLastIndex((block) => block.type === "tool_call" || block.type === "thinking");
	if (lastProcessIndex === -1) return null;
	const outputBlocks = blocks
		.slice(lastProcessIndex + 1)
		.filter((block): block is TextBlock => block.type === "text" && block.text.trim().length > 0);
	if (outputBlocks.length === 0) return null;
	return {
		outputBlocks,
		hiddenCount: blocks.length - outputBlocks.length,
	};
}

/** Collapsed group of multiple tool calls and/or thinking blocks. */
const ToolCallGroup = memo(function ToolCallGroup({ blocks }: { blocks: (ToolCallBlock | ThinkingBlock)[] }) {
	const [expanded, setExpanded] = useState(false);
	const toolBlocks = blocks.filter((b): b is ToolCallBlock => b.type === "tool_call");
	const thinkingCount = blocks.filter((b) => b.type === "thinking").length;
	const completedCount = toolBlocks.filter((b) => b.status !== "pending").length;
	const hasError = toolBlocks.some((b) => b.status === "error");
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
		<div>
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="inline-flex items-center gap-2 rounded-lg pr-2 py-1 text-left transition-colors hover:bg-muted/60"
			>
				<span
					className={`icon-[mdi--chevron-right] h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""} ${hasError ? "text-destructive/70" : "text-muted-foreground/30"}`}
				/>
				<span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground/60">
					{blocks.length}
				</span>
				<span className={`text-[12px] text-muted-foreground/50 ${allDone ? "" : "tool-call-shimmer-text"}`}>
					{getSummary()}
				</span>
			</button>
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-0.5 pl-2">
							{blocks.map((block) =>
								block.type === "tool_call" ? (
									<ToolCallBlockView key={block.toolCallId} block={block} />
								) : (
									<ThinkingBlockView key={`thinking-${block.id}`} text={block.text} />
								),
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
});

const SegmentRenderer = memo(function SegmentRenderer({ segment, isStreamingTail = false }: { segment: BlockSegment; isStreamingTail?: boolean }) {
	if (segment.type === "tool_group") {
		return <ToolCallGroup blocks={segment.blocks} />;
	}
	const { block } = segment;
	switch (block.type) {
		case "text":
			return <TextBlockView text={block.text} isStreamingTail={isStreamingTail} />;
		case "thinking":
			return <ThinkingBlockView text={block.text} />;
		case "tool_call":
			return <ToolCallBlockView block={block} />;
		case "error":
			return (
				<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
					<span className="icon-[mdi--alert-circle-outline] mt-0.5 h-4 w-4 shrink-0 text-destructive/70" />
					<span className="text-[13px] leading-[1.6] text-destructive/90" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
						{block.text}
					</span>
				</div>
			);
		default:
			return null;
	}
});

/** Format timestamp to HH:mm:ss */
function formatTime(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
}

function AssistantFoldTip({ state, count, expanded, startedAt, onToggle }: AssistantFoldTipProps): JSX.Element {
	const elapsedSeconds = useElapsedSeconds(startedAt, state === "streaming");

	if (state === "streaming") {
		return (
			<div className="mb-3">
				<div className="mb-2 flex items-center">
					<span className="processing-shimmer text-[12px] font-medium">
						正在处理{elapsedSeconds}s
					</span>
				</div>
				<div className="h-0.5 w-full rounded-full bg-border/80" />
			</div>
		);
	}

	return (
		<div className="mb-3">
			<button
				type="button"
				onClick={onToggle}
				className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-lg py-1 pr-1.5 text-[12px] font-medium text-muted-foreground/55 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
			>
				<span
					className={cn(
						"icon-[mdi--chevron-right] h-3.5 w-3.5 shrink-0 transition-transform duration-200",
						expanded && "rotate-90",
					)}
				/>
				<span>{expanded ? "收起" : "展开"}{count}条内容</span>
			</button>
			<div className="h-0.5 w-full rounded-full bg-border/80" />
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
function getAssistantConclusionText(message: ChatMessage): string {
	const blocks = message.blocks ?? [];
	if (blocks.length === 0) return (message.text ?? "").trim();
	const lastProcessIndex = blocks.findLastIndex(
		(b) => b.type === "tool_call" || b.type === "thinking",
	);
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
	const hiddenVisualState = { opacity: 0, scale: 0.82, x: 14, y: 12 };
	const visibleVisualState = { opacity: 1, scale: 1, x: 0, y: 0 };

	return (
		<motion.div
			className="group/user flex justify-end"
			initial={shouldAnimateIn ? hiddenVisualState : false}
			animate={shouldHoldHidden ? hiddenVisualState : visibleVisualState}
			transition={{ type: "spring", stiffness: 520, damping: 24, mass: 0.8 }}
			onAnimationComplete={shouldAnimateIn ? onEntryComplete : undefined}
			style={{ originX: 1, originY: 1 }}
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
								initial={shouldAnimateIn ? { filter: "blur(6px)" } : false}
								animate={{ filter: shouldHoldHidden ? "blur(6px)" : "blur(0px)" }}
								transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
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
					<div className="pointer-events-none absolute right-0 top-full mt-1 flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover/user:pointer-events-auto group-hover/user:opacity-100">
						<CopyButton getText={() => copyText} />
					</div>
				)}
			</div>
		</motion.div>
	);
});

/** Assistant message — full-width, no bubble, with header */
const AssistantMessage = memo(function AssistantMessage({ message, isTailMessage, isStreaming }: {
	message: ChatMessage;
	isTailMessage: boolean;
	isStreaming: boolean;
}) {
	const hasBlocks = message.blocks && message.blocks.length > 0;
	const isCurrentlyStreaming = isTailMessage && isStreaming;
	const showDuration = message.durationSeconds && message.durationSeconds > 0 && !isCurrentlyStreaming;
	const [expanded, setExpanded] = useState(false);
	const foldData = useMemo(() => getAssistantFoldData(message.blocks ?? []), [message.blocks]);
	const visibleBlocks = useMemo(() => {
		if (!foldData || expanded || isCurrentlyStreaming) return message.blocks ?? [];
		return foldData.outputBlocks;
	}, [expanded, foldData, isCurrentlyStreaming, message.blocks]);
	const segments = useMemo(() => groupBlocks(visibleBlocks), [visibleBlocks]);
	// 仅在 streaming 时给「最后一个足够长的 text segment」标记 streaming tail，
	// 用于触发末端羽化遮罩。长度阈值用于规避对单行短消息整体淡化。
	const streamingTailIndex = useMemo(() => {
		if (!isCurrentlyStreaming) return -1;
		for (let i = segments.length - 1; i >= 0; i--) {
			const seg = segments[i];
			if (seg.type !== "single") continue;
			const b = seg.block;
			if (b.type === "text" && (b.text.length > 60 || b.text.includes("\n"))) {
				return i;
			}
		}
		return -1;
	}, [segments, isCurrentlyStreaming]);
	const conclusionText = useMemo(
		() => getAssistantConclusionText(message),
		[message],
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
				/>
			) : null}

			{/* Content blocks */}
			<div>
				{hasBlocks ? (
					<div className="flex flex-col gap-0.5">
						{segments.map((segment, i) => (
							<SegmentRenderer
								key={segmentKey(segment)}
								segment={segment}
								isStreamingTail={i === streamingTailIndex}
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

			{showActions && (
				<div className="mt-2 flex items-center gap-0.5">
					<CopyButton getText={() => conclusionText} />
				</div>
			)}
		</div>
	);
});

const Message = memo(function Message({ message, isTailMessage, isStreaming, userMessageEntryState, onUserMessageEntryComplete }: {
	message: ChatMessage;
	isTailMessage: boolean;
	isStreaming: boolean;
	userMessageEntryState: UserMessageEntryState;
	onUserMessageEntryComplete?: () => void;
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
	return <AssistantMessage message={message} isTailMessage={isTailMessage} isStreaming={isStreaming} />;
});

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

function McpReloadIndicator(): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 6 }}
			transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
			className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2"
		>
			<svg width={14} height={14} style={{ animation: "context-ring-spin 1s linear infinite" }}>
				<circle cx={7} cy={7} r={5} fill="none" stroke="var(--secondary, #333)" strokeWidth={2} opacity={0.3} />
				<circle
					cx={7} cy={7} r={5} fill="none" stroke="#0ea5e9" strokeWidth={2}
					strokeDasharray={`${Math.PI * 5 * 0.25} ${Math.PI * 5 * 0.75}`}
					strokeLinecap="round"
				/>
			</svg>
			<span className="text-[12px] text-sky-500/80">MCP 配置已变更，正在重新加载工具...</span>
		</motion.div>
	);
}

function CompactionIndicator(): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 6 }}
			transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
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

function TypingIndicator(): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 6 }}
			transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
			className="flex items-center gap-2"
		>
			<div className="flex gap-[3px] py-2">
				{[0, 1, 2].map((i) => (
					<span
						key={i}
						className="h-[5px] w-[5px] rounded-full bg-muted-foreground/30"
						style={{ animation: `bounce 1.2s ${i * 0.15}s infinite` }}
					/>
				))}
			</div>
		</motion.div>
	);
}

/** Footer component rendered below the virtualized list — contains typing indicator, compaction, artifacts */
const ListFooter = memo(function ListFooter({
	showTyping,
	isCompacting,
	isReloadingMcp,
}: {
	showTyping: boolean;
	isCompacting: boolean;
	isReloadingMcp: boolean;
}) {
	const files = useAtomValue(turnModifiedFilesAtom);
	if (!showTyping && !isCompacting && !isReloadingMcp && files.length === 0) return <div style={{ height: 64 }} />;
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-1 pb-16">
			<AnimatePresence initial={false}>
				{isReloadingMcp && <McpReloadIndicator key="mcp-reload" />}
				{showTyping && <TypingIndicator key="typing" />}
				{isCompacting && <CompactionIndicator key="compacting" />}
			</AnimatePresence>
			<ArtifactCard files={files} />
		</div>
	);
});

export function MessageList({ messages, isStreaming, sessionId }: MessageListProps): JSX.Element {
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const scrollerRef = useRef<HTMLElement | null>(null);
	const isCompacting = useAtomValue(isCompactingAtom);
	const isReloadingMcp = useAtomValue(isReloadingMcpAtom);
	// streaming 期间始终显示底部三点跳动动画 —— 哪怕 assistant 已开始吐字也保留，
	// 作为「agent 仍在工作」的持续视觉信号；agent_end 后随 isStreaming 一起隐藏。
	const showTyping = isStreaming;

	// 末尾消息 id：仅当末尾是 assistant 时才用它判断「正在吐字」。
	// 不能用「最后一条 assistant 的 id」——用户追加新消息后，旧 assistant 仍会被
	// 误判为 streaming，触发短暂展开后再折叠的闪烁。
	const tailMessageId = messages.at(-1)?.id ?? null;

	// 是否处于「贴底跟随」状态：true 时启动 rAF 平滑 lerp 把 scrollTop 拉向底部。
	// 由 Virtuoso 的 atBottomStateChange 维护；用户手动向上滚动会自动转为 false，
	// 跟随循环下一帧自然退出。
	const atBottomRef = useRef(true);
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
	// 当前是否正在 streaming —— 给 tick 闭包用，避免 useCallback 依赖触发重建。
	const isStreamingRef = useRef(isStreaming);
	isStreamingRef.current = isStreaming;
	const lerpRafRef = useRef<number | null>(null);

	const tickLerp = useCallback(() => {
		const el = scrollerRef.current;
		if (!el || !atBottomRef.current) {
			lerpRafRef.current = null;
			return;
		}
		const target = Math.max(0, el.scrollHeight - el.clientHeight);
		const diff = target - el.scrollTop;
		if (diff > 0.5) {
			// 线性 lerp：每帧吃掉差值的 20%，开局快收尾稳，视觉上「持续追着底部」
			// 而非「跳—停—跳」。
			el.scrollTop = el.scrollTop + diff * 0.2;
			lerpRafRef.current = requestAnimationFrame(tickLerp);
		} else if (isStreamingRef.current) {
			releasePendingUserAnimation();
			// 已贴底但 streaming 还在继续：保持循环，等下一帧的新内容继续抬高底部。
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
				releasePendingUserAnimation();
				startLerp();
			}
		},
		[releasePendingUserAnimation, startLerp],
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
		if (atBottomRef.current) startLerp();
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
		<div className="pb-5">
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
		pendingUserAnimationId,
		tailMessageId,
	]);

	const scrollerRefCallback = useCallback((el: HTMLElement | Window | null) => {
		scrollerRef.current = el instanceof HTMLElement ? el : null;
	}, []);

	const footer = useCallback(() => (
		<ListFooter showTyping={showTyping} isCompacting={isCompacting} isReloadingMcp={isReloadingMcp} />
	), [showTyping, isCompacting]);

	return (
		<>
			<style>{`
				@keyframes bounce {
					0%, 80%, 100% { transform: translateY(0); }
					40% { transform: translateY(-4px); }
				}
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
					0% { background-position: 200% 0; }
					100% { background-position: -200% 0; }
				}
				.processing-shimmer {
					background: linear-gradient(90deg, var(--muted-foreground) 0%, var(--foreground) 50%, var(--muted-foreground) 100%);
					background-size: 200% 100%;
					-webkit-background-clip: text;
					background-clip: text;
					color: transparent;
					animation: processing-shimmer 1.6s linear infinite;
				}
			`}</style>
			<Virtuoso
				ref={virtuosoRef}
				scrollerRef={scrollerRefCallback}
				data={messages}
				className="flex-1 pt-2"
				style={{ overflowX: "hidden" }}
				atBottomStateChange={handleAtBottom}
				atBottomThreshold={80}
				overscan={400}
				increaseViewportBy={{ top: 200, bottom: 200 }}
				defaultItemHeight={80}
				components={{
					List: VirtuosoListContainer,
					Footer: footer,
				}}
				itemContent={itemContent}
				initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
			/>
		</>
	);
}

/** Container for Virtuoso list items — centered with max width */
import { forwardRef } from "react";

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

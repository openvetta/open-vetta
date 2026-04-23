import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAtomValue } from "jotai";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
	type ChatMessage,
	type ContentBlock,
	type ThinkingBlock,
	type ToolCallBlock,
	isCompactingAtom,
	turnModifiedFilesAtom,
} from "@shared/store/atoms";
import { ArtifactCard } from "@shared/components/ArtifactCard";
import { pathBasename } from "@shared/lib/utils";
import { TextBlockView } from "./blocks/TextBlock";
import { ThinkingBlockView } from "./blocks/ThinkingBlock";
import { ToolCallBlockView } from "./blocks/ToolCallBlock";

interface MessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
}

/** A grouped segment of content blocks for rendering. */
type BlockSegment =
	| { type: "single"; block: ContentBlock }
	| { type: "tool_group"; blocks: (ToolCallBlock | ThinkingBlock)[] };

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
				<span className="text-[12px] text-muted-foreground/50">
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
							{blocks.map((block, i) =>
								block.type === "tool_call" ? (
									<ToolCallBlockView key={block.toolCallId} block={block} />
								) : (
									<ThinkingBlockView key={`thinking-${i}`} text={block.text} />
								),
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
});

const SegmentRenderer = memo(function SegmentRenderer({ segment }: { segment: BlockSegment }) {
	if (segment.type === "tool_group") {
		return <ToolCallGroup blocks={segment.blocks} />;
	}
	const { block } = segment;
	switch (block.type) {
		case "text":
			return <TextBlockView text={block.text} />;
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

/** User message — right-aligned bubble */
const UserMessage = memo(function UserMessage({ message }: { message: ChatMessage }) {
	const hasImages = message.images && message.images.length > 0;
	const { skillName, skillType, files, body } = parseUserPrefixes(message.text);
	const displayText = body;
	const hasBadges = skillName || files.length > 0;

	return (
		<div className="flex justify-end">
			<div className="max-w-[72%]">
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
							<div style={{ whiteSpace: "pre-wrap" }}>{displayText}</div>
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
			</div>
		</div>
	);
});

/** Assistant message — full-width, no bubble, with header */
const AssistantMessage = memo(function AssistantMessage({ message, isLastAssistant, isStreaming }: {
	message: ChatMessage;
	isLastAssistant: boolean;
	isStreaming: boolean;
}) {
	const hasBlocks = message.blocks && message.blocks.length > 0;
	const showDuration = message.durationSeconds && message.durationSeconds > 0 && !(isLastAssistant && isStreaming);
	const segments = useMemo(() => groupBlocks(message.blocks ?? []), [message.blocks]);
	const isCurrentlyStreaming = isLastAssistant && isStreaming;

	return (
		<div className="flex flex-col">
			{/* Header: avatar + name + timestamp + duration */}
			<div className="mb-2 flex items-center gap-2">
				<img
					src="./icon.png"
					alt="Vetta"
					className="h-5 w-5 shrink-0 rounded-md"
				/>
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

			{/* Content blocks */}
			<div>
				{hasBlocks ? (
					<div className="flex flex-col gap-0.5">
						{segments.map((segment, i) => (
							<SegmentRenderer key={`seg-${i}`} segment={segment} />
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
		</div>
	);
});

const Message = memo(function Message({ message, isLastAssistant, isStreaming }: {
	message: ChatMessage;
	isLastAssistant: boolean;
	isStreaming: boolean;
}) {
	if (message.role === "compaction") {
		return <CompactionBoundary />;
	}
	if (message.role === "user") {
		return <UserMessage message={message} />;
	}
	return <AssistantMessage message={message} isLastAssistant={isLastAssistant} isStreaming={isStreaming} />;
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
const ListFooter = memo(function ListFooter({ showTyping, isCompacting }: { showTyping: boolean; isCompacting: boolean }) {
	const files = useAtomValue(turnModifiedFilesAtom);
	if (!showTyping && !isCompacting && files.length === 0) return null;
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 pt-5">
			<AnimatePresence initial={false}>
				{showTyping && <TypingIndicator key="typing" />}
				{isCompacting && <CompactionIndicator key="compacting" />}
			</AnimatePresence>
			<ArtifactCard files={files} />
		</div>
	);
});

export function MessageList({ messages, isStreaming }: MessageListProps): JSX.Element {
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const [showScrollBtn, setShowScrollBtn] = useState(false);
	const isCompacting = useAtomValue(isCompactingAtom);
	const lastMessage = messages.at(-1);
	const showTyping = isStreaming && (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.text);

	// Find the last assistant message id
	const lastAssistantId = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === "assistant") return messages[i].id;
		}
		return null;
	}, [messages]);

	// Track whether we should follow output (stick to bottom)
	const followOutputRef = useRef(true);

	const handleAtBottom = useCallback((atBottom: boolean) => {
		followOutputRef.current = atBottom;
		setShowScrollBtn(!atBottom);
	}, []);

	const scrollToBottom = useCallback(() => {
		virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
		followOutputRef.current = true;
		setShowScrollBtn(false);
	}, []);

	// When user sends a new message, always scroll to bottom
	const prevMsgCountRef = useRef(messages.length);
	useEffect(() => {
		const prevCount = prevMsgCountRef.current;
		prevMsgCountRef.current = messages.length;
		const newMsg = messages.at(-1);
		if (messages.length > prevCount && newMsg?.role === "user") {
			followOutputRef.current = true;
			setShowScrollBtn(false);
			virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
		}
	}, [messages]);

	const itemContent = useCallback((index: number, message: ChatMessage) => (
		<div className="pb-5">
			<Message
				message={message}
				isLastAssistant={message.id === lastAssistantId}
				isStreaming={isStreaming}
			/>
		</div>
	), [lastAssistantId, isStreaming]);

	const followOutput = useCallback((isAtBottom: boolean): boolean | "smooth" => {
		if (followOutputRef.current) return "smooth";
		return isAtBottom;
	}, []);

	const footer = useCallback(() => (
		<ListFooter showTyping={showTyping} isCompacting={isCompacting} />
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
			`}</style>
			<Virtuoso
				ref={virtuosoRef}
				data={messages}
				className="flex-1 pt-2"
				style={{ overflowX: "hidden" }}
				followOutput={followOutput}
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
			<AnimatePresence>
				{showScrollBtn && (
					<motion.button
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.8 }}
						transition={{ duration: 0.15 }}
						type="button"
						onClick={scrollToBottom}
						className="absolute bottom-[72px] left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow-md transition-colors hover:bg-accent"
					>
						<span className="icon-[mdi--chevron-down] h-5 w-5" />
					</motion.button>
				)}
			</AnimatePresence>
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
				className="mx-auto flex max-w-3xl flex-col overflow-x-hidden px-5 pb-5"
				style={{ ...props.style }}
			/>
		);
	},
);

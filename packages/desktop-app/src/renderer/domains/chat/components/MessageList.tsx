import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ChatMessage, ContentBlock, ToolCallBlock } from "@shared/store/atoms";
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
	| { type: "tool_group"; blocks: ToolCallBlock[] };

/** Group consecutive tool_call blocks into collapsible groups. */
function groupBlocks(blocks: ContentBlock[]): BlockSegment[] {
	const segments: BlockSegment[] = [];
	let toolBatch: ToolCallBlock[] = [];

	function flushTools(): void {
		if (toolBatch.length === 0) return;
		if (toolBatch.length === 1) {
			segments.push({ type: "single", block: toolBatch[0] });
		} else {
			segments.push({ type: "tool_group", blocks: [...toolBatch] });
		}
		toolBatch = [];
	}

	for (const block of blocks) {
		if (block.type === "tool_call") {
			toolBatch.push(block);
		} else if (block.type === "tool_result") {
			// skip — results are rendered inside tool_call blocks
		} else {
			flushTools();
			segments.push({ type: "single", block });
		}
	}
	flushTools();
	return segments;
}

/** Collapsed group of multiple tool calls. */
function ToolCallGroup({ blocks }: { blocks: ToolCallBlock[] }): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const completedCount = blocks.filter((b) => b.status !== "pending").length;
	const hasError = blocks.some((b) => b.status === "error");
	const allDone = completedCount === blocks.length;

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
					{allDone
						? `${completedCount} 个工具调用完成`
						: `${completedCount}/${blocks.length} 个工具调用`}
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
							{blocks.map((block) => (
								<ToolCallBlockView key={block.toolCallId} block={block} />
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function SegmentRenderer({ segment }: { segment: BlockSegment }): JSX.Element | null {
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
}

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

/** Parse prefixes from user message text: /skills:<name> and @<path> lines. */
function parseUserPrefixes(text: string): { skillName: string | null; files: string[]; body: string } {
	let remaining = text;
	let skillName: string | null = null;
	const files: string[] = [];

	const skillMatch = remaining.match(/^\/skills:([^\n]+)\n?([\s\S]*)$/);
	if (skillMatch) {
		skillName = skillMatch[1].trim();
		remaining = skillMatch[2];
	}

	while (true) {
		const fileMatch = remaining.match(/^@([^\n]+)\n?([\s\S]*)$/);
		if (!fileMatch) break;
		files.push(fileMatch[1].trim());
		remaining = fileMatch[2];
	}

	return { skillName, files, body: remaining };
}

function SkillBadge({ name }: { name: string }): JSX.Element {
	return (
		<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-muted-foreground">
			<span className="icon-[mdi--puzzle-outline] h-3 w-3" />
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
function UserMessage({ message }: { message: ChatMessage }): JSX.Element {
	const hasImages = message.images && message.images.length > 0;
	const { skillName, files, body } = parseUserPrefixes(message.text);
	const displayText = body;
	const hasBadges = skillName || files.length > 0;

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
			className="flex justify-end"
		>
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
								{skillName && <SkillBadge name={skillName} />}
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
		</motion.div>
	);
}

/** Assistant message — full-width, no bubble, with header */
function AssistantMessage({ message, isLastAssistant, isStreaming }: {
	message: ChatMessage;
	isLastAssistant: boolean;
	isStreaming: boolean;
}): JSX.Element {
	const hasBlocks = message.blocks && message.blocks.length > 0;
	const showDuration = message.durationSeconds && message.durationSeconds > 0 && !(isLastAssistant && isStreaming);

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
			className="flex flex-col"
		>
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
				{isLastAssistant && isStreaming && (
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
						{groupBlocks(message.blocks!).map((segment, i) => (
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
		</motion.div>
	);
}

function Message({ message, isLastAssistant, isStreaming }: {
	message: ChatMessage;
	isLastAssistant: boolean;
	isStreaming: boolean;
}): JSX.Element {
	if (message.role === "user") {
		return <UserMessage message={message} />;
	}
	return <AssistantMessage message={message} isLastAssistant={isLastAssistant} isStreaming={isStreaming} />;
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

const NEAR_BOTTOM_THRESHOLD = 80;

function isNearBottom(el: HTMLElement): boolean {
	return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
}

export function MessageList({ messages, isStreaming }: MessageListProps): JSX.Element {
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickToBottomRef = useRef(true);
	const [showScrollBtn, setShowScrollBtn] = useState(false);
	const lastMessage = messages.at(-1);
	const showTyping = isStreaming && (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.text);

	// Find the last assistant message index
	let lastAssistantId: string | null = null;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") {
			lastAssistantId = messages[i].id;
			break;
		}
	}

	const handleScroll = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const near = isNearBottom(el);
		stickToBottomRef.current = near;
		setShowScrollBtn(!near);
	}, []);

	const scrollToBottom = useCallback(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		stickToBottomRef.current = true;
		setShowScrollBtn(false);
	}, []);

	const prevMsgCountRef = useRef(messages.length);
	useEffect(() => {
		const prevCount = prevMsgCountRef.current;
		prevMsgCountRef.current = messages.length;
		const newMsg = messages.at(-1);
		if (messages.length > prevCount && newMsg?.role === "user") {
			stickToBottomRef.current = true;
			setShowScrollBtn(false);
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
			return;
		}
		if (stickToBottomRef.current) {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages, isStreaming]);

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
			`}</style>
			<div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 pb-5 pt-2">
				<div className="mx-auto flex max-w-3xl flex-col gap-5">
					<AnimatePresence initial={false}>
						{messages.map((m) => (
							<Message
								key={m.id}
								message={m}
								isLastAssistant={m.id === lastAssistantId}
								isStreaming={isStreaming}
							/>
						))}
						{showTyping && <TypingIndicator key="typing" />}
					</AnimatePresence>
					<div ref={bottomRef} />
				</div>
			</div>
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

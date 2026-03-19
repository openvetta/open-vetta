import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ChatMessage, ContentBlock } from "../../store/atoms";
import { cn } from "../../lib/utils";
import { TextBlockView } from "./blocks/TextBlock";
import { ThinkingBlockView } from "./blocks/ThinkingBlock";
import { ToolCallBlockView } from "./blocks/ToolCallBlock";
import { UsageBar } from "./UsageBar";

interface MessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
}

function BlockRenderer({ block }: { block: ContentBlock }): JSX.Element | null {
	switch (block.type) {
		case "text":
			return <TextBlockView text={block.text} />;
		case "thinking":
			return <ThinkingBlockView text={block.text} />;
		case "tool_call":
			return <ToolCallBlockView block={block} />;
		case "tool_result":
			// Tool results are rendered inline with their corresponding tool_call blocks
			return null;
		default:
			return null;
	}
}

/** Parse a `/skills:<name>` prefix from user message text. */
function parseSkillPrefix(text: string): { skillName: string | null; body: string } {
	const match = text.match(/^\/skills:([^\n]+)\n?([\s\S]*)$/);
	if (!match) return { skillName: null, body: text };
	return { skillName: match[1].trim(), body: match[2] };
}

function SkillBadge({ name }: { name: string }): JSX.Element {
	return (
		<span
			className="mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
			style={{ background: "var(--accent-dim)", color: "var(--text-2)" }}
		>
			<span className="icon-[mdi--puzzle-outline] h-3 w-3" />
			{name}
		</span>
	);
}

function Message({ message }: { message: ChatMessage }): JSX.Element {
	const isUser = message.role === "user";
	const hasBlocks = message.blocks && message.blocks.length > 0;

	if (isUser) {
		const hasImages = message.images && message.images.length > 0;
		const { skillName, body } = parseSkillPrefix(message.text);
		const displayText = body;

		return (
			<motion.div
				initial={{ opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
				className="flex justify-end"
			>
				<div className="max-w-[72%]">
					{hasImages && (
						<div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
							{message.images!.map((img, i) => (
								<div
									key={i}
									className="h-20 w-20 overflow-hidden rounded-xl border border-[var(--border-1)]"
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
					{(displayText || skillName) && (
						<div
							className="rounded-2xl rounded-br-md bg-[var(--bubble-user)] px-3.5 py-2 text-[13px] leading-[1.5] text-[var(--text-1)]"
							style={{ wordBreak: "break-word" }}
						>
							{skillName && (
								<div className="mb-0.5 flex justify-end">
									<SkillBadge name={skillName} />
								</div>
							)}
							{displayText && (
								<div style={{ whiteSpace: "pre-wrap" }}>{displayText}</div>
							)}
						</div>
					)}
					{!displayText && !skillName && !hasImages && (
						<div
							className="rounded-2xl rounded-br-md bg-[var(--bubble-user)] px-3.5 py-2 text-[13px] leading-[1.5] text-[var(--text-1)]"
							style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
						>
							{"\u2026"}
						</div>
					)}
				</div>
			</motion.div>
		);
	}

	// Assistant message
	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
			className="flex justify-start"
		>
			<div className="mr-2 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]" style={{ boxShadow: "0 1px 4px var(--accent-glow)" }}>
				<span className="icon-[mdi--shimmer] h-2.5 w-2.5 text-[var(--accent-fg)]" />
			</div>
			<div className={cn("max-w-[85%] min-w-0", !hasBlocks && "rounded-2xl rounded-bl-md bg-[var(--bubble-assistant)] px-3.5 py-2")}>
				{hasBlocks ? (
					<div className="flex flex-col gap-0.5">
						{message.blocks!.map((block, i) => (
							<BlockRenderer key={`${block.type}-${i}`} block={block} />
						))}
					</div>
				) : (
					<div
						className="text-[13px] leading-[1.5] text-[var(--text-1)]"
						style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
					>
						{message.text || "\u2026"}
					</div>
				)}
			</div>
		</motion.div>
	);
}

function TypingIndicator(): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 4 }}
			transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
			className="flex items-center gap-2"
		>
			<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]" style={{ boxShadow: "0 1px 4px var(--accent-glow)" }}>
				<span className="icon-[mdi--shimmer] h-2.5 w-2.5 text-[var(--accent-fg)]" />
			</div>
			<div className="flex gap-[3px] rounded-2xl rounded-bl-md bg-[var(--bubble-assistant)] px-3.5 py-2.5">
				{[0, 1, 2].map((i) => (
					<span
						key={i}
						className="h-[5px] w-[5px] rounded-full bg-[var(--text-3)]"
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

	// When user sends a new message, always scroll to bottom
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
				textarea::placeholder { color: var(--text-3); }
			`}</style>
			<div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 pb-5 pt-[56px]">
				<div className="mx-auto flex max-w-2xl flex-col gap-3.5">
					<AnimatePresence initial={false}>
						{messages.map((m) => (
							<Message key={m.id} message={m} />
						))}
						{showTyping && <TypingIndicator key="typing" />}
					</AnimatePresence>
					{!isStreaming && messages.length > 0 && <UsageBar />}
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
						className="absolute bottom-[72px] left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-2)] shadow-md transition-colors hover:bg-[var(--surface-3)]"
					>
						<span className="icon-[mdi--chevron-down] h-5 w-5" />
					</motion.button>
				)}
			</AnimatePresence>
		</>
	);
}

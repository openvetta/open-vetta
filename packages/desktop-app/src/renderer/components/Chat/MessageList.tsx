import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ChatMessage } from "../../store/atoms";
import { cn } from "../../lib/utils";

interface MessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
}

function Message({ message }: { message: ChatMessage }): JSX.Element {
	const isUser = message.role === "user";
	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
			className={cn("flex", isUser ? "justify-end" : "justify-start")}
		>
			{!isUser && (
				<div className="mr-2 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]" style={{ boxShadow: "0 1px 4px var(--accent-glow)" }}>
					<span className="icon-[mdi--shimmer] h-2.5 w-2.5 text-[var(--accent-fg)]" />
				</div>
			)}
			<div
				className={cn(
					"max-w-[72%] rounded-2xl px-3.5 py-2 text-[13px] leading-[1.5]",
					isUser
						? "rounded-br-md bg-[var(--bubble-user)] text-[var(--text-1)]"
						: "rounded-bl-md bg-[var(--bubble-assistant)] text-[var(--text-1)]",
				)}
				style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
			>
				{message.text || "\u2026"}
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

export function MessageList({ messages, isStreaming }: MessageListProps): JSX.Element {
	const bottomRef = useRef<HTMLDivElement>(null);
	const lastMessage = messages.at(-1);
	const showTyping = isStreaming && (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.text);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isStreaming]);

	return (
		<>
			<style>{`
				@keyframes bounce {
					0%, 80%, 100% { transform: translateY(0); }
					40% { transform: translateY(-4px); }
				}
				textarea::placeholder { color: var(--text-3); }
			`}</style>
			<div className="flex-1 overflow-y-auto px-5 py-5">
				<div className="mx-auto flex max-w-2xl flex-col gap-3.5">
					<AnimatePresence initial={false}>
						{messages.map((m) => (
							<Message key={m.id} message={m} />
						))}
						{showTyping && <TypingIndicator key="typing" />}
					</AnimatePresence>
					<div ref={bottomRef} />
				</div>
			</div>
		</>
	);
}

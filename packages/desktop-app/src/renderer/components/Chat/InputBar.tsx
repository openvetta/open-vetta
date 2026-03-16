import { useAtom, useAtomValue } from "jotai";
import { useRef, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { inputValueAtom, isStreamingAtom, activeSessionAtom } from "../../store/atoms";
import { ModelSelector } from "./ModelSelector";
import { ContextRing } from "./ContextRing";

interface InputBarProps {
	onSend: () => Promise<void>;
	onAbort: () => Promise<void>;
}

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 200;

export function InputBar({ onSend, onAbort }: InputBarProps): JSX.Element {
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [isFocused, setIsFocused] = useState(false);

	const hasSession = Boolean(activeSession);
	const canSend = hasSession && !isStreaming && inputValue.trim().length > 0;
	const isEmpty = inputValue.trim().length === 0;

	// Auto-resize textarea to fit content
	const resize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "0";
		el.style.height = `${Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT))}px`;
	}, []);

	useEffect(() => {
		resize();
	}, [inputValue, resize]);

	// Focus textarea on mount and when session changes
	useEffect(() => {
		if (hasSession && !isStreaming) {
			textareaRef.current?.focus();
		}
	}, [hasSession, isStreaming]);

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (canSend) void onSend();
		}
	}

	function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
		setInputValue(e.target.value);
	}

	return (
		<div className="relative px-4 pb-4 pt-1">
			<div className="relative mx-auto max-w-2xl">
				{/* ── Card container ── */}
				<div
					className="input-card rounded-2xl transition-all duration-200"
					style={{
						background: "var(--input-card-bg)",
						boxShadow: isFocused
							? "var(--input-card-shadow-focus)"
							: "var(--input-card-shadow)",
						border: "1px solid",
						borderColor: isFocused
							? "var(--input-card-border-focus)"
							: "var(--input-card-border)",
						opacity: hasSession ? 1 : 0.5,
					}}
				>
					{/* ── Textarea area ── */}
					<div className="px-4 pt-3 pb-2">
						<textarea
							ref={textareaRef}
							rows={1}
							value={inputValue}
							onChange={handleChange}
							onKeyDown={handleKeyDown}
							onFocus={() => setIsFocused(true)}
							onBlur={() => setIsFocused(false)}
							disabled={!hasSession}
							placeholder={
								hasSession
									? "Message Vetta..."
									: "Select or create a session to start"
							}
							className="w-full resize-none bg-transparent text-[13.5px] leading-[1.6] text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)] disabled:cursor-not-allowed"
							style={{
								minHeight: `${MIN_HEIGHT}px`,
								maxHeight: `${MAX_HEIGHT}px`,
							}}
						/>
					</div>

					{/* ── Toolbar ── */}
					<div className="flex items-center justify-between px-3 pb-2.5">
						{/* Left: action buttons */}
						<div className="flex items-center gap-0.5">
							<ToolbarButton
								icon="icon-[mdi--plus]"
								title="Attach file"
								disabled={!hasSession}
							/>
							<ToolbarButton
								icon="icon-[mdi--image-outline]"
								title="Attach image"
								disabled={!hasSession}
							/>
						</div>

						{/* Right: model selector + send / stop */}
						<div className="flex items-center gap-1.5">
							<ModelSelector />
							<ContextRing />
							{/* Character hint */}
							<span className="mr-1 text-[11px] text-[var(--text-3)] select-none">
								{isStreaming ? "" : isEmpty ? "⏎ Send" : `⇧⏎ Newline`}
							</span>

							<AnimatePresence mode="wait">
								{isStreaming ? (
									<motion.button
										key="stop"
										type="button"
										onClick={() => void onAbort()}
										initial={{ scale: 0.8, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										exit={{ scale: 0.8, opacity: 0 }}
										transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
										className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--text-1)] text-[var(--content-bg)] transition-colors hover:opacity-80"
										title="Stop generating"
									>
										<motion.span
											className="icon-[mdi--stop] h-4 w-4"
											animate={{ scale: [1, 0.9, 1] }}
											transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
										/>
									</motion.button>
								) : (
									<motion.button
										key="send"
										type="button"
										onClick={() => void onSend()}
										disabled={!canSend}
										initial={{ scale: 0.8, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										exit={{ scale: 0.8, opacity: 0 }}
										transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
										className="send-button flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 disabled:opacity-30"
										style={{
											background: canSend ? "var(--text-1)" : "var(--surface-raised)",
											color: canSend ? "var(--content-bg)" : "var(--text-3)",
										}}
										title="Send message"
									>
										<motion.span
											className="icon-[mdi--arrow-up] h-4 w-4"
											animate={canSend ? { y: [0, -1, 0] } : {}}
											transition={{ duration: 0.6, delay: 0.1 }}
										/>
									</motion.button>
								)}
							</AnimatePresence>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/** Small icon button for the toolbar row */
function ToolbarButton({
	icon,
	title,
	disabled,
	onClick,
}: {
	icon: string;
	title: string;
	disabled?: boolean;
	onClick?: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			title={title}
			disabled={disabled}
			onClick={onClick}
			className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-3)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-2)] disabled:pointer-events-none disabled:opacity-30"
		>
			<span className={`${icon} h-[18px] w-[18px]`} />
		</button>
	);
}

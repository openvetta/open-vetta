import { useAtom, useAtomValue } from "jotai";
import { useRef } from "react";
import { inputValueAtom, isStreamingAtom, activeSessionAtom } from "../../store/atoms";

interface InputBarProps {
	onSend: () => Promise<void>;
	onAbort: () => Promise<void>;
}

export function InputBar({ onSend, onAbort }: InputBarProps): JSX.Element {
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const hasSession = Boolean(activeSession);
	const canSend = hasSession && !isStreaming && inputValue.trim().length > 0;

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (canSend) void onSend();
		}
	}

	function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>): void {
		setInputValue(e.target.value);
		const el = e.target;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	}

	return (
		<div className="px-5 pb-4 pt-2">
			<div className="mx-auto max-w-2xl">
				<div
					className="group flex items-end gap-2.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3.5 py-2.5 transition-colors focus-within:border-[var(--input-border-focus)] focus-within:bg-[var(--surface)]"
					style={{ opacity: hasSession ? 1 : 0.4 }}
				>
					<textarea
						ref={textareaRef}
						rows={1}
						value={inputValue}
						onChange={handleInput}
						onKeyDown={handleKeyDown}
						disabled={!hasSession || isStreaming}
						placeholder={
							hasSession
								? "Message Vetta... (Enter to send, Shift+Enter for newline)"
								: "Select or create a session to start"
						}
						className="flex-1 resize-none bg-transparent text-[13px] leading-[1.5] text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)] disabled:cursor-not-allowed"
						style={{ minHeight: "22px", maxHeight: "160px" }}
					/>
					{isStreaming ? (
						<button
							type="button"
							onClick={() => void onAbort()}
							className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-overlay)] text-[var(--text-2)] hover:bg-[var(--hover-strong)]"
							title="Stop"
						>
							<span className="icon-[mdi--stop] h-3 w-3" />
						</button>
					) : (
						<button
							type="button"
							onClick={() => void onSend()}
							disabled={!canSend}
							className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--accent-fg)] transition-all disabled:opacity-25"
							style={{ background: canSend ? "var(--accent)" : "var(--surface-raised)" }}
							title="Send"
						>
							<span className="icon-[mdi--arrow-up] h-3 w-3" />
						</button>
					)}
				</div>
				<p className="mt-1.5 text-center text-[10px] text-[var(--text-3)]">
					Vetta can make mistakes. Review important outputs.
				</p>
			</div>
		</div>
	);
}

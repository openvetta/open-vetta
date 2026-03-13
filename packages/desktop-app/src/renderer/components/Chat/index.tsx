import { useAtomValue } from "jotai";
import { activeSessionAtom, chatMessagesAtom, isStreamingAtom } from "../../store/atoms";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";

function projectName(cwd: string): string {
	return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

interface ChatViewProps {
	onSend: () => Promise<void>;
	onAbort: () => Promise<void>;
}

export function ChatView({ onSend, onAbort }: ChatViewProps): JSX.Element {
	const activeSession = useAtomValue(activeSessionAtom);
	const messages = useAtomValue(chatMessagesAtom);
	const isStreaming = useAtomValue(isStreamingAtom);

	return (
		<div className="flex h-full flex-1 flex-col bg-[var(--content-bg)]">
			{/* Top bar */}
			<div className="drag-region flex items-center justify-between border-b border-[var(--border)] px-5 pb-3 pt-[52px]">
				<div className="no-drag flex min-w-0 items-center gap-2.5">
					<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-raised)]">
						<span className="icon-[mdi--chat-outline] h-3.5 w-3.5 text-[var(--text-2)]" />
					</div>
					<div className="min-w-0">
						<div className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
							{activeSession ? projectName(activeSession.cwd) : "Session"}
						</div>
						{activeSession?.sessionPath && (
							<div
								className="truncate text-[11px] text-[var(--text-3)]"
								title={activeSession.sessionPath}
							>
								{activeSession.sessionPath.split("/").pop()}
							</div>
						)}
					</div>
				</div>

				{isStreaming && (
					<div className="no-drag flex items-center gap-1.5 text-[11px] text-[var(--text-2)]">
						<span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[var(--accent)]" />
						Thinking...
					</div>
				)}
			</div>

			{/* Messages */}
			{messages.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface)]">
						<span className="icon-[mdi--chat-outline] h-5 w-5 text-[var(--text-3)]" />
					</div>
					<p className="text-[13px] text-[var(--text-3)]">
						No messages yet. Say something!
					</p>
				</div>
			) : (
				<MessageList messages={messages} isStreaming={isStreaming} />
			)}

			{/* Input */}
			<InputBar onSend={onSend} onAbort={onAbort} />
		</div>
	);
}

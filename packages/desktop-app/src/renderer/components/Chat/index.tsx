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
		<div className="relative flex h-full flex-1 flex-col bg-[var(--content-bg)]">
			{/* Top bar — frosted glass, floats over content */}
			<div
				className="drag-region absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-[var(--border)] px-5"
				style={{
					paddingTop: 38,
					paddingBottom: 10,
					backdropFilter: "blur(20px) saturate(180%)",
					WebkitBackdropFilter: "blur(20px) saturate(180%)",
					background: "var(--header-glass)",
				}}
			>
				<div className="no-drag flex min-w-0 items-center gap-2.5">
					<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--surface-raised)]">
						<span className="icon-[mdi--chat-outline] h-3 w-3 text-[var(--text-2)]" />
					</div>
					<div className="min-w-0">
						<div className="truncate text-[12px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
							{activeSession ? projectName(activeSession.cwd) : "Session"}
						</div>
						{activeSession?.sessionPath && (
							<div
								className="truncate text-[10px] text-[var(--text-3)]"
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

			{/* Messages — top padding accounts for the floating header */}
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

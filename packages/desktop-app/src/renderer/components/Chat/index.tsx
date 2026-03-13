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
				className="drag-region absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-[var(--border)] px-4"
				style={{
					paddingTop: 30,
					paddingBottom: 8,
					backdropFilter: "blur(20px) saturate(180%)",
					WebkitBackdropFilter: "blur(20px) saturate(180%)",
					background: "var(--header-glass)",
				}}
			>
				<div className="no-drag flex min-w-0 items-center gap-2">
					<div className="truncate text-[12px] font-medium text-[var(--text-2)]">
						{activeSession ? projectName(activeSession.cwd) : "Session"}
					</div>
				</div>

				{isStreaming && (
					<div className="no-drag flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
						<span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[var(--text-3)]" />
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

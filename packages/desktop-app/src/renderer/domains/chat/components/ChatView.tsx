import { useAtomValue, useAtom } from "jotai";
import { activeSessionAtom, chatMessagesAtom, isStreamingAtom, activityPanelOpenAtom } from "@shared/store/atoms";
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
	const [panelOpen, setPanelOpen] = useAtom(activityPanelOpenAtom);

	return (
		<div className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--content-bg)]">
			{/* Top bar — gradient fade from solid to transparent */}
			<div
				className="drag-region pointer-events-none absolute inset-x-0 top-0 z-10"
				style={{
					background: "linear-gradient(to bottom, var(--content-bg) 40%, transparent 100%)",
					paddingTop: 20,
					paddingBottom: 20,
					paddingLeft: 16,
					paddingRight: 16,
				}}
			>
				<div className="pointer-events-auto no-drag flex items-center justify-between">
					<div className="truncate text-[14px] font-semibold text-[var(--text-1)]">
						{activeSession ? projectName(activeSession.cwd) : "Session"}
					</div>

					<div className="flex items-center gap-2">
						{isStreaming && (
							<div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
								<span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[var(--text-3)]" />
								Thinking...
							</div>
						)}
						<button
							type="button"
							title={panelOpen ? "关闭活动面板" : "打开活动面板"}
							onClick={() => setPanelOpen((o) => !o)}
							className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
								panelOpen
									? "bg-[var(--hover-strong)] text-[var(--text-1)]"
									: "text-[var(--text-3)] hover:bg-[var(--hover-strong)] hover:text-[var(--text-2)]"
							}`}
						>
							<span className="icon-[mdi--dock-right] text-[14px]" />
						</button>
					</div>
				</div>
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

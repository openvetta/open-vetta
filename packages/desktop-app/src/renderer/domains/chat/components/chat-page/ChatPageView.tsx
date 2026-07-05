import { ChatView } from "../ChatView";
import { SessionDropZone } from "../SessionDropZone";
import type { ChatPageViewProps } from "./types";

export function ChatPageView({
	model,
	onAbort,
	onSend,
	onSendQueued,
}: ChatPageViewProps): JSX.Element | null {
	if (!model.hasActiveSession) return null;

	return (
		<SessionDropZone className="relative flex h-full min-w-0 flex-1 flex-col">
			<ChatView onSend={onSend} onAbort={onAbort} onSendQueued={onSendQueued} />
		</SessionDropZone>
	);
}

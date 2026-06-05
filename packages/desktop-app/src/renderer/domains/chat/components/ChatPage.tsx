import { useAtomValue } from "jotai";
import { activeSessionAtom } from "@shared/store/atoms";
import { useSessionManager } from "../hooks/useSessionManager";
import { ChatView } from "./ChatView";
import { SessionDropZone } from "./SessionDropZone";

export function ChatPage(): JSX.Element | null {
	const activeSession = useAtomValue(activeSessionAtom);
	const { sendMessage, abortMessage } = useSessionManager();
	// 没有 activeSession 时 RootLayout 的路由守卫会跳到 /new-session/<default>。
	// 这里返回 null 让本次渲染留白，避免和 Welcome 时代的旧 fallback 同时出现。
	if (!activeSession) return null;

	return (
		<SessionDropZone className="relative flex h-full min-w-0 flex-1 flex-col">
			<ChatView onSend={sendMessage} onAbort={abortMessage} />
		</SessionDropZone>
	);
}

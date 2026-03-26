import { useAtomValue } from "jotai";
import { activeSessionAtom } from "@shared/store/atoms";
import { WelcomeScreen } from "@shared/components/WelcomeScreen";
import { useSessionManager } from "../hooks/useSessionManager";
import { ChatView } from "./ChatView";

export function ChatPage(): JSX.Element {
	const activeSession = useAtomValue(activeSessionAtom);
	const { sendMessage, abortMessage } = useSessionManager();

	if (!activeSession) {
		return <WelcomeScreen />;
	}

	return <ChatView onSend={sendMessage} onAbort={abortMessage} />;
}

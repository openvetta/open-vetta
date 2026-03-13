import { useEffect, useRef, useCallback } from "react";
import { useSetAtom, useAtom } from "jotai";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/Chat";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { useProjects } from "./hooks/useProjects";
import { useTheme } from "./hooks/useTheme";
import {
	activeSessionAtom,
	chatMessagesAtom,
	isStreamingAtom,
	inputValueAtom,
	type ChatMessage,
} from "./store/atoms";

// Extracts plain text from a Message (string content or content-part array)
function extractText(message: { content: unknown }): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return (message.content as Array<{ type: string; text?: string }>)
		.filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text)
		.join("");
}

// Module-level ref to survive React StrictMode double-invoke
let currentUnsubscribe: (() => void) | null = null;

export function App(): JSX.Element {
	const { refreshProjects, loadSessions } = useProjects();
	const [activeSession, setActiveSession] = useAtom(activeSessionAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);
	const setIsStreaming = useSetAtom(isStreamingAtom);
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	// Ref mirrors activeSession for use in stable callbacks without stale-closure issues
	const activeSessionRef = useRef<{ cwd: string; sessionPath: string; runtimeId: string } | null>(null);
	// Initialize theme system
	useTheme();

	useEffect(() => {
		void refreshProjects().catch(console.error);
		return () => {
			currentUnsubscribe?.();
			currentUnsubscribe = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const openSession = useCallback(
		async (cwd: string, sessionPath?: string) => {
			// Tear down previous subscription
			currentUnsubscribe?.();
			currentUnsubscribe = null;

			const { sessionId } = await window.vetta.session.create({ cwd, sessionPath });

			// Load history
			const history = await window.vetta.session.getMessages(sessionId);
			const mapped: ChatMessage[] = (history as Array<{ role: string; content: unknown }>)
				.filter((m) => m.role === "user" || m.role === "assistant")
				.map((m, i) => ({
					id: `${m.role}-${i}-${sessionId}`,
					role: m.role as "user" | "assistant",
					text: extractText(m),
				}));
			setChatMessages(mapped);

			const sessionInfo = { cwd, sessionPath: sessionPath ?? "", runtimeId: sessionId };
			setActiveSession(sessionInfo);
			activeSessionRef.current = sessionInfo;

			// Subscribe to live events
			currentUnsubscribe = await window.vetta.session.subscribe(sessionId, (event) => {
				if (event.type === "session.lifecycle") {
					if (event.phase === "agent_start") setIsStreaming(true);
					if (event.phase === "agent_end" || event.phase === "aborted") setIsStreaming(false);
				}
				if (event.type === "message.delta") {
					setChatMessages((prev) => {
						const copy = [...prev];
						const last = copy.at(-1);
						if (!last || last.role !== "assistant" || !last.id.startsWith("draft-")) {
							copy.push({ id: `draft-${Date.now()}`, role: "assistant", text: event.delta });
						} else {
							copy[copy.length - 1] = { ...last, text: last.text + event.delta };
						}
						return copy;
					});
				}
				if (event.type === "message.final" && event.message.role === "assistant") {
					const text = extractText(event.message as { content: unknown });
					setChatMessages((prev) => {
						const copy = [...prev];
						const last = copy.at(-1);
						if (last?.role === "assistant") {
							copy[copy.length - 1] = { ...last, id: `final-${Date.now()}`, text };
						} else {
							copy.push({ id: `final-${Date.now()}`, role: "assistant", text });
						}
						return copy;
					});
				}
			});

			// Refresh sessions so the sidebar stays up to date
			await loadSessions(cwd);
		},
		[setChatMessages, setActiveSession, setIsStreaming, loadSessions],
	);

	const sendMessage = useCallback(async () => {
		const session = activeSessionRef.current;
		if (!session?.runtimeId || !inputValue.trim()) return;
		const text = inputValue.trim();
		setInputValue("");
		setChatMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", text }]);
		await window.vetta.session.prompt(session.runtimeId, { text });
		await loadSessions(session.cwd);
	}, [inputValue, setInputValue, setChatMessages, loadSessions]);

	const abortMessage = useCallback(async () => {
		const session = activeSessionRef.current;
		if (!session?.runtimeId) return;
		await window.vetta.session.abort(session.runtimeId);
	}, []);

	return (
		<div className="flex h-screen w-screen overflow-hidden p-1.5 pl-0">
			<Sidebar onOpenSession={openSession} />
			<main
				className="flex min-w-0 flex-1 overflow-hidden rounded-lg bg-[var(--content-bg)]"
				style={{
					border: "var(--panel-border)",
					boxShadow: "var(--panel-shadow)",
				}}
			>
				{activeSession ? (
					<ChatView onSend={sendMessage} onAbort={abortMessage} />
				) : (
					<WelcomeScreen />
				)}
			</main>
		</div>
	);
}

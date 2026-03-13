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
	type ContentBlock,
	type ToolCallBlock,
} from "./store/atoms";

// ─── Helpers to convert pi-ai Messages to ChatMessage ───

function extractText(message: { content: unknown }): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return (message.content as Array<{ type: string; text?: string; thinking?: string }>)
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text!)
		.join("");
}

function messageToBlocks(message: { role: string; content: unknown }): ContentBlock[] {
	if (typeof message.content === "string") {
		return [{ type: "text", text: message.content }];
	}
	if (!Array.isArray(message.content)) return [];
	const blocks: ContentBlock[] = [];
	for (const part of message.content as Array<Record<string, unknown>>) {
		if (part.type === "text" && typeof part.text === "string") {
			blocks.push({ type: "text", text: part.text });
		} else if (part.type === "thinking" && typeof part.thinking === "string") {
			blocks.push({ type: "thinking", text: part.thinking });
		} else if (part.type === "toolCall" && typeof part.name === "string") {
			blocks.push({
				type: "tool_call",
				toolCallId: String(part.id ?? ""),
				toolName: String(part.name),
				args: (part.arguments as Record<string, unknown>) ?? {},
				status: "success", // history messages are already complete
			});
		}
	}
	return blocks;
}

/**
 * Convert history messages (user, assistant, toolResult) into ChatMessages.
 * Tool results are merged into their corresponding tool_call blocks.
 */
function historyToChat(history: Array<{ role: string; content: unknown; toolCallId?: string; toolName?: string; isError?: boolean }>): ChatMessage[] {
	const messages: ChatMessage[] = [];
	// Index tool_call blocks by toolCallId for merging tool results
	const toolCallIndex = new Map<string, ToolCallBlock>();

	for (const m of history) {
		if (m.role === "user") {
			messages.push({
				id: `hist-user-${messages.length}`,
				role: "user",
				text: extractText(m),
			});
		} else if (m.role === "assistant") {
			const blocks = messageToBlocks(m);
			// Register tool_call blocks for result merging
			for (const b of blocks) {
				if (b.type === "tool_call") {
					toolCallIndex.set(b.toolCallId, b);
				}
			}
			messages.push({
				id: `hist-asst-${messages.length}`,
				role: "assistant",
				text: extractText(m),
				blocks,
			});
		} else if (m.role === "toolResult") {
			// Merge into corresponding tool_call block
			const callId = m.toolCallId;
			if (callId) {
				const toolBlock = toolCallIndex.get(String(callId));
				if (toolBlock) {
					const resultText = extractText(m);
					toolBlock.result = resultText;
					toolBlock.isError = m.isError === true;
					toolBlock.status = m.isError ? "error" : "success";
				}
			}
		}
	}
	return messages;
}

// Module-level ref to survive React StrictMode double-invoke
let currentUnsubscribe: (() => void) | null = null;

export function App(): JSX.Element {
	const { refreshProjects, loadSessions } = useProjects();
	const [activeSession, setActiveSession] = useAtom(activeSessionAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);
	const setIsStreaming = useSetAtom(isStreamingAtom);
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const activeSessionRef = useRef<{ cwd: string; sessionPath: string; runtimeId: string } | null>(null);
	useTheme();

	useEffect(() => {
		void refreshProjects().catch(console.error);
		return () => {
			currentUnsubscribe?.();
			currentUnsubscribe = null;
		};
	}, []);

	const openSession = useCallback(
		async (cwd: string, sessionPath?: string) => {
			currentUnsubscribe?.();
			currentUnsubscribe = null;

			const { sessionId } = await window.vetta.session.create({ cwd, sessionPath });

			// Load history and convert to rich chat messages
			const history = await window.vetta.session.getMessages(sessionId);
			const mapped = historyToChat(
				history as Array<{ role: string; content: unknown; toolCallId?: string; toolName?: string; isError?: boolean }>,
			);
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

				// Streaming text delta — append to current assistant draft
				if (event.type === "message.delta") {
					setChatMessages((prev) => {
						const copy = [...prev];
						const last = copy.at(-1);
						if (!last || last.role !== "assistant" || !last.id.startsWith("draft-")) {
							// Start a new draft assistant message
							copy.push({
								id: `draft-${Date.now()}`,
								role: "assistant",
								text: event.delta,
								blocks: [{ type: "text", text: event.delta }],
							});
						} else {
							// Append to existing draft
							const newText = last.text + event.delta;
							const blocks = [...(last.blocks ?? [])];
							const lastBlock = blocks.at(-1);
							if (lastBlock?.type === "text") {
								blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + event.delta };
							} else {
								blocks.push({ type: "text", text: event.delta });
							}
							copy[copy.length - 1] = { ...last, text: newText, blocks };
						}
						return copy;
					});
				}

				// Final assistant message — replace draft with full content blocks
				if (event.type === "message.final" && event.message.role === "assistant") {
					const msg = event.message as { role: string; content: unknown };
					const blocks = messageToBlocks(msg);
					const text = extractText(msg);

					setChatMessages((prev) => {
						const copy = [...prev];
						const last = copy.at(-1);
						if (last?.role === "assistant") {
							copy[copy.length - 1] = { ...last, id: `final-${Date.now()}`, text, blocks };
						} else {
							copy.push({ id: `final-${Date.now()}`, role: "assistant", text, blocks });
						}
						return copy;
					});
				}

				// Tool start — add a pending tool_call block to the current assistant message
				if (event.type === "tool.start") {
					setChatMessages((prev) => {
						const copy = [...prev];
						const last = copy.at(-1);
						if (last?.role === "assistant") {
							const blocks: ContentBlock[] = [...(last.blocks ?? [])];
							blocks.push({
								type: "tool_call",
								toolCallId: event.toolCallId,
								toolName: event.toolName,
								args: (event.args as Record<string, unknown>) ?? {},
								status: "pending",
							});
							copy[copy.length - 1] = { ...last, blocks };
						}
						return copy;
					});
				}

				// Tool end — update the matching tool_call block with result
				if (event.type === "tool.end") {
					setChatMessages((prev) => {
						const copy = [...prev];
						const last = copy.at(-1);
						if (last?.role === "assistant" && last.blocks) {
							const blocks = last.blocks.map((b) => {
								if (b.type === "tool_call" && b.toolCallId === event.toolCallId) {
									const result = event.result;
									let resultText = "";
									let isError = false;

									if (result && typeof result === "object" && "content" in result) {
										const r = result as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
										resultText = (r.content ?? [])
											.filter((c) => c.type === "text" && c.text)
											.map((c) => c.text)
											.join("\n");
										isError = r.isError === true;
									} else if (typeof result === "string") {
										resultText = result;
									}

									return {
										...b,
										status: (isError ? "error" : "success") as "error" | "success",
										result: resultText,
										isError,
									};
								}
								return b;
							});
							copy[copy.length - 1] = { ...last, blocks };
						}
						return copy;
					});
				}
			});

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

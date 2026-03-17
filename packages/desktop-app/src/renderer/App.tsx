import { useEffect, useRef, useCallback } from "react";
import { useSetAtom, useAtom } from "jotai";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/Chat";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ActivityPanel } from "./components/ActivityPanel";
import { AutomationPage } from "./components/AutomationPage";
import { SkillsPage } from "./components/SkillsPage";
import { SettingsPage } from "./components/SettingsPage";
import { ConfirmDialog } from "./components/ui/confirm-dialog";
import { useProjects } from "./hooks/useProjects";
import { useTheme } from "./hooks/useTheme";
import { useGlobalShortcuts } from "./hooks/useShortcuts";
import {
	activeSessionAtom,
	chatMessagesAtom,
	isStreamingAtom,
	inputValueAtom,
	selectedFilePathAtom,
	pageViewAtom,
	settingsTabAtom,
	workspacePathAtom,
	selectedModelAtom,
	lastTurnUsageAtom,
	contextUsageAtom,
	type ChatMessage,
	type ContentBlock,
	type ToolCallBlock,
} from "./store/atoms";

// ═══════════════════════════════════════════════════════════════════════════════
// Message conversion helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract plain text from a message content (string or content-part array). */
function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Array<{ type: string; text?: string }>)
		.filter((p) => p.type === "text" && typeof p.text === "string")
		.map((p) => p.text!)
		.join("");
}

/** Extract text from an array of result content blocks. */
function extractResultText(result: unknown): string {
	if (typeof result === "string") return result;
	if (result && typeof result === "object" && "content" in result) {
		const r = result as { content?: Array<{ type: string; text?: string }> };
		return (r.content ?? [])
			.filter((c) => c.type === "text" && c.text)
			.map((c) => c.text!)
			.join("\n");
	}
	return "";
}

/**
 * Convert a stored assistant message's content array into ContentBlock[].
 * Used for history loading only — tool_call blocks get status "success"
 * because history messages are already complete.
 */
function messageToBlocks(content: unknown): ContentBlock[] {
	if (typeof content === "string") {
		return content ? [{ type: "text", text: content }] : [];
	}
	if (!Array.isArray(content)) return [];
	const blocks: ContentBlock[] = [];
	for (const part of content as Array<Record<string, unknown>>) {
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
				status: "success",
			});
		}
	}
	return blocks;
}

/**
 * Convert history messages (user, assistant, toolResult) into ChatMessages.
 * Tool results are merged into their corresponding tool_call blocks.
 */
function historyToChat(
	history: Array<{
		role: string;
		content: unknown;
		toolCallId?: string;
		toolName?: string;
		isError?: boolean;
	}>,
): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const toolCallIndex = new Map<string, ToolCallBlock>();

	for (const m of history) {
		if (m.role === "user") {
			messages.push({
				id: `hist-user-${messages.length}`,
				role: "user",
				text: extractText(m.content),
			});
		} else if (m.role === "assistant") {
			const blocks = messageToBlocks(m.content);
			for (const b of blocks) {
				if (b.type === "tool_call") toolCallIndex.set(b.toolCallId, b);
			}
			messages.push({
				id: `hist-asst-${messages.length}`,
				role: "assistant",
				text: extractText(m.content),
				blocks,
			});
		} else if (m.role === "toolResult" && m.toolCallId) {
			const block = toolCallIndex.get(String(m.toolCallId));
			if (block) {
				block.result = extractText(m.content);
				block.isError = m.isError === true;
				block.status = m.isError ? "error" : "success";
			}
		}
	}
	return messages;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Streaming state — module-level to survive React StrictMode double-invoke
// ═══════════════════════════════════════════════════════════════════════════════

let currentUnsubscribe: (() => void) | null = null;

/**
 * ID of the current "draft" assistant message being streamed.
 * - Set when the first delta (text or thinking) of a turn arrives.
 * - Cleared when message.final finalizes the message.
 */
let draftId: string | null = null;

/** Monotonically increasing counter for unique message IDs. */
let idCounter = 0;
function nextId(prefix: string): string {
	return `${prefix}-${++idCounter}-${Date.now()}`;
}

/** Timestamp (ms) when the current agent turn started. */
let turnStartTime = 0;

/** Per-session cache for turn stats (survives session switching). Key = sessionPath. */
const turnStatsCache = new Map<string, { outputSpeed: number; durationSeconds: number }>();

/** Reset streaming state (when switching sessions). */
function resetStreamState(): void {
	draftId = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Immutable state update helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ensure a draft assistant message exists for the current turn.
 * Returns [newMessages, draftIndex]. Creates a new draft if needed.
 */
function ensureDraft(prev: ChatMessage[]): [ChatMessage[], number] {
	if (draftId) {
		// Find existing draft
		for (let i = prev.length - 1; i >= 0; i--) {
			if (prev[i].id === draftId) {
				return [[...prev], i];
			}
		}
		// Draft ID is stale — fall through to create new
	}

	// Create new draft
	const id = nextId("draft");
	draftId = id;
	const draft: ChatMessage = { id, role: "assistant", text: "", blocks: [] };
	const copy = [...prev, draft];
	return [copy, copy.length - 1];
}

/**
 * Append a text delta to a draft message's last text block (or create one).
 */
function appendTextDelta(prev: ChatMessage[], delta: string): ChatMessage[] {
	const [msgs, idx] = ensureDraft(prev);
	const msg = msgs[idx];
	const blocks = [...(msg.blocks ?? [])];
	const last = blocks.at(-1);

	if (last?.type === "text") {
		blocks[blocks.length - 1] = { ...last, text: last.text + delta };
	} else {
		blocks.push({ type: "text", text: delta });
	}

	msgs[idx] = { ...msg, text: msg.text + delta, blocks };
	return msgs;
}

/**
 * Append a thinking delta to a draft message's last thinking block (or create one).
 */
function appendThinkingDelta(prev: ChatMessage[], delta: string): ChatMessage[] {
	const [msgs, idx] = ensureDraft(prev);
	const msg = msgs[idx];
	const blocks = [...(msg.blocks ?? [])];
	const last = blocks.at(-1);

	if (last?.type === "thinking") {
		blocks[blocks.length - 1] = { ...last, text: last.text + delta };
	} else {
		blocks.push({ type: "thinking", text: delta });
	}

	msgs[idx] = { ...msg, blocks };
	return msgs;
}

/**
 * Finalize the current draft with the complete message content.
 *
 * Strategy:
 * - Text and thinking blocks come from the final message (authoritative).
 * - Tool call blocks that already exist on the draft (created by earlier
 *   tool.start events during THIS turn) are preserved.
 * - Any tool calls in the final message that DON'T have a matching block
 *   yet get created with status "pending" (execution hasn't happened).
 */
function finalizeMessage(prev: ChatMessage[], content: unknown): ChatMessage[] {
	const copy = [...prev];
	const finalId = nextId("final");

	// Build text/thinking blocks from the final message
	const contentBlocks: ContentBlock[] = [];
	const finalToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

	if (typeof content === "string") {
		if (content) contentBlocks.push({ type: "text", text: content });
	} else if (Array.isArray(content)) {
		for (const part of content as Array<Record<string, unknown>>) {
			if (part.type === "text" && typeof part.text === "string") {
				contentBlocks.push({ type: "text", text: part.text });
			} else if (part.type === "thinking" && typeof part.thinking === "string") {
				contentBlocks.push({ type: "thinking", text: part.thinking });
			} else if (part.type === "toolCall" && typeof part.name === "string") {
				finalToolCalls.push({
					id: String(part.id ?? ""),
					name: String(part.name),
					args: (part.arguments as Record<string, unknown>) ?? {},
				});
			}
		}
	}

	// Find the draft (or last assistant message)
	let targetIdx = -1;
	if (draftId) {
		for (let i = copy.length - 1; i >= 0; i--) {
			if (copy[i].id === draftId) {
				targetIdx = i;
				break;
			}
		}
	}
	if (targetIdx === -1) {
		// No draft found — create a new message (don't overwrite history)
		const newMsg: ChatMessage = { id: finalId, role: "assistant", text: "", blocks: [] };
		copy.push(newMsg);
		targetIdx = copy.length - 1;
	}

	// Collect existing tool_call blocks from the target message
	const existingToolBlocks: ToolCallBlock[] = [];
	const existingToolIds = new Set<string>();
	if (targetIdx !== -1) {
		for (const b of copy[targetIdx].blocks ?? []) {
			if (b.type === "tool_call") {
				existingToolBlocks.push(b);
				existingToolIds.add(b.toolCallId);
			}
		}
	}

	// Merge or add tool calls from the final message
	for (const tc of finalToolCalls) {
		if (existingToolIds.has(tc.id)) {
			// Update args on existing block (may have been created by toolcall.start with empty args)
			const existing = existingToolBlocks.find((b) => b.toolCallId === tc.id);
			if (existing) {
				existing.args = tc.args;
			}
		} else {
			existingToolBlocks.push({
				type: "tool_call",
				toolCallId: tc.id,
				toolName: tc.name,
				args: tc.args,
				status: "pending",
			});
		}
	}

	// Assemble final blocks: text/thinking first, then tool calls
	const finalBlocks: ContentBlock[] = [...contentBlocks, ...existingToolBlocks];
	const text = extractText(content);

	if (targetIdx !== -1) {
		copy[targetIdx] = { ...copy[targetIdx], id: finalId, text, blocks: finalBlocks };
	} else {
		copy.push({ id: finalId, role: "assistant", text, blocks: finalBlocks });
	}

	// Clear draft — this turn's message is now finalized
	draftId = null;
	return copy;
}

/**
 * Handle tool.start: find or create a tool_call block on the last assistant message.
 */
function handleToolStart(
	prev: ChatMessage[],
	toolCallId: string,
	toolName: string,
	args: Record<string, unknown>,
): ChatMessage[] {
	// First: search for a finalized message from the current turn (not a draft)
	// or the current draft. We only want to attach to the LAST assistant message
	// that belongs to the current turn, not older history messages.
	const lastMsg = prev.length > 0 ? prev[prev.length - 1] : null;

	// If the last message is an assistant message, attach to it
	if (lastMsg?.role === "assistant") {
		const blocks = [...(lastMsg.blocks ?? [])];

		// Check if this tool_call block already exists (from toolcall.start or message.final)
		const existing = blocks.findIndex((b) => b.type === "tool_call" && b.toolCallId === toolCallId);
		if (existing !== -1) {
			// Update args if the existing block has empty args (created by toolcall.start)
			const block = blocks[existing] as ToolCallBlock;
			if (Object.keys(block.args).length === 0 && Object.keys(args).length > 0) {
				blocks[existing] = { ...block, args };
				const copy = [...prev];
				copy[copy.length - 1] = { ...lastMsg, blocks };
				return copy;
			}
			return prev;
		}

		blocks.push({
			type: "tool_call",
			toolCallId,
			toolName,
			args,
			status: "pending",
		});

		const copy = [...prev];
		copy[copy.length - 1] = { ...lastMsg, blocks };
		return copy;
	}

	// No recent assistant message — create one
	const copy = [...prev];
	copy.push({
		id: nextId("tool-fallback"),
		role: "assistant",
		text: "",
		blocks: [
			{
				type: "tool_call",
				toolCallId,
				toolName,
				args,
				status: "pending",
			},
		],
	});
	return copy;
}

/**
 * Handle tool.end: find the matching tool_call block and update it with the result.
 */
function handleToolEnd(
	prev: ChatMessage[],
	toolCallId: string,
	result: unknown,
	isError: boolean,
): ChatMessage[] {
	const resultText = extractResultText(result);

	// Search backwards for the matching tool_call block
	for (let i = prev.length - 1; i >= 0; i--) {
		const msg = prev[i];
		if (msg.role !== "assistant" || !msg.blocks) continue;

		const blockIdx = msg.blocks.findIndex((b) => b.type === "tool_call" && b.toolCallId === toolCallId);
		if (blockIdx === -1) continue;

		const copy = [...prev];
		const blocks = [...msg.blocks];
		const block = blocks[blockIdx] as ToolCallBlock;
		blocks[blockIdx] = {
			...block,
			status: isError ? "error" : "success",
			result: resultText,
			isError,
		};
		copy[i] = { ...msg, blocks };
		return copy;
	}

	return prev;
}

// ═══════════════════════════════════════════════════════════════════════════════
// App component
// ═══════════════════════════════════════════════════════════════════════════════

export function App(): JSX.Element {
	const { refreshProjects, loadSessions, openProject, projects } = useProjects();
	const [activeSession, setActiveSession] = useAtom(activeSessionAtom);
	const [pageView, setPageView] = useAtom(pageViewAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);
	const setIsStreaming = useSetAtom(isStreamingAtom);
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const setSelectedFilePath = useSetAtom(selectedFilePathAtom);
	const setWorkspacePath = useSetAtom(workspacePathAtom);
	const setSelectedModel = useSetAtom(selectedModelAtom);
	const setLastTurnUsage = useSetAtom(lastTurnUsageAtom);
	const setContextUsage = useSetAtom(contextUsageAtom);
	const setSettingsTab = useSetAtom(settingsTabAtom);
	const activeSessionRef = useRef<{ cwd: string; sessionPath: string; runtimeId: string } | null>(null);
	const openSessionRef = useRef<(cwd: string, sessionPath?: string) => Promise<void>>();
	useTheme();

	// ─── Global keyboard shortcuts ───
	const projectsRef = useRef(projects);
	projectsRef.current = projects;

	useGlobalShortcuts(
		useCallback(
			(actionId: string) => {
				switch (actionId) {
					case "new-session": {
						// Create a new session in the first project (if any)
						const firstProject = projectsRef.current[0];
						if (firstProject) {
							void openSessionRef.current?.(firstProject.cwd);
						}
						break;
					}
					case "open-project": {
						void openProject();
						break;
					}
					case "open-settings": {
						setPageView("settings");
						setSettingsTab("general");
						break;
					}
				}
			},
			[openProject, setPageView, setSettingsTab],
		),
	);

	useEffect(() => {
		// Sync workspace path from config file
		void window.vetta.config.get().then((config) => {
			if (config.workspacePath) {
				setWorkspacePath(config.workspacePath);
				localStorage.setItem("vetta-workspace-path", config.workspacePath);
			}
		});
		// Load default model if no model selected
		void window.vetta.models.get().then((modelsConfig) => {
			const saved = localStorage.getItem("vetta-selected-model");
			if (!saved && modelsConfig.defaultModel) {
				setSelectedModel(modelsConfig.defaultModel);
				localStorage.setItem("vetta-selected-model", modelsConfig.defaultModel);
			}
		});
		void refreshProjects().catch(console.error);
		return () => {
			currentUnsubscribe?.();
			currentUnsubscribe = null;
		};
	}, []);

	const openSession = useCallback(
		async (cwd: string, sessionPath?: string) => {
			// Teardown previous session
			currentUnsubscribe?.();
			currentUnsubscribe = null;
			resetStreamState();
			setIsStreaming(false);
			setSelectedFilePath(null);

			setPageView("chat");
			const { sessionId } = await window.vetta.session.create({ cwd, sessionPath });

			// Load history
			const history = await window.vetta.session.getMessages(sessionId);
			const mapped = historyToChat(
				history as Array<{
					role: string;
					content: unknown;
					toolCallId?: string;
					toolName?: string;
					isError?: boolean;
				}>,
			);
			setChatMessages(mapped);

			// Restore per-session state: context usage from backend, turn stats from cache
			const state = await window.vetta.session.getState(sessionId);
			setContextUsage({
				percent: state.contextPercent,
				contextWindow: state.contextWindow,
			});
			const cachedKey = sessionPath ?? "";
			setLastTurnUsage(turnStatsCache.get(cachedKey) ?? null);

			const sessionInfo = { cwd, sessionPath: cachedKey, runtimeId: sessionId };
			setActiveSession(sessionInfo);
			activeSessionRef.current = sessionInfo;

			// ─── Subscribe to live session events ───
			currentUnsubscribe = await window.vetta.session.subscribe(sessionId, (event) => {
				// ── Lifecycle ──
				if (event.type === "session.lifecycle") {
					if (event.phase === "agent_start") {
						resetStreamState();
						turnStartTime = Date.now();
						setIsStreaming(true);
					}
					if (event.phase === "agent_end" || event.phase === "aborted") {
						resetStreamState();
						setIsStreaming(false);
					}
					return;
				}

				// ── Thinking delta (streaming thinking text) ──
				if (event.type === "thinking.delta") {
					setChatMessages((prev) => appendThinkingDelta(prev, event.delta));
					return;
				}

				// ── Text delta (streaming assistant text) ──
				if (event.type === "message.delta") {
					setChatMessages((prev) => appendTextDelta(prev, event.delta));
					return;
				}

				// ── Tool call generating (model started generating a tool call) ──
				if (event.type === "toolcall.start") {
					setChatMessages((prev) =>
						handleToolStart(prev, event.toolCallId, event.toolName, {}),
					);
					return;
				}

				// ── Message final (full assistant message — text, thinking, tool calls) ──
				if (event.type === "message.final" && event.message.role === "assistant") {
					setChatMessages((prev) => finalizeMessage(prev, event.message.content));
					return;
				}

				// ── Tool start ──
				if (event.type === "tool.start") {
					setChatMessages((prev) =>
						handleToolStart(prev, event.toolCallId, event.toolName, (event.args as Record<string, unknown>) ?? {}),
					);
					return;
				}

				// ── Tool end ──
				if (event.type === "tool.end") {
					setChatMessages((prev) => handleToolEnd(prev, event.toolCallId, event.result, event.isError));
					return;
				}

				// ── Usage update (emitted per assistant message) ──
				if (event.type === "usage.update") {
					const elapsed = turnStartTime ? (Date.now() - turnStartTime) / 1000 : 0;
					const outputSpeed = elapsed > 0 ? event.output / elapsed : 0;
					const turnStats = { outputSpeed, durationSeconds: elapsed };
					setLastTurnUsage(turnStats);
					// Cache turn stats for session restore
					const sp = activeSessionRef.current?.sessionPath;
					if (sp != null) turnStatsCache.set(sp, turnStats);
					setContextUsage({
						percent: event.contextPercent ?? null,
						contextWindow: event.contextWindow ?? 0,
					});
					return;
				}
			});

			await loadSessions(cwd);
		},
		[setChatMessages, setActiveSession, setIsStreaming, setSelectedFilePath, setPageView, loadSessions, setLastTurnUsage, setContextUsage],
	);

	// Keep ref in sync so shortcut handler can call openSession
	openSessionRef.current = openSession;

	const sendMessage = useCallback(async () => {
		const session = activeSessionRef.current;
		if (!session?.runtimeId || !inputValue.trim()) return;
		const text = inputValue.trim();
		setInputValue("");
		setChatMessages((prev) => [...prev, { id: nextId("user"), role: "user", text }]);
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
				className="flex min-w-[320px] flex-1 overflow-hidden rounded-lg bg-[var(--content-bg)]"
				style={{
					border: "var(--panel-border)",
					boxShadow: "var(--panel-shadow)",
				}}
			>
				{pageView === "settings" ? (
					<SettingsPage />
				) : pageView === "automation" ? (
					<AutomationPage />
				) : pageView === "skills" ? (
					<SkillsPage />
				) : activeSession ? (
					<ChatView onSend={sendMessage} onAbort={abortMessage} />
				) : (
					<WelcomeScreen />
				)}
			</main>
			<ActivityPanel />
			<ConfirmDialog />
		</div>
	);
}

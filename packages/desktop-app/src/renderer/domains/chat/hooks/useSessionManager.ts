import { useProjects } from "@domains/project/hooks/useProjects";
import {
	activeSessionAtom,
	attachedImagesAtom,
	type ChatMessage,
	chatMessagesAtom,
	contextUsageAtom,
	inputValueAtom,
	isStreamingAtom,
	lastTurnUsageAtom,
	mentionedFilesAtom,
	modelSupportsImagesAtom,
	openSessionFnRef,
	selectedFilePathAtom,
	selectedSkillAtom,
} from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import {
	appendTextDelta,
	appendThinkingDelta,
	currentUnsubscribe,
	finalizeMessage,
	handleToolEnd,
	handleToolStart,
	historyToChat,
	nextId,
	resetStreamState,
	setCurrentUnsubscribe,
	setTurnStartTime,
	turnStartTime,
	turnStatsCache,
} from "../services/chat-service";

interface SessionManagerResult {
	openSession: (cwd: string, sessionPath?: string) => Promise<void>;
	sendMessage: () => Promise<void>;
	abortMessage: () => Promise<void>;
	openSessionRef: React.MutableRefObject<((cwd: string, sessionPath?: string) => Promise<void>) | undefined>;
}

export function useSessionManager(): SessionManagerResult {
	const [activeSession, setActiveSession] = useAtom(activeSessionAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);
	const setIsStreaming = useSetAtom(isStreamingAtom);
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const [attachedImages, setAttachedImages] = useAtom(attachedImagesAtom);
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
	const [mentionedFiles, setMentionedFiles] = useAtom(mentionedFilesAtom);
	const setSelectedFilePath = useSetAtom(selectedFilePathAtom);
	const navigate = useNavigate();
	const setLastTurnUsage = useSetAtom(lastTurnUsageAtom);
	const setContextUsage = useSetAtom(contextUsageAtom);
	const setModelSupportsImages = useSetAtom(modelSupportsImagesAtom);
	const { loadSessions } = useProjects();
	const activeSessionRef = useRef<{ cwd: string; sessionPath: string; runtimeId: string } | null>(null);
	const openSessionRef = useRef<(cwd: string, sessionPath?: string) => Promise<void>>();

	const openSession = useCallback(
		async (cwd: string, sessionPath?: string) => {
			// Teardown previous session
			currentUnsubscribe?.();
			setCurrentUnsubscribe(null);
			resetStreamState();
			setIsStreaming(false);
			setSelectedFilePath(null);

			void navigate({ to: "/" });
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
			setModelSupportsImages(state.model?.input?.includes("image") ?? false);
			const cachedKey = sessionPath ?? "";
			setLastTurnUsage(turnStatsCache.get(cachedKey) ?? null);

			const sessionInfo = { cwd, sessionPath: cachedKey, runtimeId: sessionId };
			setActiveSession(sessionInfo);
			activeSessionRef.current = sessionInfo;

			// ─── Subscribe to live session events ───
			setCurrentUnsubscribe(
				await window.vetta.session.subscribe(sessionId, (event) => {
					// ── Lifecycle ──
					if (event.type === "session.lifecycle") {
						if (event.phase === "agent_start") {
							resetStreamState();
							setTurnStartTime(Date.now());
							setIsStreaming(true);
						}
						if (event.phase === "agent_end" || event.phase === "aborted") {
							// Always reset streaming state first to unblock the UI
							const elapsed = turnStartTime ? (Date.now() - turnStartTime) / 1000 : 0;
							resetStreamState();
							setIsStreaming(false);
							// Write total duration onto the last assistant message
							if (elapsed > 0) {
								setChatMessages((prev) => {
									for (let i = prev.length - 1; i >= 0; i--) {
										if (prev[i].role === "assistant") {
											const copy = [...prev];
											copy[i] = { ...copy[i], durationSeconds: elapsed };
											return copy;
										}
									}
									return prev;
								});
							}
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
						setChatMessages((prev) => handleToolStart(prev, event.toolCallId, event.toolName, {}));
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
							handleToolStart(
								prev,
								event.toolCallId,
								event.toolName,
								(event.args as Record<string, unknown>) ?? {},
							),
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
				}),
			);

			await loadSessions(cwd);
		},
		[
			setChatMessages,
			setActiveSession,
			setIsStreaming,
			setSelectedFilePath,
			navigate,
			loadSessions,
			setLastTurnUsage,
			setContextUsage,
			setModelSupportsImages,
		],
	);

	// Keep ref in sync so shortcut handler can call openSession
	openSessionRef.current = openSession;

	// Expose openSession globally via ref for other pages (e.g. AutomationPage)
	openSessionFnRef.current = openSession;

	const sendMessage = useCallback(async () => {
		const session = activeSession;
		if (!session?.runtimeId || (!inputValue.trim() && attachedImages.length === 0)) return;
		const rawText = inputValue.trim();
		const images = attachedImages.length > 0 ? attachedImages : undefined;
		// Build prefix lines
		const skillPrefix = selectedSkill ? `/skills:${selectedSkill.name}\n` : "";
		const filesPrefix = mentionedFiles.length > 0 ? `${mentionedFiles.map((f) => `@${f.path}`).join("\n")}\n` : "";
		const text = `${skillPrefix}${filesPrefix}${rawText}`;
		setInputValue("");
		setAttachedImages([]);
		setSelectedSkill(null);
		setMentionedFiles([]);
		const userMsg: ChatMessage = { id: nextId("user"), role: "user", text, timestamp: Date.now() };
		if (images) {
			userMsg.images = images.map((img) => ({ data: img.data, mimeType: img.mimeType, name: img.name }));
		}
		setChatMessages((prev) => [...prev, userMsg]);
		const promptReq: { text: string; images?: Array<{ type: "image"; data: string; mimeType: string }> } = {
			text: text || "(see attached images)",
		};
		if (images) {
			promptReq.images = images.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
		}
		await window.vetta.session.prompt(session.runtimeId, promptReq);
		await loadSessions(session.cwd);
	}, [
		activeSession,
		inputValue,
		attachedImages,
		selectedSkill,
		mentionedFiles,
		setInputValue,
		setAttachedImages,
		setSelectedSkill,
		setMentionedFiles,
		setChatMessages,
		loadSessions,
	]);

	const abortMessage = useCallback(async () => {
		if (!activeSession?.runtimeId) return;
		await window.vetta.session.abort(activeSession.runtimeId);
	}, [activeSession]);

	return { openSession, sendMessage, abortMessage, openSessionRef };
}

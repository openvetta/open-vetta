import { useProjects } from "@domains/project/hooks/useProjects";
import {
	activeSessionAtom,
	attachedImagesAtom,
	type ChatMessage,
	chatMessagesAtom,
	contextUsageAtom,
	inputValueAtom,
	isCompactingAtom,
	isStreamingAtom,
	lastTurnUsageAtom,
	mentionedFilesAtom,
	modelSupportsImagesAtom,
	openSessionFnRef,
	type SessionExecutionMode,
	selectedModelAtom,
	selectedSkillAtom,
	sessionExecutionModeAtom,
	type TodoItem,
	todoItemsByCwdAtom,
	turnModifiedFilesAtom,
} from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
	adoptDraftId,
	appendError,
	appendTextDelta,
	appendThinkingDelta,
	currentUnsubscribe,
	extractModifiedFiles,
	finalizeMessage,
	fullHistoryToChat,
	handleToolEnd,
	handleToolStart,
	nextId,
	resetStreamState,
	setCurrentUnsubscribe,
	setTurnStartTime,
	turnStartTime,
	turnStatsCache,
} from "../services/chat-service";

interface SessionManagerResult {
	openSession: (cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>;
	sendMessage: () => Promise<void>;
	abortMessage: () => Promise<void>;
	openSessionRef: React.MutableRefObject<
		((cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>) | undefined
	>;
}

export function useSessionManager(): SessionManagerResult {
	const [activeSession, setActiveSession] = useAtom(activeSessionAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);
	const setIsStreaming = useSetAtom(isStreamingAtom);
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const [attachedImages, setAttachedImages] = useAtom(attachedImagesAtom);
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
	const [mentionedFiles, setMentionedFiles] = useAtom(mentionedFilesAtom);
	const navigate = useNavigate();
	const setLastTurnUsage = useSetAtom(lastTurnUsageAtom);
	const setContextUsage = useSetAtom(contextUsageAtom);
	const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
	const setModelSupportsImages = useSetAtom(modelSupportsImagesAtom);
	const setSessionExecutionMode = useSetAtom(sessionExecutionModeAtom);
	const setTodoItems = useSetAtom(todoItemsByCwdAtom);
	const setTurnModifiedFiles = useSetAtom(turnModifiedFilesAtom);
	const setIsCompacting = useSetAtom(isCompactingAtom);
	const { loadSessions, applyLocalRename, ensureLocalSession, projects } = useProjects();
	const projectsRef = useRef(projects);
	projectsRef.current = projects;
	const activeSessionRef = useRef<{ cwd: string; sessionPath: string; runtimeId: string } | null>(null);
	const openSessionRef =
		useRef<(cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>>();
	// Sessions for which auto-title has already been attempted (or skipped because
	// the session was opened with prior history / already had a name).
	const autoTitledSessionsRef = useRef<Set<string>>(new Set());

	// ── Delta batching: accumulate text/thinking deltas per rAF frame ──
	const pendingTextDeltaRef = useRef("");
	const pendingThinkingDeltaRef = useRef("");
	const deltaRafRef = useRef<number | null>(null);

	const flushDeltas = useCallback(() => {
		deltaRafRef.current = null;
		const textDelta = pendingTextDeltaRef.current;
		const thinkingDelta = pendingThinkingDeltaRef.current;
		pendingTextDeltaRef.current = "";
		pendingThinkingDeltaRef.current = "";

		if (textDelta || thinkingDelta) {
			setChatMessages((prev) => {
				let next = prev;
				if (thinkingDelta) next = appendThinkingDelta(next, thinkingDelta);
				if (textDelta) next = appendTextDelta(next, textDelta);
				return next;
			});
		}
	}, [setChatMessages]);

	const scheduleDeltaFlush = useCallback(() => {
		if (deltaRafRef.current === null) {
			deltaRafRef.current = requestAnimationFrame(flushDeltas);
		}
	}, [flushDeltas]);

	// Cleanup rAF on unmount
	useEffect(() => {
		return () => {
			if (deltaRafRef.current !== null) {
				cancelAnimationFrame(deltaRafRef.current);
			}
		};
	}, []);

	const openSession = useCallback(
		async (cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => {
			const __t0 = Date.now();
			const __perf = (label: string) => console.log(`[perf][openSession] ${label} +${Date.now() - __t0}ms`);
			__perf(`enter cwd=${cwd} sessionPath=${sessionPath ?? "-"}`);
			// Teardown previous session
			currentUnsubscribe?.();
			setCurrentUnsubscribe(null);
			resetStreamState();
			setIsStreaming(false);
			setIsCompacting(false);
			setTurnModifiedFiles([]);

			void navigate({ to: "/" });
			__perf("before session.create");
			const { sessionId } = await window.vetta.session.create({ cwd, sessionPath, executionMode });
			__perf("after session.create");

			// Load full history (includes compaction boundaries for complete UI display)
			const history = await window.vetta.session.getFullHistory(sessionId);
			__perf("after getFullHistory");
			const mapped = fullHistoryToChat(history);
			setChatMessages(mapped);
			setTurnModifiedFiles(extractModifiedFiles(mapped));

			// If this session already has any prior turn (loaded from disk) we never
			// want to auto-rename — only brand-new sessions on their first round.
			if (sessionPath && mapped.some((m) => m.role === "user")) {
				autoTitledSessionsRef.current.add(sessionPath);
			}

			// Restore per-session state: context usage from backend, turn stats from cache
			const state = await window.vetta.session.getState(sessionId);
			__perf("after getState");
			setContextUsage({
				percent: state.contextPercent,
				contextWindow: state.contextWindow,
			});
			setModelSupportsImages(state.model?.input?.includes("image") ?? false);
			setSessionExecutionMode(state.executionMode);

			// Sync model between frontend and backend:
			// - If frontend has a selected model, push it to the backend session
			// - Otherwise, pull the backend's resolved model to the frontend
			const backendModelKey = state.model ? `${state.model.provider}/${state.model.id}` : null;
			if (selectedModel && backendModelKey !== selectedModel) {
				void window.vetta.session.updateSettings(sessionId, { modelKey: selectedModel });
			} else if (!selectedModel && backendModelKey) {
				setSelectedModel(backendModelKey);
				localStorage.setItem("vetta-selected-model", backendModelKey);
			}

			// Resolve the on-disk session path so that downstream features (turn
			// stats cache, auto-title rename) can key off the actual file path even
			// for sessions that were just created by the runtime.
			const resolvedSessionPath = sessionPath ?? (await window.vetta.session.getSessionPath(sessionId)) ?? "";
			const cachedKey = resolvedSessionPath;
			setLastTurnUsage(turnStatsCache.get(cachedKey) ?? null);

			// If session is still streaming, adopt the last history assistant message as draft
			// so that incoming streaming events append to it instead of creating a duplicate.
			// IMPORTANT: only adopt an assistant message that appears AFTER the latest user
			// message. Otherwise the still-streaming turn (whose assistant content is not yet
			// persisted to disk) would be appended to the previous turn's assistant — which
			// sits BEFORE the new user message in history, causing the streaming bubble to
			// render above the user bubble.
			if (state.isStreaming) {
				const startedAt = state.currentTurnStartedAt ?? Date.now();
				let adoptedId: string | null = null;
				let lastUserIdx = -1;
				for (let i = mapped.length - 1; i >= 0; i--) {
					if (mapped[i].role === "user") {
						lastUserIdx = i;
						break;
					}
				}
				for (let i = mapped.length - 1; i > lastUserIdx; i--) {
					if (mapped[i].role === "assistant") {
						adoptDraftId(mapped[i].id);
						adoptedId = mapped[i].id;
						break;
					}
				}
				if (adoptedId) {
					setChatMessages((prev) =>
						prev.map((message) =>
							message.id === adoptedId
								? { ...message, startedAt, timestamp: message.timestamp ?? startedAt }
								: message,
						),
					);
				}
				setIsStreaming(true);
				setTurnStartTime(startedAt);
			}

			const sessionInfo = { cwd, sessionPath: cachedKey, runtimeId: sessionId };
			setActiveSession(sessionInfo);
			activeSessionRef.current = sessionInfo;

			__perf("before session.subscribe");
			// ─── Subscribe to live session events ───
			setCurrentUnsubscribe(
				await window.vetta.session.subscribe(sessionId, (event) => {
					// ── Lifecycle ──
					if (event.type === "session.lifecycle") {
						if (event.phase === "agent_start") {
							resetStreamState();
							setTurnStartTime(event.timestamp);
							setIsStreaming(true);
							setTurnModifiedFiles([]);
						}
						if (event.phase === "agent_end" || event.phase === "aborted") {
							// Flush any pending deltas before finalizing
							if (deltaRafRef.current !== null) {
								cancelAnimationFrame(deltaRafRef.current);
								deltaRafRef.current = null;
							}
							flushDeltas();
							// Always reset streaming state first to unblock the UI
							const endedAt = event.timestamp;
							const startedAt = turnStartTime;
							const elapsed = startedAt ? (endedAt - startedAt) / 1000 : 0;
							resetStreamState();
							setIsStreaming(false);
							setTurnStartTime(0);
							// Write total duration onto the last assistant message
							// and extract modified files from this turn
							setChatMessages((prev) => {
								setTurnModifiedFiles(extractModifiedFiles(prev));
								if (elapsed > 0) {
									for (let i = prev.length - 1; i >= 0; i--) {
										if (prev[i].role === "assistant") {
											const copy = [...prev];
											copy[i] = {
												...copy[i],
												startedAt: copy[i].startedAt ?? startedAt,
												endedAt,
												durationSeconds: elapsed,
											};
											return copy;
										}
									}
								}
								return prev;
							});

							// First-round auto title: trigger only on successful agent_end of
							// a brand-new session, exactly once per sessionPath.
							if (event.phase === "agent_end") {
								const active = activeSessionRef.current;
								const sp = active?.sessionPath;
								const cwd = active?.cwd;
								const rid = active?.runtimeId;
								// Skip auto-title for batch-task projects entirely — those sessions
								// are driven by the batch executor and should keep their batch-managed
								// names (or default firstMessage label).
								const projectType = cwd ? projectsRef.current.find((p) => p.cwd === cwd)?.type : undefined;
								if (sp && cwd && rid && projectType !== "batch" && !autoTitledSessionsRef.current.has(sp)) {
									autoTitledSessionsRef.current.add(sp);
									// Snapshot current chat messages via a no-op updater, then run
									// the LLM call asynchronously without blocking the UI.
									let snapshot: ChatMessage[] = [];
									setChatMessages((prev) => {
										snapshot = prev;
										return prev;
									});
									void (async () => {
										const firstUser = snapshot.find((m) => m.role === "user");
										let lastAssistant: ChatMessage | undefined;
										for (let i = snapshot.length - 1; i >= 0; i--) {
											if (snapshot[i].role === "assistant") {
												lastAssistant = snapshot[i];
												break;
											}
										}
										if (!firstUser || !lastAssistant) {
											autoTitledSessionsRef.current.delete(sp);
											return;
										}
										const userText = firstUser.text ?? "";
										const assistantText = lastAssistant.text ?? "";
										if (!userText.trim() && !assistantText.trim()) {
											autoTitledSessionsRef.current.delete(sp);
											return;
										}
										try {
											console.log(`[auto-title] requesting for session=${rid} sp=${sp}`);
											const name = await window.vetta.session.autoTitle(rid, userText, assistantText);
											console.log(`[auto-title] got name=${name ?? "(null)"} for sp=${sp}`);
											if (name) {
												// Optimistic local update for sessions already present in the map.
												applyLocalRename(cwd, sp, name);
												// Re-read from disk: handles brand-new sessions whose JSONL only
												// just appeared after the assistant's first message flushed, and
												// guarantees the persisted name is reflected in the sidebar.
												await loadSessions(cwd);
											} else {
												autoTitledSessionsRef.current.delete(sp);
											}
										} catch (err) {
											console.warn("[useSessionManager] auto-title failed", err);
											autoTitledSessionsRef.current.delete(sp);
										}
									})();
								}
							}
						}
						return;
					}

					// ── Thinking delta (streaming thinking text) ──
					if (event.type === "thinking.delta") {
						pendingThinkingDeltaRef.current += event.delta;
						scheduleDeltaFlush();
						return;
					}

					// ── Text delta (streaming assistant text) ──
					if (event.type === "message.delta") {
						pendingTextDeltaRef.current += event.delta;
						scheduleDeltaFlush();
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

					// ── Error (provider / runtime error) ──
					if (event.type === "error") {
						setChatMessages((prev) => appendError(prev, event.error.message));
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

					// ── Compaction start ──
					if (event.type === "compaction.start") {
						setIsCompacting(true);
						return;
					}

					// ── Compaction end ──
					if (event.type === "compaction.end") {
						setIsCompacting(false);
						return;
					}

					// ── Todo update ──
					if (event.type === "todo_update") {
						const sessionCwd = activeSessionRef.current?.cwd;
						if (sessionCwd) {
							const items = (event as { items?: unknown[] }).items ?? [];
							setTodoItems((prev) => {
								const next = new Map(prev);
								if (items.length > 0) {
									next.set(sessionCwd, items as TodoItem[]);
								} else {
									next.delete(sessionCwd);
								}
								return next;
							});
						}
						return;
					}
				}),
			);

			__perf("after subscribe, before loadSessions");
			await loadSessions(cwd);
			__perf("exit");
		},
		[
			setChatMessages,
			setActiveSession,
			setIsStreaming,
			setIsCompacting,
			navigate,
			loadSessions,
			setLastTurnUsage,
			setContextUsage,
			setModelSupportsImages,
			setSessionExecutionMode,
			selectedModel,
			setSelectedModel,
			setTodoItems,
			setTurnModifiedFiles,
			flushDeltas,
			scheduleDeltaFlush,
			applyLocalRename,
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
		const skillPrefix = selectedSkill
			? selectedSkill.type === "scene"
				? `/scene:${selectedSkill.name}\n`
				: `/skill:${selectedSkill.name}\n`
			: "";
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

		// Optimistically expose this session in the sidebar before the disk file
		// has been flushed (SessionManager only writes after the assistant's
		// first message). Use the user's prompt prefix as a temporary label;
		// auto-title or the next loadSessions will overwrite as appropriate.
		const sp = activeSessionRef.current?.sessionPath;
		if (sp) {
			ensureLocalSession(session.cwd, {
				id: session.runtimeId,
				path: sp,
				cwd: session.cwd,
				firstMessage: rawText.slice(0, 80) || "(image)",
				modifiedAt: Date.now(),
			});
		}

		const promptReq: {
			text: string;
			images?: Array<{ type: "image"; data: string; mimeType: string }>;
			modelKey?: string;
		} = {
			text: text || "(see attached images)",
		};
		if (images) {
			promptReq.images = images.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
		}
		if (selectedModel) {
			promptReq.modelKey = selectedModel;
		}
		await window.vetta.session.prompt(session.runtimeId, promptReq);
		await loadSessions(session.cwd);
	}, [
		activeSession,
		inputValue,
		attachedImages,
		selectedSkill,
		mentionedFiles,
		selectedModel,
		setInputValue,
		setAttachedImages,
		setSelectedSkill,
		setMentionedFiles,
		setChatMessages,
		loadSessions,
		ensureLocalSession,
	]);

	const abortMessage = useCallback(async () => {
		if (!activeSession?.runtimeId) return;
		await window.vetta.session.abort(activeSession.runtimeId);
	}, [activeSession]);

	return { openSession, sendMessage, abortMessage, openSessionRef };
}

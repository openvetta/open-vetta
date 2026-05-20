import { useProjects } from "@domains/project/hooks/useProjects";
import {
	activeSessionAtom,
	activeSessionStreamingAtom,
	activityPanelOpenAtom,
	attachedImagesAtom,
	batchProjectsAtom,
	type ChatMessage,
	chatMessagesAtom,
	contextUsageAtom,
	inlineFilePreviewAtom,
	inputValueAtom,
	isCompactingAtom,
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
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
	adoptDraftId,
	appendError,
	appendTextDelta,
	appendThinkingDelta,
	bumpOpenSessionToken,
	currentUnsubscribe,
	extractModifiedFiles,
	finalizeMessage,
	fullHistoryToChat,
	getOpenSessionToken,
	handleToolEnd,
	handleToolPhase,
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
	const setActiveSessionStreaming = useSetAtom(activeSessionStreamingAtom);
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
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setInlineFilePreview = useSetAtom(inlineFilePreviewAtom);
	// 用于判断当前 session 是否归属一个 paused 的 batch-task 子任务。命中时
	// sendMessage 改走 batchTasks.resumeTaskWithText 入队首恢复运行，而不是
	// 直接 session.prompt 立即 streaming（与并发上限共生）。
	const batchProjects = useAtomValue(batchProjectsAtom);
	const batchProjectsRef = useRef(batchProjects);
	batchProjectsRef.current = batchProjects;
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
	// Tracks which session the currently-pending deltas belong to. If the user
	// switches away before the next rAF fires, we drop the deltas instead of
	// appending them to the new session's messages.
	const pendingDeltaSessionRef = useRef<string | null>(null);

	// Idempotent flush: safe to call from rAF callback OR synchronously before any
	// non-delta event handler. Always cancels any pending rAF before draining.
	// Calling this before a tool/state event is what keeps streamed text on the
	// correct side of tool blocks — see ordering bug fix.
	const flushDeltas = useCallback(() => {
		if (deltaRafRef.current !== null) {
			cancelAnimationFrame(deltaRafRef.current);
			deltaRafRef.current = null;
		}
		const textDelta = pendingTextDeltaRef.current;
		const thinkingDelta = pendingThinkingDeltaRef.current;
		const owningSession = pendingDeltaSessionRef.current;
		pendingTextDeltaRef.current = "";
		pendingThinkingDeltaRef.current = "";
		pendingDeltaSessionRef.current = null;

		if (owningSession && activeSessionRef.current?.runtimeId !== owningSession) {
			return;
		}

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
			// 取自己的调用令牌；若中途被新的 openSession 抢跑，会在 subscribe()
			// 返回后被发现并立即清理自己刚建好的 IPC 订阅，避免泄漏。
			const myOpenToken = bumpOpenSessionToken();
			// 切换 session 前先关闭当前活动面板与内嵌文件预览，避免新 session 沿用
			// 上一个 session 的文件预览内容（活动面板默认收起，由用户按需再次展开）。
			setInlineFilePreview(null);
			setActivityPanelOpen(false);
			// Teardown previous session
			currentUnsubscribe?.();
			setCurrentUnsubscribe(null);
			// Cancel any in-flight rAF and drop pending deltas — otherwise the prior
			// session's accumulated delta text gets flushed into the new session's atom.
			if (deltaRafRef.current !== null) {
				cancelAnimationFrame(deltaRafRef.current);
				deltaRafRef.current = null;
			}
			pendingTextDeltaRef.current = "";
			pendingThinkingDeltaRef.current = "";
			pendingDeltaSessionRef.current = null;
			resetStreamState();
			// 切会话时清掉本地 streaming 信号；若新会话仍在跑，下面 state.isStreaming
			// 分支 + runningSessionPathsAtom 派生兜底会把 TypingIndicator 重新拉回来。
			setActiveSessionStreaming(false);
			setIsCompacting(false);
			setTurnModifiedFiles([]);
			// Clear messages immediately so the user sees the switch take effect
			// instead of staring at the old session while history loads.
			setChatMessages([]);

			__perf("before session.create");
			const { sessionId } = await window.vetta.session.create({ cwd, sessionPath, executionMode });
			__perf("after session.create");

			// 拿到 sessionId 就立即写 activeSession 并 navigate，让用户尽快看到 ChatView。
			// 真实 sessionPath 解析（可能还要再走一次 IPC）放到后面，等好了再补一次写入。
			// 这样 Welcome → Chat 的转场就不会被 getFullHistory / getState / getSessionPath
			// 的串行 IPC 拖住，体感保持瞬时。
			const earlySessionInfo = { cwd, sessionPath: sessionPath ?? "", runtimeId: sessionId };
			setActiveSession(earlySessionInfo);
			activeSessionRef.current = earlySessionInfo;
			void navigate({ to: "/" });

			// Fire history + state in parallel so renderer doesn't wait on two
			// sequential IPC round-trips. History is rendered as soon as it lands;
			// state arrives shortly after and fills in context/streaming UI.
			const historyPromise = window.vetta.session.getFullHistory(sessionId);
			const statePromise = window.vetta.session.getState(sessionId);

			const history = await historyPromise;
			__perf("after getFullHistory");
			const mapped = fullHistoryToChat(history);
			setChatMessages(mapped);
			setTurnModifiedFiles(extractModifiedFiles(mapped, cwd));

			// If this session already has any prior turn (loaded from disk) we never
			// want to auto-rename — only brand-new sessions on their first round.
			if (sessionPath && mapped.some((m) => m.role === "user")) {
				autoTitledSessionsRef.current.add(sessionPath);
			}

			const state = await statePromise;
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
				setActiveSessionStreaming(true);
				setTurnStartTime(startedAt);
			}

			// 补一次写入：把解析好的真实 sessionPath 落到 activeSession 上。
			// （早写入用的是 sessionPath ?? ""，对新 session 是空串。）
			if (cachedKey !== earlySessionInfo.sessionPath) {
				const sessionInfo = { cwd, sessionPath: cachedKey, runtimeId: sessionId };
				setActiveSession(sessionInfo);
				activeSessionRef.current = sessionInfo;
			}

			__perf("before session.subscribe");
			// ─── Subscribe to live session events ───
			const unsubscribeFn = await window.vetta.session.subscribe(sessionId, (event) => {
				// Defensive guard: if user has already switched away to another
				// session, drop this event so its delta/state can't bleed into
				// the new session's atom. activeSessionRef is updated synchronously
				// above and reflects the latest user-facing session.
				if (activeSessionRef.current?.runtimeId !== sessionId) return;
				// ── Lifecycle ──
				if (event.type === "session.lifecycle") {
					if (event.phase === "agent_start") {
						resetStreamState();
						setTurnStartTime(event.timestamp);
						setActiveSessionStreaming(true);
						setTurnModifiedFiles([]);
					}
					if (event.phase === "agent_end" || event.phase === "aborted") {
						// Flush any pending deltas before finalizing
						flushDeltas();
						// Always reset streaming state first to unblock the UI
						const endedAt = event.timestamp;
						const startedAt = turnStartTime;
						const elapsed = startedAt ? (endedAt - startedAt) / 1000 : 0;
						resetStreamState();
						setActiveSessionStreaming(false);
						setTurnStartTime(0);
						// Write total duration onto the last assistant message
						// and extract modified files from this turn
						setChatMessages((prev) => {
							setTurnModifiedFiles(extractModifiedFiles(prev, activeSessionRef.current?.cwd));
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
					pendingDeltaSessionRef.current = sessionId;
					scheduleDeltaFlush();
					return;
				}

				// ── Text delta (streaming assistant text) ──
				if (event.type === "message.delta") {
					pendingTextDeltaRef.current += event.delta;
					pendingDeltaSessionRef.current = sessionId;
					scheduleDeltaFlush();
					return;
				}

				// ── Tool call generating (model started generating a tool call) ──
				if (event.type === "toolcall.start") {
					// Flush pending text/thinking deltas FIRST so the tool block lands
					// after any text that streamed before it (otherwise batched deltas
					// get appended on the wrong side of the tool block).
					flushDeltas();
					setChatMessages((prev) => handleToolStart(prev, event.toolCallId, event.toolName, {}));
					return;
				}

				// ── Message final (full assistant message — text, thinking, tool calls) ──
				if (event.type === "message.final" && event.message.role === "assistant") {
					flushDeltas();
					setChatMessages((prev) => finalizeMessage(prev, event.message.content));
					return;
				}

				// ── Tool start ──
				if (event.type === "tool.start") {
					flushDeltas();
					setChatMessages((prev) =>
						handleToolStart(
							prev,
							event.toolCallId,
							event.toolName,
							(event.args as Record<string, unknown>) ?? {},
							event.startedAt,
						),
					);
					return;
				}

				// ── Tool phase (live, never persisted into LLM context) ──
				if (event.type === "tool.phase") {
					setChatMessages((prev) => handleToolPhase(prev, event.toolCallId, event.label, event.atMs));
					return;
				}

				// ── Tool end ──
				if (event.type === "tool.end") {
					flushDeltas();
					setChatMessages((prev) =>
						handleToolEnd(prev, event.toolCallId, event.result, event.isError, {
							startedAt: event.startedAt,
							durationMs: event.durationMs,
							phases: event.phases,
						}),
					);
					return;
				}

				// ── Error (provider / runtime error) ──
				if (event.type === "error") {
					flushDeltas();
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
			});

			// 校验令牌：如果 await 期间用户已经切换到下一个 session，本次的
			// subscribe 已经成了孤儿——立刻 unsub，绝不要写进 currentUnsubscribe，
			// 否则它会覆盖后来者，新订阅永不被清理；而每个泄漏的订阅都会在 preload
			// 全局 ipcRenderer 上留下一个 listener，长期累积会触发 Oilpan OOM。
			if (myOpenToken !== getOpenSessionToken()) {
				unsubscribeFn();
				__perf("superseded; orphan subscription cleaned");
				return;
			}
			setCurrentUnsubscribe(unsubscribeFn);

			__perf("after subscribe, before loadSessions");
			await loadSessions(cwd);
			__perf("exit");
		},
		[
			setChatMessages,
			setActiveSession,
			setActiveSessionStreaming,
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
			setActivityPanelOpen,
			setInlineFilePreview,
		],
	);

	// Keep ref in sync so shortcut handler can call openSession
	openSessionRef.current = openSession;

	// Expose openSession globally via ref for other pages (e.g. AutomationPage)
	openSessionFnRef.current = openSession;

	const sendMessage = useCallback(async () => {
		// 读 ref 而非 state：允许在同一 tick 内先 openSession 再立即 sendMessage
		// （例如 NewSessionPage 的"创建会话+发送"组合调用），避免 React 闭包拿到旧 null。
		const session = activeSessionRef.current ?? activeSession;
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

		// 检查当前 session 是否归属一个 paused 的 batch-task 子任务。命中则改走
		// resume 路径（入队首，由调度器按并发数放行），跳过 session.prompt。
		let pausedBatch: { projectId: string; taskId: string } | undefined;
		for (const p of batchProjectsRef.current) {
			const matched = p.tasks.find((t) => t.sessionId === session.runtimeId && t.status === "paused");
			if (matched) {
				pausedBatch = { projectId: p.id, taskId: matched.id };
				break;
			}
		}

		if (pausedBatch) {
			try {
				await window.vetta.batchTasks.resumeTaskWithText(pausedBatch.projectId, pausedBatch.taskId, text);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error("[useSessionManager.sendMessage] resumeTaskWithText rejected:", err);
				setChatMessages((prev) => appendError(prev, message));
			}
			await loadSessions(session.cwd);
			return;
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
		try {
			await window.vetta.session.prompt(session.runtimeId, promptReq);
		} catch (err) {
			// RuntimeHost.prompt 现在会先把 prompt 期同步抛错（"No model
			// selected" / "No API key found" / "Agent is already processing"
			// 等）转换成 error 事件广播给所有订阅者，再把异常向上抛——所以
			// 正常情况下这里 catch 到的时候 chat 里已经多了一条 error block。
			// 但保留这层兜底是因为：(1) 旧版 RuntimeHost 或其它 host 实现未
			// 必有合成事件机制；(2) IPC 链路自身（preload / electron）出错
			// 时不会经过 RuntimeHost。任何 reject 在这里直接落成一条 error
			// 气泡，杜绝「按了发送但屏幕完全没反应」的死寂体验。
			const message = err instanceof Error ? err.message : String(err);
			console.error("[useSessionManager.sendMessage] prompt rejected:", err);
			setChatMessages((prev) => appendError(prev, message));
		}
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

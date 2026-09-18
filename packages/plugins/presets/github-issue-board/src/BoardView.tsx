import {
	useActiveConversation,
	type PluginContext,
	type PluginOfficialProjectEntry,
} from "@vetta-org/plugin-sdk";
import { Fragment, type JSX, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	resolveGithubRepoFromProject,
	type ResolveGithubRepoError,
} from "./git-remote";
import {
	fetchIssueComments,
	fetchOpenGithubIssues,
	githubFetchError,
	ISSUE_COMMIT_INSTRUCTION,
	ISSUE_PAGE_SIZE,
	mapGithubIssueItems,
	normalizeIssuePage,
	type GithubFetchErrorKind,
	type GithubIssueComment,
} from "./github-issues";
import { IMPLEMENT_SKILL, runQueuedTask } from "./run-task";
import {
	addManualTask,
	hasRunningTask,
	loadPluginState,
	mergeIssueTasks,
	removeTask,
	savePluginState,
	updateTaskPrompt,
	type GithubTask,
	type GithubTaskStatus,
	type PluginState,
} from "./state";
import {
	CONVERSATION_WORKSPACE,
	extraWorkspacePath,
	parseWorkspaceSelectValue,
	pathBasename,
	resolveWorkspaceCwd,
	tasksVisibleForBoard,
	workspaceSelectValue,
	type WorkspaceSource,
} from "./workspace";

const FETCH_ERROR_KEY: Record<GithubFetchErrorKind, string> = {
	"rate-limit": "board.error.rateLimit",
	"not-found": "board.error.notFound",
	"non-json": "board.error.nonJson",
};

const RESOLVE_ERROR_KEY: Record<ResolveGithubRepoError, string> = {
	"no-project": "board.error.noProject",
	"not-git": "board.error.notGit",
	"no-github-remote": "board.error.noGithubRemote",
};

const FIELD =
	"w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60";

const STATUS_BADGE: Record<GithubTaskStatus, string> = {
	pending: "bg-muted text-muted-foreground",
	running: "bg-primary/12 text-primary",
	completed: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
	failed: "bg-red-500/12 text-red-600 dark:text-red-400",
};

const ACTION_BUTTON =
	"rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40";
const PRIMARY_BUTTON =
	"self-start rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40";
const CHIP = "bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px]";
const RUN_MENU_ITEM =
	"rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40";

interface RunMenuPos {
	top: number;
	left: number;
	placeAbove: boolean;
}

function positionRunMenu(trigger: DOMRect, menu: DOMRect): RunMenuPos {
	const gap = 8;
	const placeAbove = trigger.top >= menu.height + gap + 8;
	const top = placeAbove ? trigger.top - menu.height - gap : trigger.bottom + gap;
	const left = Math.min(Math.max(8, trigger.right - menu.width), window.innerWidth - menu.width - 8);
	return { top, left, placeAbove };
}

type CommentsCacheEntry = { status: "loading" | "error" | "ok"; items: GithubIssueComment[] };

export function BoardView({ ctx }: { ctx: PluginContext }): JSX.Element {
	const [state, setState] = useState<PluginState | null>(null);
	const [draft, setDraft] = useState("");
	const [owner, setOwner] = useState("");
	const [repo, setRepo] = useState("");
	const [fetching, setFetching] = useState(false);
	const [fetchNotice, setFetchNotice] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState("");
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
	const [pendingRunId, setPendingRunId] = useState<string | null>(null);
	const [runMenuPos, setRunMenuPos] = useState<RunMenuPos | null>(null);
	const [commentsByTask, setCommentsByTask] = useState<Record<string, CommentsCacheEntry>>({});
	const [workbench, setWorkbench] = useState<PluginOfficialProjectEntry[]>([]);
	const conversation = useActiveConversation();
	const cancelledRef = useRef(false);
	const inflightRef = useRef(false);
	const fetchingRef = useRef(false);
	const runMenuRef = useRef<HTMLDivElement>(null);
	const runTriggerRef = useRef<HTMLButtonElement | null>(null);
	const workspaceGenRef = useRef(0);
	const stateRef = useRef(state);
	stateRef.current = state;
	const ownerRef = useRef(owner);
	ownerRef.current = owner;
	const repoRef = useRef(repo);
	repoRef.current = repo;
	const commentsRef = useRef(commentsByTask);
	commentsRef.current = commentsByTask;
	const t = ctx.i18n.t;
	const ready = state !== null;
	const busy = state !== null && hasRunningTask(state);
	const canFetch = ready && !fetching;
	const workspace = state?.workspace ?? CONVERSATION_WORKSPACE;
	const workspaceCwd = resolveWorkspaceCwd(workspace, conversation.cwd);
	const extraPath = extraWorkspacePath(
		workspace,
		workbench.map((project) => project.path),
	);
	const visibleTasks = tasksVisibleForBoard(state?.tasks ?? [], state?.repoTarget ?? null, workspaceCwd);

	useEffect(() => {
		cancelledRef.current = false;
		void loadPluginState(ctx.storage).then((loaded) => {
			if (cancelledRef.current) return;
			setState(loaded);
			if (loaded.repoTarget) {
				setOwner(loaded.repoTarget.owner);
				setRepo(loaded.repoTarget.repo);
			}
		});
		return () => {
			cancelledRef.current = true;
		};
	}, [ctx.storage]);

	useEffect(() => {
		let cancelled = false;
		void ctx.official.projects
			.list()
			.then((snapshot) => {
				if (!cancelled) setWorkbench(snapshot.projects);
			})
			.catch(() => {
				if (!cancelled) setWorkbench([]);
			});
		return () => {
			cancelled = true;
		};
	}, [ctx.official]);

	useEffect(() => {
		if (!pendingRunId) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (runMenuRef.current?.contains(target) || runTriggerRef.current?.contains(target)) return;
			setPendingRunId(null);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setPendingRunId(null);
		};
		const onScroll = () => setPendingRunId(null);
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("scroll", onScroll, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("scroll", onScroll, true);
		};
	}, [pendingRunId]);

	useLayoutEffect(() => {
		if (!pendingRunId) {
			setRunMenuPos(null);
			return;
		}
		const trigger = runTriggerRef.current;
		const menu = runMenuRef.current;
		if (!trigger || !menu) return;
		setRunMenuPos(positionRunMenu(trigger.getBoundingClientRect(), menu.getBoundingClientRect()));
	}, [pendingRunId]);

	async function persist(next: PluginState): Promise<void> {
		stateRef.current = next;
		if (!cancelledRef.current) setState(next);
		await savePluginState(ctx.storage, next);
	}

	async function importOpenIssues(pageInput: number): Promise<void> {
		const page = normalizeIssuePage(pageInput);
		const current = stateRef.current;
		if (!current || fetchingRef.current) return;
		fetchingRef.current = true;
		setFetching(true);
		try {
			let ownerName = ownerRef.current.trim();
			let repoName = repoRef.current.trim();
			if (!ownerName || !repoName) {
				const resolved = await resolveGithubRepoFromProject({
					command: ctx.command,
					cwd: resolveWorkspaceCwd(stateRef.current?.workspace ?? current.workspace, conversation.cwd),
				});
				if (!resolved.ok) {
					ctx.ui.notify({ message: t(RESOLVE_ERROR_KEY[resolved.error]) });
					return;
				}
				ownerName = resolved.target.owner;
				repoName = resolved.target.repo;
				ownerRef.current = ownerName;
				repoRef.current = repoName;
				setOwner(ownerName);
				setRepo(repoName);
			}
			const latest = stateRef.current ?? current;
			const withTarget: PluginState = { ...latest, repoTarget: { owner: ownerName, repo: repoName } };
			await persist(withTarget);
			const result = await fetchOpenGithubIssues(ctx.network, ownerName, repoName, ctx.command, page);
			const fetchError = githubFetchError(result);
			if (fetchError) {
				ctx.ui.notify({ message: t(FETCH_ERROR_KEY[fetchError]), variant: "error" });
				return;
			}
			if (typeof result !== "object" || result === null || !("items" in result) || !Array.isArray(result.items)) {
				return;
			}
			const mapped = mapGithubIssueItems(result.items, {
				owner: ownerName,
				repo: repoName,
				now: Date.now(),
				createId: () => crypto.randomUUID(),
				commitInstruction: ISSUE_COMMIT_INSTRUCTION,
			});
			const merged = mergeIssueTasks(stateRef.current ?? withTarget, mapped);
			const rawCount = result.items.length;
			const nextPage = rawCount >= ISSUE_PAGE_SIZE ? page + 1 : null;
			await persist({
				...merged.state,
				issueNextPage: nextPage,
				lastFetch: { owner: ownerName, repo: repoName },
			});
			if (cancelledRef.current) return;
			if (page === 1 && merged.imported + merged.updated === 0) {
				setFetchNotice(t("board.fetch.none"));
			} else if (page === 1) {
				setFetchNotice(t("board.fetch.summary", { imported: merged.imported, updated: merged.updated }));
			} else {
				setFetchNotice(t("board.fetch.more", { imported: merged.imported }));
			}
		} finally {
			fetchingRef.current = false;
			if (!cancelledRef.current) setFetching(false);
		}
	}

	async function applyWorkspace(next: WorkspaceSource): Promise<void> {
		const current = stateRef.current;
		if (!current) return;
		if (workspaceSelectValue(current.workspace) === workspaceSelectValue(next)) return;
		setFetchNotice(null);
		const gen = ++workspaceGenRef.current;
		const withWorkspace = { ...current, workspace: next };
		await persist(withWorkspace);
		const cwd = resolveWorkspaceCwd(next, conversation.cwd);
		const resolved = await resolveGithubRepoFromProject({
			command: ctx.command,
			cwd,
		});
		if (cancelledRef.current || gen !== workspaceGenRef.current) return;
		if (!resolved.ok) {
			ctx.ui.notify({ message: t(RESOLVE_ERROR_KEY[resolved.error]) });
			return;
		}
		ownerRef.current = resolved.target.owner;
		repoRef.current = resolved.target.repo;
		setOwner(resolved.target.owner);
		setRepo(resolved.target.repo);
		const latest = stateRef.current ?? withWorkspace;
		await persist({ ...latest, repoTarget: resolved.target });
		if (cancelledRef.current || gen !== workspaceGenRef.current) return;
		await importOpenIssues(1);
	}

	async function handlePickDirectory(): Promise<void> {
		let path: string | null;
		try {
			path = await ctx.official.dialog.openDirectory();
		} catch (error) {
			ctx.ui.notify({ message: t("board.error.pickDirectory"), error, variant: "error" });
			return;
		}
		if (!path?.trim() || cancelledRef.current) return;
		await applyWorkspace({ kind: "path", path });
	}

	async function handleSubmit(): Promise<void> {
		const promptText = draft.trim();
		const current = stateRef.current;
		if (!promptText || current === null) return;
		const next = addManualTask(current, {
			id: crypto.randomUUID(),
			promptText,
			now: Date.now(),
			cwd: resolveWorkspaceCwd(current.workspace, conversation.cwd),
		});
		setDraft("");
		await persist(next);
	}

	async function handleFetch(): Promise<void> {
		await importOpenIssues(1);
	}

	function startEdit(task: GithubTask): void {
		if (task.source.kind !== "manual") return;
		if (task.status !== "pending" && task.status !== "failed") return;
		setPendingDeleteId(null);
		setPendingRunId(null);
		setEditingId(task.id);
		setEditDraft(task.promptText);
		setExpandedId(null);
	}

	async function handleSaveEdit(): Promise<void> {
		const current = stateRef.current;
		if (!current || !editingId) return;
		const promptText = editDraft.trim();
		if (!promptText) return;
		const next = updateTaskPrompt(current, { taskId: editingId, promptText, now: Date.now() });
		setEditingId(null);
		setEditDraft("");
		await persist(next);
	}

	function handleCancelEdit(): void {
		setEditingId(null);
		setEditDraft("");
	}

	function requestDelete(task: GithubTask): void {
		if (task.source.kind !== "manual" || task.status === "running") return;
		setEditingId(null);
		setEditDraft("");
		setPendingRunId(null);
		setPendingDeleteId(task.id);
	}

	function cancelDelete(): void {
		setPendingDeleteId(null);
	}

	async function handleDelete(taskId: string): Promise<void> {
		const current = stateRef.current;
		if (!current || pendingDeleteId !== taskId) return;
		if (editingId === taskId) {
			setEditingId(null);
			setEditDraft("");
		}
		if (expandedId === taskId) setExpandedId(null);
		setPendingDeleteId(null);
		await persist(removeTask(current, taskId));
	}

	function requestRun(task: GithubTask, trigger: HTMLButtonElement): void {
		if (task.status !== "pending") return;
		setPendingDeleteId(null);
		setEditingId(null);
		setEditDraft("");
		runTriggerRef.current = trigger;
		setPendingRunId(task.id);
	}

	function cancelRun(): void {
		setPendingRunId(null);
	}

	async function handleRun(taskId: string, skill: string | null): Promise<void> {
		const current = stateRef.current;
		if (!current || inflightRef.current || pendingRunId !== taskId) return;
		setPendingRunId(null);
		inflightRef.current = true;
		try {
			const result = await runQueuedTask({
				state: current,
				taskId,
				conversation: ctx.conversation,
				cwd: resolveWorkspaceCwd(current.workspace, conversation.cwd),
				now: () => Date.now(),
				persist,
				skill,
			});
			if (!cancelledRef.current) setState(result.state);
			if (result.notice === "no-project") {
				ctx.ui.notify({ message: t("board.error.noProject") });
			}
		} finally {
			inflightRef.current = false;
		}
	}

	async function handleOpenSession(sessionPath: string): Promise<void> {
		const cwd = state ? resolveWorkspaceCwd(state.workspace, conversation.cwd) : conversation.cwd;
		if (!cwd) {
			ctx.ui.notify({ message: t("board.error.noProject") });
			return;
		}
		try {
			await ctx.conversation.openSession({ cwd, sessionPath });
		} catch (error) {
			ctx.ui.notify({ message: t("board.error.openSession"), error, variant: "error" });
		}
	}

	async function toggleIssueDetails(task: GithubTask): Promise<void> {
		if (task.source.kind !== "issue") return;
		if (expandedId === task.id) {
			setExpandedId(null);
			return;
		}
		setExpandedId(task.id);
		if (commentsRef.current[task.id]) return;
		setCommentsByTask((prev) => ({ ...prev, [task.id]: { status: "loading", items: [] } }));
		const result = await fetchIssueComments(
			ctx.network,
			task.source.owner,
			task.source.repo,
			task.source.issueNumber,
			ctx.command,
		);
		if (cancelledRef.current) return;
		if (githubFetchError(result) || !("items" in result)) {
			setCommentsByTask((prev) => ({ ...prev, [task.id]: { status: "error", items: [] } }));
			return;
		}
		setCommentsByTask((prev) => ({ ...prev, [task.id]: { status: "ok", items: result.items } }));
	}

	function emptyQueueMessage(): string {
		if (fetching) return t("board.empty.fetching");
		const target = state?.repoTarget;
		const last = state?.lastFetch;
		if (target && last && last.owner === target.owner && last.repo === target.repo) {
			return t("board.empty.noIssues");
		}
		return t("board.empty.notFetched");
	}

	return (
		<div className="flex h-full w-full flex-col gap-4 bg-background p-6">
			<h1 className="text-lg font-semibold text-foreground">{t("board.title")}</h1>
			<div className="flex flex-wrap items-end gap-2">
				<label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm font-medium text-muted-foreground">
					{t("board.workspace.label")}
					<select
						className={FIELD}
						disabled={!ready}
						value={workspaceSelectValue(workspace)}
						onChange={(event) => {
							void applyWorkspace(parseWorkspaceSelectValue(event.target.value));
						}}
					>
						<option value="conversation">
							{conversation.cwd
								? t("board.workspace.conversation", { path: conversation.cwd })
								: t("board.workspace.conversationNone")}
						</option>
						{workbench.map((project) => (
							<option key={project.path} value={`path:${project.path}`}>
								{t("board.workspace.project", {
									name: project.name?.trim() || pathBasename(project.path),
									path: project.path,
								})}
							</option>
						))}
						{extraPath ? (
							<option value={`path:${extraPath}`}>
								{t("board.workspace.project", {
									name: pathBasename(extraPath),
									path: extraPath,
								})}
							</option>
						) : null}
					</select>
				</label>
				<button className={ACTION_BUTTON} disabled={!ready} type="button" onClick={() => void handlePickDirectory()}>
					{t("board.workspace.pickDirectory")}
				</button>
			</div>
			<p className="truncate text-xs text-muted-foreground">
				{workspaceCwd ? t("board.project.current", { path: workspaceCwd }) : t("board.project.none")}
			</p>
			<form
				className="flex flex-wrap items-end gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					void handleFetch();
				}}
			>
				<label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-sm font-medium text-muted-foreground">
					{t("board.repo.owner")}
					<input
						className={FIELD}
						disabled={!ready}
						placeholder={t("board.repo.ownerPlaceholder")}
						value={owner}
						onChange={(event) => setOwner(event.target.value)}
					/>
				</label>
				<label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-sm font-medium text-muted-foreground">
					{t("board.repo.name")}
					<input
						className={FIELD}
						disabled={!ready}
						placeholder={t("board.repo.namePlaceholder")}
						value={repo}
						onChange={(event) => setRepo(event.target.value)}
					/>
				</label>
				<button className={PRIMARY_BUTTON} disabled={!canFetch} type="submit">
					{t("board.fetch")}
				</button>
			</form>
			{fetchNotice ? <p className="text-xs text-muted-foreground">{fetchNotice}</p> : null}
			<form
				className="flex flex-col gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					void handleSubmit();
				}}
			>
				<label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
					{t("board.taskInput.label")}
					<textarea
						className={`min-h-[72px] resize-y ${FIELD}`}
						disabled={!ready}
						placeholder={t("board.taskInput.placeholder")}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
					/>
				</label>
				<button className={PRIMARY_BUTTON} disabled={!ready || draft.trim() === ""} type="submit">
					{t("board.add")}
				</button>
			</form>
			<div className="min-h-0 flex-1 overflow-auto">
				<table className="w-full text-left text-sm">
					<thead>
						<tr className="border-b border-border text-muted-foreground">
							<th className="py-2 pr-3 font-medium">{t("board.queue.title")}</th>
							<th className="py-2 pr-3 font-medium">{t("board.queue.labels")}</th>
							<th className="py-2 pr-3 font-medium">{t("board.queue.assignees")}</th>
							<th className="py-2 pr-3 font-medium">{t("board.queue.source")}</th>
							<th className="py-2 pr-3 font-medium">{t("board.queue.status")}</th>
							<th className="py-2 font-medium">{t("board.queue.actions")}</th>
						</tr>
					</thead>
					<tbody>
						{visibleTasks.length === 0 ? (
							<tr>
								<td className="py-6 text-sm text-muted-foreground" colSpan={6}>
									{emptyQueueMessage()}
								</td>
							</tr>
						) : (
							visibleTasks.map((task) => {
								const comments = commentsByTask[task.id];
								return (
									<Fragment key={task.id}>
										<tr className="border-b border-border/50">
											<td className="py-2 pr-3 text-foreground">
												{task.source.kind === "issue" ? (
													<button
														aria-expanded={expandedId === task.id}
														className="text-left font-normal text-foreground"
														type="button"
														onClick={() => void toggleIssueDetails(task)}
													>
														<span className="mr-1.5 text-muted-foreground tabular-nums">
															{t("board.issue.ref", { number: task.source.issueNumber })}
														</span>{" "}
														{task.title}
													</button>
												) : (
													task.title
												)}
											</td>
											<td className="py-2 pr-3">
												{task.source.kind === "issue" ? (
													<div className="flex flex-wrap gap-1">
														{(task.labels ?? []).map((label) => (
															<span className={CHIP} key={label}>
																{label}
															</span>
														))}
													</div>
												) : (
													<span className="text-muted-foreground">{t("board.issue.dash")}</span>
												)}
											</td>
											<td className="py-2 pr-3 text-muted-foreground">
												{task.source.kind === "issue"
													? task.assignees && task.assignees.length > 0
														? task.assignees.join(", ")
														: t("board.issue.unassigned")
													: t("board.issue.dash")}
											</td>
											<td className="py-2 pr-3 text-muted-foreground">{t(`board.source.${task.source.kind}`)}</td>
											<td className="py-2 pr-3">
												<span
													className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[task.status]}`}
												>
													{t(`board.status.${task.status}`)}
												</span>
												{task.status === "failed" && task.error ? (
													<span className="ml-1.5 text-xs text-red-600 dark:text-red-400">{task.error}</span>
												) : null}
											</td>
											<td className="py-2">
												<div className="flex flex-wrap items-center gap-1.5">
													<button
														ref={pendingRunId === task.id ? runTriggerRef : undefined}
														aria-expanded={pendingRunId === task.id}
														aria-haspopup="true"
														className={ACTION_BUTTON}
														disabled={!ready || busy || task.status !== "pending" || editingId === task.id}
														type="button"
														onClick={(event) => {
															if (pendingRunId === task.id) cancelRun();
															else requestRun(task, event.currentTarget);
														}}
													>
														{t("board.run")}
													</button>
													{task.source.kind === "manual" ? (
														pendingDeleteId === task.id ? (
															<>
																<button
																	className={ACTION_BUTTON}
																	disabled={!ready}
																	type="button"
																	onClick={() => void handleDelete(task.id)}
																>
																	{t("board.delete.confirm")}
																</button>
																<button className={ACTION_BUTTON} type="button" onClick={cancelDelete}>
																	{t("board.cancel")}
																</button>
															</>
														) : (
															<>
																<button
																	className={ACTION_BUTTON}
																	disabled={
																		!ready ||
																		(task.status !== "pending" && task.status !== "failed") ||
																		editingId === task.id
																	}
																	type="button"
																	onClick={() => startEdit(task)}
																>
																	{t("board.edit")}
																</button>
																<button
																	className={ACTION_BUTTON}
																	disabled={!ready || task.status === "running"}
																	type="button"
																	onClick={() => requestDelete(task)}
																>
																	{t("board.delete")}
																</button>
															</>
														)
													) : null}
													{task.sessionId ? (
														<button
															className={ACTION_BUTTON}
															type="button"
															onClick={() => {
																const sessionPath = task.sessionId;
																if (sessionPath) void handleOpenSession(sessionPath);
															}}
														>
															{t("board.openSession")}
														</button>
													) : null}
												</div>
											</td>
										</tr>
										{editingId === task.id ? (
											<tr>
												<td className="py-2 pr-3" colSpan={6}>
													<label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
														{t("board.taskEdit.label")}
														<textarea
															className={`min-h-[72px] resize-y ${FIELD}`}
															value={editDraft}
															onChange={(event) => setEditDraft(event.target.value)}
														/>
													</label>
													<div className="mt-2 flex flex-wrap gap-1.5">
														<button
															className={PRIMARY_BUTTON}
															disabled={editDraft.trim() === ""}
															type="button"
															onClick={() => void handleSaveEdit()}
														>
															{t("board.save")}
														</button>
														<button className={ACTION_BUTTON} type="button" onClick={handleCancelEdit}>
															{t("board.cancel")}
														</button>
													</div>
												</td>
											</tr>
										) : expandedId === task.id && task.source.kind === "issue" ? (
											<tr>
												<td className="py-2 pr-3" colSpan={6}>
													{task.body ? (
														<div className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-foreground">
															{task.body}
														</div>
													) : (
														<p className="text-sm text-muted-foreground">{t("board.issue.nobody")}</p>
													)}
													<div className="mt-3 text-sm text-muted-foreground">
														{comments?.status === "loading"
															? t("board.issue.commentsLoading")
															: comments?.status === "error"
																? t("board.issue.commentsError")
																: comments?.status === "ok" && comments.items.length === 0
																	? t("board.issue.noComments")
																	: comments?.items.map((comment) => (
																			<div className="mt-2" key={comment.id}>
																				<div className="text-xs font-medium text-foreground">{comment.login}</div>
																				<div className="whitespace-pre-wrap text-sm text-foreground">{comment.body}</div>
																			</div>
																		))}
													</div>
												</td>
											</tr>
										) : null}
									</Fragment>
								);
							})
						)}
					</tbody>
				</table>
			</div>
			{state?.issueNextPage != null ? (
				<button
					className={ACTION_BUTTON}
					disabled={!ready || fetching}
					type="button"
					onClick={() => {
						const nextPage = stateRef.current?.issueNextPage;
						if (nextPage != null) void importOpenIssues(nextPage);
					}}
				>
					{t("board.fetch.loadMore")}
				</button>
			) : null}
			{pendingRunId ? (
				<div
					ref={runMenuRef}
					aria-label={t("board.run")}
					className="z-50 flex min-w-[11rem] flex-col gap-0.5 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
					style={{
						position: "fixed",
						top: runMenuPos?.top ?? 0,
						left: runMenuPos?.left ?? 0,
						visibility: runMenuPos ? "visible" : "hidden",
					}}
				>
					<button
						className={RUN_MENU_ITEM}
						disabled={!ready || busy}
						type="button"
						onClick={() => void handleRun(pendingRunId, null)}
					>
						{t("board.run.direct")}
					</button>
					<button
						className={RUN_MENU_ITEM}
						disabled={!ready || busy}
						type="button"
						onClick={() => void handleRun(pendingRunId, IMPLEMENT_SKILL)}
					>
						{t("board.run.withSkill", { name: IMPLEMENT_SKILL })}
					</button>
					<span
						aria-hidden="true"
						className={
							runMenuPos?.placeAbove
								? "pointer-events-none absolute right-3 top-full h-2 w-2 -translate-y-1 rotate-45 border-r border-b border-border bg-popover"
								: "pointer-events-none absolute right-3 bottom-full h-2 w-2 translate-y-1 rotate-45 border-t border-l border-border bg-popover"
						}
					/>
				</div>
			) : null}
		</div>
	);
}

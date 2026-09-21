import {
	useActiveConversation,
	type PluginContext,
	type PluginOfficialProjectEntry,
	type PluginOfficialSkillInfo,
} from "@vetta-org/plugin-sdk";
import { Fragment, type JSX, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BoardSelect, type BoardSelectOption } from "./BoardSelect";
import {
	resolveGithubRepoFromProject,
	type ResolveGithubRepoError,
} from "./git-remote";
import {
	buildIssueRunPrompt,
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
import {
	detachBoardRuns,
	filterBoardRunSkills,
	followRunningTask,
	runQueuedTask,
	selectBoardRunSkills,
	type BoardSessionPort,
} from "./run-task";
import {
	accumulateIssueNumbers,
	addManualTask,
	applyIssueFetchFilter,
	finishIssueFetchPage,
	hasRunningTask,
	loadPluginState,
	mergeIssueTasks,
	normalizeIssueFetchFilter,
	reconcileRunningTasks,
	removeTask,
	retryFailedTask,
	savePluginState,
	selectAutoAdvanceTask,
	setAutoAdvance,
	updateTaskPrompt,
	type GithubIssueState,
	type GithubTask,
	type GithubTaskStatus,
	type IssueFetchAssignee,
	type PluginState,
} from "./state";
import { TaskDraftComposer } from "./TaskDraftComposer";
import {
	CONVERSATION_WORKSPACE,
	extraWorkspacePath,
	filterBoardTasks,
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
	"assignee-needs-gh": "board.error.assigneeNeedsGh",
};

const RESOLVE_ERROR_KEY: Record<ResolveGithubRepoError, string> = {
	"no-project": "board.error.noProject",
	"not-git": "board.error.notGit",
	"no-github-remote": "board.error.noGithubRemote",
};

const FIELD =
	"w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60";
const COMPACT_FIELD =
	"h-7 w-full rounded-lg border border-border bg-background px-2.5 text-[12px] font-normal text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60";
const COMPACT_PRIMARY =
	"h-7 shrink-0 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-40";
const STATUS_BADGE: Record<GithubTaskStatus, string> = {
	pending: "bg-muted text-muted-foreground",
	running: "bg-primary/10 text-primary",
	completed: "bg-emerald-500/15 text-emerald-400",
	failed: "bg-destructive/15 text-destructive",
};
const ISSUE_STATE_BADGE: Record<GithubIssueState, string> = {
	open: "bg-emerald-500/15 text-emerald-400",
	closed: "bg-muted text-muted-foreground",
};
const ACTION_BUTTON =
	"rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40";
const CHIP = "bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px]";
const RUN_MENU_ITEM =
	"rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40";
const STATUS_FILTER_VALUES = ["all", "pending", "running", "completed", "failed"] as const;

interface RunMenuPos {
	top: number;
	left: number;
	placeAbove: boolean;
}

function positionRunMenu(trigger: DOMRect, menu: DOMRect): RunMenuPos {
	const gap = 8;
	const margin = 8;
	const placeAbove = trigger.top >= Math.min(menu.height, window.innerHeight / 2) + gap + margin;
	const unclampedTop = placeAbove ? trigger.top - menu.height - gap : trigger.bottom + gap;
	const top = Math.max(margin, Math.min(unclampedTop, window.innerHeight - menu.height - margin));
	const left = Math.min(
		Math.max(margin, trigger.right - menu.width),
		window.innerWidth - menu.width - margin,
	);
	return { top, left, placeAbove };
}

type CommentsCacheEntry = { status: "loading" | "error" | "ok"; items: GithubIssueComment[] };

function boardSessions(ctx: PluginContext): BoardSessionPort {
	return {
		create: (input) => ctx.official.sessions.create(input),
		prompt: (id, text) => ctx.official.sessions.prompt(id, text),
		abort: (id) => ctx.official.sessions.abort(id),
		onRunningChanged: (handler) => ctx.official.sessions.onRunningChanged(handler),
	};
}

function uniqueTaskLabels(tasks: GithubTask[]): string[] {
	const seen = new Set<string>();
	const labels: string[] = [];
	for (const task of tasks) {
		for (const label of task.labels ?? []) {
			if (seen.has(label)) continue;
			seen.add(label);
			labels.push(label);
		}
	}
	return labels.sort((left, right) => left.localeCompare(right));
}

function labelSelectOptions(
	labels: string[],
	selected: string,
	allLabel: string,
): BoardSelectOption<string>[] {
	const extra = selected !== "all" && !labels.includes(selected) ? [selected] : [];
	return [
		{ value: "all", label: allLabel },
		...extra.map((label) => ({ value: label, label })),
		...labels.map((label) => ({ value: label, label })),
	];
}

export function BoardView({ ctx }: { ctx: PluginContext }): JSX.Element {
	const [state, setState] = useState<PluginState | null>(null);
	const [fetching, setFetching] = useState(false);
	const [fetchNotice, setFetchNotice] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
	const [pendingRunId, setPendingRunId] = useState<string | null>(null);
	const [stoppingId, setStoppingId] = useState<string | null>(null);
	const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
	const [runMenuPos, setRunMenuPos] = useState<RunMenuPos | null>(null);
	const [commentsByTask, setCommentsByTask] = useState<Record<string, CommentsCacheEntry>>({});
	const [workbench, setWorkbench] = useState<PluginOfficialProjectEntry[]>([]);
	const [filterQuery, setFilterQuery] = useState("");
	const [filterStatus, setFilterStatus] = useState<"all" | GithubTaskStatus>("all");
	const [filterLabel, setFilterLabel] = useState("all");
	const [labelDraft, setLabelDraft] = useState<string | null>(null);
	const [runSkills, setRunSkills] = useState<PluginOfficialSkillInfo[]>([]);
	const [skillQuery, setSkillQuery] = useState("");
	const [includeComments, setIncludeComments] = useState(false);
	const conversation = useActiveConversation();
	const cancelledRef = useRef(false);
	const inflightRef = useRef(false);
	const abortRef = useRef<AbortController | null>(null);
	const fetchingRef = useRef(false);
	const runMenuRef = useRef<HTMLDivElement>(null);
	const runTriggerRef = useRef<HTMLButtonElement | null>(null);
	const workspaceMenuRef = useRef<HTMLDivElement>(null);
	const workspaceGenRef = useRef(0);
	const stateRef = useRef(state);
	stateRef.current = state;
	const fetchLabelValue = labelDraft ?? state?.fetchFilter.label ?? "";
	const labelDraftRef = useRef(fetchLabelValue);
	labelDraftRef.current = fetchLabelValue;
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
	const boardTasks = tasksVisibleForBoard(state?.tasks ?? [], state?.repoTarget ?? null, workspaceCwd);
	const visibleTasks = filterBoardTasks(boardTasks, {
		query: filterQuery,
		status: filterStatus,
		label: filterLabel,
	});
	const labelOptions = uniqueTaskLabels(boardTasks);
	const visibleRunSkills = filterBoardRunSkills(runSkills, skillQuery);
	const pendingRunTask = pendingRunId ? (state?.tasks.find((task) => task.id === pendingRunId) ?? null) : null;
	const selectedWorkspaceValue = workspaceSelectValue(workspace);
	const workspaceTriggerName =
		workspace.kind === "path"
			? workbench.find((project) => project.path === workspace.path)?.name?.trim() || pathBasename(workspace.path)
			: conversation.cwd
				? pathBasename(conversation.cwd)
				: t("board.workspace.placeholder");
	const workspaceTriggerIcon =
		workspace.kind === "path" || conversation.cwd
			? "icon-[solar--folder-linear]"
			: "icon-[solar--folder-with-files-linear]";

	useEffect(() => {
		cancelledRef.current = false;
		void loadPluginState(ctx.storage).then(async (loaded) => {
			if (cancelledRef.current) return;
			let runningPaths: string[] = [];
			try {
				runningPaths = await ctx.official.sessions.listRunning();
			} catch {
				runningPaths = [];
			}
			if (cancelledRef.current) return;
			const reconciled = reconcileRunningTasks(
				loaded,
				runningPaths,
				Date.now(),
				ctx.i18n.t("board.error.interrupted"),
			);
			if (reconciled.state !== loaded) await persist(reconciled.state);
			else setState(reconciled.state);
			const live = reconciled.live[0];
			if (!live || cancelledRef.current) return;
			inflightRef.current = true;
			const controller = new AbortController();
			abortRef.current = controller;
			try {
				const result = await followRunningTask({
					state: stateRef.current ?? reconciled.state,
					taskId: live.id,
					sessions: boardSessions(ctx),
					now: () => Date.now(),
					persist,
					signal: controller.signal,
					stoppedError: ctx.i18n.t("board.error.stopped"),
				});
				if (!cancelledRef.current) setState(result.state);
			} finally {
				if (abortRef.current === controller) abortRef.current = null;
				if (!cancelledRef.current) setStoppingId(null);
				inflightRef.current = false;
			}
		});
		return () => {
			cancelledRef.current = true;
			detachBoardRuns();
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
		if (!workspaceCwd) {
			setRunSkills([]);
			return;
		}
		let cancelled = false;
		void ctx.official.skills
			.list(workspaceCwd)
			.then((list) => {
				if (!cancelled) setRunSkills(selectBoardRunSkills(list));
			})
			.catch(() => {
				if (!cancelled) setRunSkills([]);
			});
		return () => {
			cancelled = true;
		};
	}, [ctx.official, workspaceCwd]);

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
		const onScroll = (event: Event) => {
			const target = event.target;
			if (target instanceof Node && runMenuRef.current?.contains(target)) return;
			setPendingRunId(null);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("scroll", onScroll, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("scroll", onScroll, true);
		};
	}, [pendingRunId]);

	useEffect(() => {
		if (!workspaceMenuOpen) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (workspaceMenuRef.current?.contains(target)) return;
			setWorkspaceMenuOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setWorkspaceMenuOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [workspaceMenuOpen]);

	useLayoutEffect(() => {
		if (!pendingRunId) {
			setRunMenuPos(null);
			return;
		}
		const trigger = runTriggerRef.current;
		const menu = runMenuRef.current;
		if (!trigger || !menu) return;
		setRunMenuPos(positionRunMenu(trigger.getBoundingClientRect(), menu.getBoundingClientRect()));
	}, [pendingRunId, runSkills, includeComments, skillQuery]);

	async function persist(next: PluginState): Promise<void> {
		stateRef.current = next;
		if (!cancelledRef.current) setState(next);
		await savePluginState(ctx.storage, next);
	}

	function resetFilters(): void {
		setFilterQuery("");
		setFilterStatus("all");
		setFilterLabel("all");
	}

	async function persistFetchFilter(assignee: IssueFetchAssignee, label: string): Promise<void> {
		const current = stateRef.current;
		if (!current) return;
		const next = applyIssueFetchFilter(current, { assignee, label });
		if (next === current) return;
		await persist(next);
	}

	async function importOpenIssues(pageInput: number): Promise<void> {
		const page = normalizeIssuePage(pageInput);
		const current = stateRef.current;
		if (!current || fetchingRef.current) return;
		fetchingRef.current = true;
		setFetching(true);
		if (page === 1) resetFilters();
		try {
			const filter = normalizeIssueFetchFilter({
				assignee: current.fetchFilter.assignee,
				label: labelDraftRef.current,
			});
			await persistFetchFilter(filter.assignee, filter.label ?? "");
			const resolved = await resolveGithubRepoFromProject({
				command: ctx.command,
				cwd: resolveWorkspaceCwd(stateRef.current?.workspace ?? current.workspace, conversation.cwd),
			});
			if (!resolved.ok) {
				ctx.ui.notify({ message: t(RESOLVE_ERROR_KEY[resolved.error]) });
				return;
			}
			const ownerName = resolved.target.owner;
			const repoName = resolved.target.repo;
			const latest = stateRef.current ?? current;
			const withTarget: PluginState = { ...latest, repoTarget: { owner: ownerName, repo: repoName } };
			await persist(withTarget);
			const result = await fetchOpenGithubIssues(
				ctx.network,
				ownerName,
				repoName,
				ctx.command,
				page,
				filter,
			);
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
			const openNumbers = mapped.flatMap((task) =>
				task.source.kind === "issue" ? [task.source.issueNumber] : [],
			);
			const latestMerged = stateRef.current ?? withTarget;
			const priorSync = latestMerged.issueSync;
			const seenNumbers = accumulateIssueNumbers(
				page > 1 &&
					priorSync &&
					priorSync.owner === ownerName &&
					priorSync.repo === repoName
					? priorSync.seenNumbers
					: [],
				openNumbers,
			);
			const finished = finishIssueFetchPage(merged.state, {
				owner: ownerName,
				repo: repoName,
				filter,
				seenNumbers,
				nextPage,
			});
			const nextState = finished.state;
			const closedCount = finished.closed;
			await persist(nextState);
			if (cancelledRef.current) return;
			const updated = merged.updated + closedCount;
			if (page === 1 && merged.imported + updated === 0) {
				setFetchNotice(t("board.fetch.none"));
			} else if (page === 1) {
				setFetchNotice(t("board.fetch.summary", { imported: merged.imported, updated }));
			} else {
				setFetchNotice(t("board.fetch.more", { imported: merged.imported }));
			}
		} finally {
			fetchingRef.current = false;
			if (!cancelledRef.current) setFetching(false);
		}
	}

	async function applyWorkspace(next: WorkspaceSource): Promise<void> {
		setWorkspaceMenuOpen(false);
		const current = stateRef.current;
		if (!current) return;
		if (workspaceSelectValue(current.workspace) === workspaceSelectValue(next)) return;
		setFetchNotice(null);
		resetFilters();
		const gen = ++workspaceGenRef.current;
		await persist({ ...current, workspace: next });
		if (cancelledRef.current || gen !== workspaceGenRef.current) return;
		await importOpenIssues(1);
	}

	async function handlePickDirectory(): Promise<void> {
		setWorkspaceMenuOpen(false);
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

	async function handleSubmit(promptText: string): Promise<void> {
		const current = stateRef.current;
		if (!promptText || current === null) return;
		await persist(
			addManualTask(current, {
				id: crypto.randomUUID(),
				promptText,
				now: Date.now(),
				cwd: resolveWorkspaceCwd(current.workspace, conversation.cwd),
			}),
		);
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
		setExpandedId(null);
	}

	async function handleSaveEdit(promptText: string): Promise<void> {
		const current = stateRef.current;
		if (!current || !editingId) return;
		if (!promptText) return;
		const next = updateTaskPrompt(current, { taskId: editingId, promptText, now: Date.now() });
		setEditingId(null);
		await persist(next);
	}

	function handleCancelEdit(): void {
		setEditingId(null);
	}

	function requestDelete(task: GithubTask): void {
		if (task.source.kind !== "manual" || task.status === "running") return;
		setEditingId(null);
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
		}
		if (expandedId === taskId) setExpandedId(null);
		setPendingDeleteId(null);
		await persist(removeTask(current, taskId));
	}

	function requestRun(task: GithubTask, trigger: HTMLButtonElement): void {
		if (task.status !== "pending") return;
		setPendingDeleteId(null);
		setEditingId(null);
		runTriggerRef.current = trigger;
		setSkillQuery("");
		setIncludeComments(false);
		setPendingRunId(task.id);
	}

	function cancelRun(): void {
		setPendingRunId(null);
	}

	function withLiveAutoAdvance(fromRun: PluginState): PluginState {
		const latest = stateRef.current;
		return latest ? { ...fromRun, autoAdvance: latest.autoAdvance } : fromRun;
	}

	async function persistFromRun(fromRun: PluginState): Promise<void> {
		await persist(withLiveAutoAdvance(fromRun));
	}

	async function promptTextForRun(task: GithubTask | undefined, withComments: boolean): Promise<string | undefined> {
		if (!task || task.source.kind !== "issue" || !withComments) return undefined;
		const result = await fetchIssueComments(
			ctx.network,
			task.source.owner,
			task.source.repo,
			task.source.issueNumber,
			ctx.command,
		);
		if (githubFetchError(result) || !("items" in result)) {
			ctx.ui.notify({ message: t("board.error.commentsFallback") });
			return undefined;
		}
		return buildIssueRunPrompt({
			title: task.title,
			url: task.source.issueUrl,
			body: task.body ?? "",
			comments: result.items,
			commitInstruction: ISSUE_COMMIT_INSTRUCTION,
			includeComments: true,
		});
	}

	async function handleRun(taskId: string, skill: string | null): Promise<void> {
		const opened = stateRef.current;
		if (!opened || inflightRef.current || pendingRunId !== taskId) return;
		const withComments = includeComments;
		setPendingRunId(null);
		inflightRef.current = true;
		try {
			let currentId: string | null = taskId;
			let snapshot = opened;
			while (currentId && !cancelledRef.current) {
				const task = snapshot.tasks.find((item) => item.id === currentId);
				const sendPromptText = await promptTextForRun(task, withComments);
				if (cancelledRef.current) return;
				const controller = new AbortController();
				abortRef.current = controller;
				try {
					const result = await runQueuedTask({
						state: snapshot,
						taskId: currentId,
						sessions: boardSessions(ctx),
						cwd: resolveWorkspaceCwd(snapshot.workspace, conversation.cwd),
						now: () => Date.now(),
						persist: persistFromRun,
						skill,
						sendPromptText,
						signal: controller.signal,
						stoppedError: t("board.error.stopped"),
					});
					const merged = withLiveAutoAdvance(result.state);
					if (!cancelledRef.current) setState(merged);
					if (result.notice === "no-project") {
						ctx.ui.notify({ message: t("board.error.noProject") });
						break;
					}
					const finished = merged.tasks.find((item) => item.id === currentId);
					if (!finished || finished.status === "pending") break;
					const next = selectAutoAdvanceTask(merged, {
						cwd: resolveWorkspaceCwd(merged.workspace, conversation.cwd),
						finishedTaskId: currentId,
						notice: result.notice,
					});
					if (!next) break;
					snapshot = merged;
					currentId = next.id;
				} finally {
					if (abortRef.current === controller) abortRef.current = null;
				}
			}
		} finally {
			if (!cancelledRef.current) setStoppingId(null);
			inflightRef.current = false;
		}
	}

	async function handleRetry(taskId: string): Promise<void> {
		const current = stateRef.current;
		if (!current) return;
		await persist(retryFailedTask(current, taskId, Date.now()));
	}

	function handleStop(taskId: string): void {
		if (stoppingId) return;
		setStoppingId(taskId);
		abortRef.current?.abort();
	}

	async function handleOpenSession(sessionPath: string): Promise<void> {
		const cwd = state ? resolveWorkspaceCwd(state.workspace, conversation.cwd) : conversation.cwd;
		if (!cwd) {
			ctx.ui.notify({ message: t("board.error.noProject") });
			return;
		}
		try {
			await ctx.official.sessions.open({ cwd, sessionPath });
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
			<div ref={workspaceMenuRef} className="relative flex flex-wrap items-center gap-2">
				<button
					aria-expanded={workspaceMenuOpen}
					aria-haspopup="menu"
					aria-label={t("board.workspace.label")}
					className={`flex h-7 max-w-[16rem] min-w-0 items-center gap-1.5 rounded-lg bg-card px-2.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 ${
						workspaceMenuOpen ? "bg-accent text-foreground" : "text-foreground hover:bg-accent"
					} ${workspace.kind === "conversation" && !conversation.cwd ? "text-muted-foreground/80 hover:text-foreground" : ""}`}
					disabled={!ready}
					type="button"
					onClick={() => {
						setPendingRunId(null);
						setWorkspaceMenuOpen((open) => !open);
					}}
				>
					<span className={`${workspaceTriggerIcon} h-3.5 w-3.5 shrink-0`} aria-hidden />
					<span className="min-w-0 truncate">{workspaceTriggerName}</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0 opacity-70" aria-hidden />
				</button>
				{workspaceMenuOpen ? (
					<div
						className="absolute left-0 top-full z-50 mt-1.5 w-[228px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
						role="menu"
					>
						<button
							className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12px] font-medium transition-colors ${
								selectedWorkspaceValue === "conversation"
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-foreground"
							}`}
							role="menuitem"
							type="button"
							onClick={() => void applyWorkspace(CONVERSATION_WORKSPACE)}
						>
							<span className="icon-[solar--chat-round-line-linear] h-3.5 w-3.5 shrink-0" aria-hidden />
							<span className="min-w-0 truncate">
								{conversation.cwd
									? t("board.workspace.conversation", { path: conversation.cwd })
									: t("board.workspace.conversationNone")}
							</span>
							{selectedWorkspaceValue === "conversation" ? (
								<span className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
							) : null}
						</button>
						{workbench.map((project) => {
							const value = `path:${project.path}`;
							const name = project.name?.trim() || pathBasename(project.path);
							const selected = selectedWorkspaceValue === value;
							return (
								<button
									className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12px] font-medium transition-colors ${
										selected ? "bg-accent text-foreground" : "text-foreground hover:bg-accent"
									}`}
									key={project.path}
									role="menuitem"
									title={project.path}
									type="button"
									onClick={() => void applyWorkspace({ kind: "path", path: project.path })}
								>
									<span className="icon-[solar--folder-linear] h-3.5 w-3.5 shrink-0" aria-hidden />
									<span className="min-w-0 truncate">{name}</span>
									{selected ? (
										<span
											className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5 shrink-0 text-primary"
											aria-hidden
										/>
									) : null}
								</button>
							);
						})}
						{extraPath ? (
							<button
								className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12px] font-medium transition-colors ${
									selectedWorkspaceValue === `path:${extraPath}`
										? "bg-accent text-foreground"
										: "text-foreground hover:bg-accent"
								}`}
								role="menuitem"
								title={extraPath}
								type="button"
								onClick={() => void applyWorkspace({ kind: "path", path: extraPath })}
							>
								<span className="icon-[solar--folder-linear] h-3.5 w-3.5 shrink-0" aria-hidden />
								<span className="min-w-0 truncate">{pathBasename(extraPath)}</span>
								{selectedWorkspaceValue === `path:${extraPath}` ? (
									<span
										className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5 shrink-0 text-primary"
										aria-hidden
									/>
								) : null}
							</button>
						) : null}
						<div className="mt-1 border-t border-border pt-1">
							<button
								className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
								disabled={!ready}
								role="menuitem"
								type="button"
								onClick={() => void handlePickDirectory()}
							>
								<span className="icon-[solar--folder-open-linear] h-3.5 w-3.5 shrink-0" aria-hidden />
								<span className="min-w-0 truncate">{t("board.workspace.pickDirectory")}</span>
							</button>
						</div>
					</div>
				) : null}
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
				<BoardSelect
					disabled={!ready || fetching}
					label={t("board.fetch.assignee")}
					triggerIcon="icon-[solar--user-circle-linear]"
					value={state?.fetchFilter.assignee ?? "any"}
					options={[
						{ value: "any", label: t("board.fetch.assignee.any") },
						{ value: "me", label: t("board.fetch.assignee.me") },
					]}
					onChange={(assignee) => {
						void persistFetchFilter(assignee, labelDraftRef.current);
					}}
				/>
				<label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
					{t("board.fetch.label")}
					<input
						className={COMPACT_FIELD}
						disabled={!ready || fetching}
						value={fetchLabelValue}
						onBlur={() => {
							void persistFetchFilter(stateRef.current?.fetchFilter.assignee ?? "any", labelDraftRef.current);
						}}
						onChange={(event) => {
							setLabelDraft(event.target.value);
						}}
					/>
				</label>
				<button className={COMPACT_PRIMARY} disabled={!canFetch} type="submit">
					{t("board.fetch")}
				</button>
			</form>
			{fetchNotice ? <p className="text-xs text-muted-foreground">{fetchNotice}</p> : null}
			<TaskDraftComposer
				ctx={ctx}
				disabled={!ready}
				sourceLabel={t("board.taskInput.label")}
				sourcePlaceholder={t("board.taskInput.placeholder")}
				submitLabel={t("board.add")}
				onSubmit={handleSubmit}
			/>
			<div className="flex flex-wrap items-end gap-2">
				{boardTasks.length > 0 ? (
					<>
						<label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
							{t("board.filter.search")}
							<input
								className={FIELD}
								placeholder={t("board.filter.search")}
								type="search"
								value={filterQuery}
								onChange={(event) => setFilterQuery(event.target.value)}
							/>
						</label>
						<BoardSelect
							label={t("board.filter.status")}
							triggerIcon="icon-[solar--flag-linear]"
							value={filterStatus}
							options={STATUS_FILTER_VALUES.map((status) => ({
								value: status,
								label: status === "all" ? t("board.filter.status.all") : t(`board.status.${status}`),
							}))}
							onChange={setFilterStatus}
						/>
						<BoardSelect
							label={t("board.filter.label")}
							triggerIcon="icon-[solar--tag-linear]"
							value={filterLabel}
							options={labelSelectOptions(labelOptions, filterLabel, t("board.filter.label.all"))}
							onChange={setFilterLabel}
						/>
					</>
				) : null}
				<label className="flex items-center gap-2 pb-1 text-xs font-medium text-foreground">
					<input
						checked={state?.autoAdvance === true}
						className="size-3.5 accent-[var(--primary)]"
						disabled={!ready}
						type="checkbox"
						onChange={(event) => {
							const current = stateRef.current;
							if (!current) return;
							void persist(setAutoAdvance(current, event.target.checked));
						}}
					/>
					{t("board.autoAdvance")}
				</label>
			</div>
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
						{boardTasks.length === 0 ? (
							<tr>
								<td className="py-6 text-sm text-muted-foreground" colSpan={6}>
									{emptyQueueMessage()}
								</td>
							</tr>
						) : visibleTasks.length === 0 ? (
							<tr>
								<td className="py-6 text-sm text-muted-foreground" colSpan={6}>
									{t("board.empty.filtered")}
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
												<div className="flex flex-wrap items-center gap-1">
													<span
														className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[task.status]}`}
													>
														{t(`board.status.${task.status}`)}
													</span>
													{task.source.kind === "issue" ? (
														<span
															className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium ${ISSUE_STATE_BADGE[task.source.issueState ?? "open"]}`}
														>
															{t(`board.issue.state.${task.source.issueState ?? "open"}`)}
														</span>
													) : null}
													{task.status === "failed" && task.error ? (
														<span className="ml-0.5 text-xs text-destructive">{task.error}</span>
													) : null}
												</div>
											</td>
											<td className="py-2">
												<div className="flex flex-wrap items-center gap-1.5">
													{task.status === "running" ? (
														<button
															className={ACTION_BUTTON}
															disabled={!ready || stoppingId === task.id}
															type="button"
															onClick={() => handleStop(task.id)}
														>
															{t("board.stop")}
														</button>
													) : (
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
													)}
													{task.status === "failed" ? (
														<button
															className={ACTION_BUTTON}
															disabled={!ready || busy || editingId === task.id}
															type="button"
															onClick={() => void handleRetry(task.id)}
														>
															{t("board.retry")}
														</button>
													) : null}
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
													<TaskDraftComposer
														key={task.id}
														ctx={ctx}
														disabled={!ready}
														initialValue={task.promptText}
														sourceLabel={t("board.taskEdit.label")}
														submitLabel={t("board.save")}
														onCancel={handleCancelEdit}
														onSubmit={handleSaveEdit}
													/>
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
					className="z-50 flex max-h-[min(24rem,calc(100vh-16px))] w-64 min-w-[14rem] flex-col gap-0.5 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
					style={{
						position: "fixed",
						top: runMenuPos?.top ?? 0,
						left: runMenuPos?.left ?? 0,
						visibility: runMenuPos ? "visible" : "hidden",
					}}
					onWheel={(event) => event.stopPropagation()}
				>
					{pendingRunTask?.source.kind === "issue" ? (
						<label className={`${RUN_MENU_ITEM} flex shrink-0 items-center gap-2`}>
							<input
								checked={includeComments}
								className="size-3.5 accent-[var(--primary)]"
								type="checkbox"
								onChange={(event) => setIncludeComments(event.target.checked)}
							/>
							{t("board.run.includeComments")}
						</label>
					) : null}
					{runSkills.length > 0 ? (
						<input
							aria-label={t("board.run.search")}
							autoComplete="off"
							className={`${FIELD} shrink-0 text-xs`}
							placeholder={t("board.run.search")}
							spellCheck={false}
							type="search"
							value={skillQuery}
							onChange={(event) => setSkillQuery(event.target.value)}
						/>
					) : null}
					<button
						className={`${RUN_MENU_ITEM} shrink-0`}
						disabled={!ready || busy}
						type="button"
						onClick={() => void handleRun(pendingRunId, null)}
					>
						{t("board.run.direct")}
					</button>
					{runSkills.length > 0 ? (
						<div
							aria-label={t("board.run.skills")}
							className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
							role="region"
						>
							{visibleRunSkills.map((skill) => (
								<button
									className={`${RUN_MENU_ITEM} w-full`}
									disabled={!ready || busy}
									key={skill.name}
									type="button"
									onClick={() => void handleRun(pendingRunId, skill.name)}
								>
									{t("board.run.withSkill", { name: skill.alias ?? skill.name })}
								</button>
							))}
							{visibleRunSkills.length === 0 ? (
								<p className="px-2.5 py-1.5 text-xs text-muted-foreground">{t("board.run.noMatch")}</p>
							) : null}
						</div>
					) : null}
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

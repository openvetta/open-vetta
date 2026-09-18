import {
	useActiveConversation,
	type PluginContext,
	type PluginOfficialProjectEntry,
} from "@vetta-org/plugin-sdk";
import { type JSX, useEffect, useRef, useState } from "react";
import {
	resolveGithubRepoFromProject,
	type ResolveGithubRepoError,
} from "./git-remote";
import {
	fetchOpenGithubIssues,
	githubFetchError,
	ISSUE_COMMIT_INSTRUCTION,
	mapGithubIssueItems,
	type GithubFetchErrorKind,
} from "./github-issues";
import { runQueuedTask } from "./run-task";
import {
	addIssueTasks,
	addManualTask,
	hasRunningTask,
	loadPluginState,
	savePluginState,
	type GithubTaskStatus,
	type PluginState,
} from "./state";
import {
	CONVERSATION_WORKSPACE,
	extraWorkspacePath,
	parseWorkspaceSelectValue,
	pathBasename,
	resolveWorkspaceCwd,
	tasksVisibleForRepo,
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

export function BoardView({ ctx }: { ctx: PluginContext }): JSX.Element {
	const [state, setState] = useState<PluginState | null>(null);
	const [draft, setDraft] = useState("");
	const [owner, setOwner] = useState("");
	const [repo, setRepo] = useState("");
	const [fetching, setFetching] = useState(false);
	const [workbench, setWorkbench] = useState<PluginOfficialProjectEntry[]>([]);
	const conversation = useActiveConversation();
	const cancelledRef = useRef(false);
	const inflightRef = useRef(false);
	const workspaceGenRef = useRef(0);
	const stateRef = useRef(state);
	stateRef.current = state;
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
	const visibleTasks = tasksVisibleForRepo(state?.tasks ?? [], state?.repoTarget ?? null);

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

	async function persist(next: PluginState): Promise<void> {
		if (!cancelledRef.current) setState(next);
		await savePluginState(ctx.storage, next);
	}

	async function applyWorkspace(next: WorkspaceSource): Promise<void> {
		const current = stateRef.current;
		if (!current) return;
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
		setOwner(resolved.target.owner);
		setRepo(resolved.target.repo);
		const latest = stateRef.current ?? withWorkspace;
		await persist({ ...latest, repoTarget: resolved.target });
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
		if (!promptText || state === null) return;
		const next = addManualTask(state, { id: crypto.randomUUID(), promptText, now: Date.now() });
		setDraft("");
		await persist(next);
	}

	async function handleFetch(): Promise<void> {
		if (state === null || fetching) return;
		setFetching(true);
		try {
			let ownerName = owner.trim();
			let repoName = repo.trim();
			if (!ownerName || !repoName) {
				const resolved = await resolveGithubRepoFromProject({
					command: ctx.command,
					cwd: resolveWorkspaceCwd(state.workspace, conversation.cwd),
				});
				if (!resolved.ok) {
					ctx.ui.notify({ message: t(RESOLVE_ERROR_KEY[resolved.error]) });
					return;
				}
				ownerName = resolved.target.owner;
				repoName = resolved.target.repo;
				setOwner(ownerName);
				setRepo(repoName);
			}
			const withTarget = { ...state, repoTarget: { owner: ownerName, repo: repoName } };
			await persist(withTarget);
			const result = await fetchOpenGithubIssues(ctx.network, ownerName, repoName, ctx.command);
			const fetchError = githubFetchError(result);
			if (fetchError) {
				ctx.ui.notify({ message: t(FETCH_ERROR_KEY[fetchError]), variant: "error" });
				return;
			}
			if (typeof result !== "object" || result === null || !("items" in result)) return;
			await persist(
				addIssueTasks(
					withTarget,
					mapGithubIssueItems(result.items, {
						owner: ownerName,
						repo: repoName,
						now: Date.now(),
						createId: () => crypto.randomUUID(),
						commitInstruction: ISSUE_COMMIT_INSTRUCTION,
					}),
				),
			);
		} finally {
			if (!cancelledRef.current) setFetching(false);
		}
	}

	async function handleRun(taskId: string): Promise<void> {
		if (state === null || inflightRef.current) return;
		inflightRef.current = true;
		try {
			const result = await runQueuedTask({
				state,
				taskId,
				conversation: ctx.conversation,
				cwd: resolveWorkspaceCwd(state.workspace, conversation.cwd),
				now: () => Date.now(),
				persist,
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
							<th className="py-2 pr-3 font-medium">{t("board.queue.source")}</th>
							<th className="py-2 pr-3 font-medium">{t("board.queue.status")}</th>
							<th className="py-2 font-medium">{t("board.queue.actions")}</th>
						</tr>
					</thead>
					<tbody>
						{visibleTasks.map((task) => (
							<tr key={task.id} className="border-b border-border/50">
								<td className="py-2 pr-3 text-foreground">
									{task.source.kind === "issue" ? (
										<>
											<span className="mr-1.5 text-muted-foreground tabular-nums">
												{t("board.issue.ref", { number: task.source.issueNumber })}
											</span>{" "}
											{task.title}
										</>
									) : (
										task.title
									)}
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
											className={ACTION_BUTTON}
											disabled={!ready || busy || task.status !== "pending"}
											type="button"
											onClick={() => void handleRun(task.id)}
										>
											{t("board.run")}
										</button>
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
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

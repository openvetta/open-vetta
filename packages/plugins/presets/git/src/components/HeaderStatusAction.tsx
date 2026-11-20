import type { PluginHeaderActionContext, PluginHeaderActionState } from "@vetta-org/plugin-sdk";
import { useTranslation } from "@vetta-org/plugin-sdk";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@vetta-org/ui";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { resolveDiffScope } from "../git/aiContext";
import { generateCommitMessage } from "../git/aiMessage";
import { planCommit } from "../git/commitFlow";
import { loadDraft, saveDraft } from "../git/draftStore";
import {
	ensureHeaderRepoStatus,
	getHeaderRepoCwd,
	peekHeaderRepoStatus,
	setHeaderRepoCwd,
	subscribeHeaderRepoStatus,
} from "../git/headerStatus";
import { listBranches } from "../git/log";
import { parseStatus } from "../git/parseStatus";
import { preflightPush } from "../git/publish";
import {
	checkoutBranch,
	currentBranch,
	gitCommit,
	gitFetch,
	gitPublishBranch,
	gitPull,
	gitPush,
	resolveRepoRoot,
	statusPorcelain,
} from "../git/run";
import { emitRefreshSignal, notifyError, onRefreshSignal, openPanel } from "../git/runtime";
import type { BranchRef, StatusGroups } from "../git/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { BranchIcon, CommitIcon, FetchIcon, PullIcon, PushIcon, SparkleIcon } from "./icons";
import { useGitSettings } from "./useGitSettings";

const DRAFT_SAVE_DEBOUNCE_MS = 500;

/**
 * 顶栏上的 Git 状态：分支名 + 未提交文件数（有冲突时改显示冲突数）。
 *
 * 它不是一个「入口」，而是把「我在哪个分支、有多少东西没提交」这两个随时想知道的事实
 * 摊在顶栏上；点开的气泡做最常做的那几件事（切分支、写消息提交、拉/推），不需要打开活动面板。
 */
export function useGitHeaderAction(context: PluginHeaderActionContext): PluginHeaderActionState | null {
	const { t } = useTranslation();
	const cwd = context.cwd;
	const status = useSyncExternalStore(
		subscribeHeaderRepoStatus,
		() => (cwd ? peekHeaderRepoStatus(cwd) : undefined),
		() => undefined,
	);

	// 记住 cwd 给气泡用（气泡由宿主渲染，拿不到这里的闭包）。
	useEffect(() => {
		setHeaderRepoCwd(cwd);
	}, [cwd]);

	useEffect(() => {
		if (!cwd) return;
		ensureHeaderRepoStatus(cwd);
		const offRefresh = onRefreshSignal(() => ensureHeaderRepoStatus(cwd));
		// 用户在终端 / 编辑器里改了工作区：回到窗口时补一次。
		const onFocus = (): void => ensureHeaderRepoStatus(cwd);
		window.addEventListener("focus", onFocus);
		return () => {
			offRefresh();
			window.removeEventListener("focus", onFocus);
		};
	}, [cwd]);

	const title = useMemo(() => {
		if (!cwd) return t("header.title");
		if (!status) return t("header.title");
		const parts = [status.branch ?? t("header.detached")];
		if (status.conflict > 0) parts.push(t("header.conflicts", { count: status.conflict }));
		else if (status.files > 0) parts.push(t("header.changes", { count: status.files }));
		else parts.push(t("header.clean"));
		if (status.ahead > 0) parts.push(t("header.ahead", { count: status.ahead }));
		if (status.behind > 0) parts.push(t("header.behind", { count: status.behind }));
		return parts.join(" · ");
	}, [cwd, status, t]);

	// 没有项目、或这个目录不是仓库：不占顶栏名额（仓库初始化仍在活动面板里）。
	if (!cwd || !status) return null;

	const conflict = status.conflict > 0;
	return {
		title,
		label: status.branch ?? t("header.detached"),
		icon: <span className={conflict ? "icon-[solar--danger-triangle-bold]" : "icon-[mdi--source-branch]"} />,
		badge: conflict ? status.conflict : status.files > 0 ? status.files : undefined,
		// 红=冲突，蓝=有需要拉的东西；其余保持中性，不要把每个数字都染成警报。
		tone: conflict ? "danger" : status.behind > 0 ? "info" : undefined,
		promoteWhenActive: false,
		popover: {
			component: GitHeaderPanel,
			size: "md",
			title: t("header.panelTitle"),
		},
	};
}

/** 气泡里的工作区快照：只取提交与同步要用的那几项。 */
interface PanelState {
	root: string | null;
	groups: StatusGroups;
	branch: string | null;
	locals: BranchRef[];
	/** 首次解析结束（成功或失败）后为 true；此前不知道是不是仓库。 */
	loaded: boolean;
}

const EMPTY_GROUPS: StatusGroups = { conflict: [], staged: [], unstaged: [] };

/**
 * 顶栏气泡：分支 / 提交 / 同步三块，正好是「不想打开面板但要动一下 Git」的全部。
 * 会破坏历史或工作区的东西（丢弃、reset、amend）不在这里——它们需要文件列表作为上下文。
 */
export function GitHeaderPanel({ close }: { close: () => void }): JSX.Element {
	const { t } = useTranslation();
	const settings = useGitSettings();
	const cwd = getHeaderRepoCwd();
	// 顶栏那一格已经在展示仓库状态时才点得开，所以缓存里通常已有结论：拿它决定首帧长什么样，
	// 避免「先报不是仓库、再跳成正常界面」。
	const snapshot = cwd ? peekHeaderRepoStatus(cwd) : undefined;
	const [state, setState] = useState<PanelState>({
		root: null,
		groups: EMPTY_GROUPS,
		branch: snapshot?.branch ?? null,
		locals: [],
		loaded: false,
	});
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState<"commit" | "push" | "sync" | "branch" | null>(null);
	const [generating, setGenerating] = useState(false);
	const [pendingPublish, setPendingPublish] = useState<{ branch: string; remote: string } | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const hydratedRef = useRef(false);

	const reload = useCallback(() => {
		if (!cwd) return;
		void (async () => {
			const root = await resolveRepoRoot(cwd).catch(() => null);
			if (!root) {
				setState((previous) => ({ ...previous, root: null, loaded: true }));
				return;
			}
			const [raw, branch, locals] = await Promise.all([
				statusPorcelain(root).catch(() => ""),
				currentBranch(root).catch(() => null),
				listBranches(root, "local").catch(() => []),
			]);
			setState({ root, groups: parseStatus(raw), branch, locals, loaded: true });
		})();
	}, [cwd]);

	useEffect(() => {
		reload();
		return onRefreshSignal(reload);
	}, [reload]);

	// 与面板里的提交框同一份草稿：在这里写一半关掉，打开面板还看得到。
	useEffect(() => {
		let alive = true;
		hydratedRef.current = false;
		if (!state.root) return;
		void loadDraft(state.root).then((draft) => {
			if (!alive) return;
			setMessage(draft);
			hydratedRef.current = true;
		});
		return () => {
			alive = false;
		};
	}, [state.root]);

	useEffect(() => {
		const repoRoot = state.root;
		if (!repoRoot || !hydratedRef.current) return;
		const timer = setTimeout(() => void saveDraft(repoRoot, message), DRAFT_SAVE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [state.root, message]);

	const plan = planCommit(state.groups, message);
	const root = state.root;
	const cwdKey = cwd ?? root;

	const run = useCallback(
		(kind: "commit" | "push" | "sync" | "branch", task: () => Promise<void>) => {
			if (!root || busy) return;
			setBusy(kind);
			task()
				.then(() => {
					emitRefreshSignal();
					if (cwdKey) ensureHeaderRepoStatus(cwdKey);
				})
				.catch((err: unknown) => notifyError(t("commit.failed"), err))
				.finally(() => setBusy(null));
		},
		[busy, cwdKey, root, t],
	);

	/** 推之前先看是不是新分支；是就交给确认框，不偷偷写 upstream。 */
	const pushNow = useCallback(async (): Promise<void> => {
		if (!root) return;
		const pre = await preflightPush(root);
		if (pre.kind === "error") throw new Error(t(pre.key));
		if (pre.kind === "needs-publish") {
			setPendingPublish({ branch: pre.branch, remote: pre.remote });
			return;
		}
		await gitPush(root);
	}, [root, t]);

	const commit = useCallback(
		(push: boolean) => {
			if (!root || !plan.canCommit) return;
			run("commit", async () => {
				await gitCommit(root, message, { stageAll: plan.stageAll });
				setMessage("");
				await saveDraft(root, "");
				if (push) await pushNow();
			});
		},
		[message, plan.canCommit, plan.stageAll, pushNow, root, run],
	);

	const push = useCallback(() => {
		run("push", pushNow);
	}, [run, pushNow]);

	const fetch = useCallback(() => {
		run("sync", async () => {
			if (root) await gitFetch(root);
		});
	}, [run, root]);

	const pull = useCallback(() => {
		run("sync", async () => {
			if (root) await gitPull(root);
		});
	}, [run, root]);

	const sync = useCallback(() => {
		run("sync", async () => {
			if (!root) return;
			await gitFetch(root);
			await gitPull(root);
			await pushNow();
		});
	}, [run, pushNow, root]);

	const generate = useCallback(() => {
		if (!root || generating) return;
		const controller = new AbortController();
		abortRef.current = controller;
		setGenerating(true);
		void generateCommitMessage({
			root,
			scope: resolveDiffScope(state.groups.staged.length > 0),
			template: settings.messageTemplate,
			modelKey: settings.modelKey ?? undefined,
			signal: controller.signal,
			onDelta: (text) => setMessage(text),
		})
			.then((text) => setMessage(text))
			.catch((err: unknown) => {
				if (controller.signal.aborted) return;
				const raw = err instanceof Error ? err.message : String(err);
				if (raw === "empty-diff") notifyError(t("ai.emptyDiff"));
				else notifyError(t("ai.failed"), err);
			})
			.finally(() => {
				abortRef.current = null;
				setGenerating(false);
			});
	}, [generating, root, settings.messageTemplate, settings.modelKey, state.groups.staged.length, t]);

	const switchTo = useCallback(
		(name: string) => {
			if (!root) return;
			run("branch", async () => {
				await checkoutBranch(root, name);
			});
		},
		[root, run],
	);

	// 只有「确定不是仓库」才报不是仓库：首次解析还没回来时不能说这话，否则会先闪一句错误提示。
	if (!cwd || (state.loaded && !root) || snapshot === null) {
		return <p className="p-2 text-[12.5px] text-muted-foreground">{t("header.notRepo")}</p>;
	}
	// 顶栏缓存里没有结论（极少见）：先摆与真实内容同尺寸的骨架，避免气泡高度先小后大。
	if (!state.loaded && snapshot === undefined) {
		return (
			<div className="flex w-[min(88vw,22rem)] flex-col gap-2 p-1" aria-busy="true">
				<div className="h-7 w-24 rounded-md bg-foreground/[0.06]" />
				<div className="h-[88px] rounded-lg border border-border/70 bg-foreground/[0.03]" />
				<div className="flex gap-1.5">
					<div className="h-7 flex-1 rounded-md bg-foreground/[0.06]" />
					<div className="h-7 w-20 rounded-md bg-foreground/[0.06]" />
				</div>
				<div className="flex gap-1.5">
					<div className="h-7 w-16 rounded-md bg-foreground/[0.06]" />
					<div className="h-7 w-16 rounded-md bg-foreground/[0.06]" />
					<div className="h-7 w-16 rounded-md bg-foreground/[0.06]" />
				</div>
			</div>
		);
	}

	// root 还没解析出来的那一瞬：界面已经画好了，但所有动作都先按不可用处理，
	// 免得点了没反应，或这段输入的草稿被随后载入的草稿覆盖。
	const ready = root !== null;
	const disabledReason = !ready
		? null
		: plan.blocked === "conflict"
			? t("commit.blockedByConflicts")
			: plan.blocked === "empty"
				? t("commit.nothingToCommit")
				: null;
	const canCommit = ready && plan.canCommit && busy === null;

	return (
		<div className="flex w-[min(88vw,22rem)] flex-col gap-2 p-1 text-[12.5px] text-foreground">
			{/* 分支：一眼看到现在在哪，点开就能切 */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" disabled={!ready} className="h-7 justify-start gap-1.5 px-1.5 font-medium">
						<BranchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="max-w-[14rem] truncate">{state.branch ?? t("header.detached")}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-48">
					<DropdownMenuLabel>{t("branch.switch")}</DropdownMenuLabel>
					{state.locals.length === 0 ? <DropdownMenuItem disabled>{t("header.noBranches")}</DropdownMenuItem> : null}
					{state.locals.map((ref) => (
						<DropdownMenuItem
							key={ref.name}
							disabled={ref.name === state.branch}
							onSelect={() => switchTo(ref.name)}
						>
							{ref.name === state.branch ? <span className="icon-[solar--check-circle-linear] size-3.5" /> : null}
							<span className="truncate">{ref.name}</span>
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={() => {
							close();
							openPanel();
						}}
					>
						{t("header.openPanel")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* 提交：草稿与面板共用，写一半关掉不会丢 */}
			<div className="overflow-hidden rounded-lg border border-border/70 bg-background focus-within:ring-1 focus-within:ring-ring/40">
				<textarea
					value={message}
					readOnly={generating || !ready}
					onChange={(event) => setMessage(event.target.value)}
					onKeyDown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
							event.preventDefault();
							commit(false);
						}
					}}
					rows={3}
					placeholder={t("header.commitPlaceholder")}
					className="block max-h-40 min-h-[56px] w-full resize-none bg-transparent px-2 py-1.5 text-[12.5px] leading-relaxed outline-none placeholder:text-muted-foreground/50"
				/>
				<div className="flex items-center gap-1.5 px-1 pb-1">
					<button
						type="button"
						disabled={!ready || busy !== null || (!generating && state.groups.staged.length + state.groups.unstaged.length === 0)}
						title={generating ? t("ai.stop") : t("ai.generateHint")}
						onClick={() => (generating ? abortRef.current?.abort() : generate())}
						className="git-ai-accent inline-flex h-6 items-center gap-1 rounded-md px-1 text-[11.5px] font-medium outline-none disabled:opacity-50"
					>
						<SparkleIcon className="h-3 w-3 shrink-0" />
						<span className="git-ai-shimmer">{generating ? t("ai.stop") : t("ai.generate")}</span>
					</button>
					<span className="ml-auto text-[11px] text-muted-foreground">
						{!ready ? null : (disabledReason ?? t("header.files", { count: state.groups.staged.length + state.groups.unstaged.length }))}
					</span>
				</div>
			</div>

			<div className="flex items-center gap-1.5">
				<Button
					size="sm"
					disabled={!canCommit}
					title={disabledReason ?? undefined}
					onClick={() => commit(false)}
					className="h-7 flex-1 gap-1 bg-[#1f883d] text-white hover:bg-[#1a7f37] disabled:bg-[#1f883d]/35 disabled:text-white/60"
				>
					<CommitIcon className="h-3.5 w-3.5" />
					{plan.stageAll ? t("header.stageAllCommit") : settings.pushAfterCommit ? t("commit.andPush") : t("header.commit")}
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={!canCommit}
					title={disabledReason ?? undefined}
					onClick={() => commit(true)}
					className="h-7 shrink-0"
				>
					{t("header.commitAndPush")}
				</Button>
			</div>

			{/* 同步：fetch / pull 用相对计数，push 带上 ahead 数 */}
			<div className="flex items-center gap-1 border-t border-border/60 pt-1.5">
				<Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5" disabled={!ready || busy !== null} onClick={fetch}>
					<FetchIcon className="h-3.5 w-3.5" />
					{t("action.fetch")}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 px-1.5"
					disabled={!ready || busy !== null}
					onClick={pull}
				>
					<PullIcon className="h-3.5 w-3.5" />
					{t("action.pull")}
				</Button>
				<Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5" disabled={!ready || busy !== null} onClick={push}>
					<PushIcon className="h-3.5 w-3.5" />
					{t("action.push")}
				</Button>
				<Button variant="ghost" size="sm" className="ml-auto h-7 px-1.5 text-muted-foreground" disabled={!ready || busy !== null} onClick={sync}>
					{t("action.syncLabel")}
				</Button>
			</div>

			<ConfirmDialog
				open={pendingPublish !== null}
				title={t("publish.title")}
				description={
					pendingPublish ? t("publish.description", { branch: pendingPublish.branch, remote: pendingPublish.remote }) : undefined
				}
				confirmLabel={t("publish.confirm")}
				onCancel={() => setPendingPublish(null)}
				onConfirm={() => {
					const target = pendingPublish;
					if (!target || !root) return;
					setPendingPublish(null);
					run("push", () => gitPublishBranch(root, target.remote, target.branch));
				}}
			/>
		</div>
	);
}

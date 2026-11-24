import { useActivityTab, useTranslation } from "@vetta-org/plugin-sdk";
import { SegmentedControl } from "@vetta-org/theme-ui/plugin-ui";
import { Button } from "@vetta-org/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countChanges, parseStatus } from "../git/parseStatus";
import { initRepo, resolveRepoRoot, statusPorcelain } from "../git/run";
import { getGitCommand, invalidateGitTabProbe, onRefreshSignal } from "../git/runtime";
import { isGitAvailable } from "../git/tab-visibility";
import type { StatusGroups } from "../git/types";
import { DiffStat } from "./DiffStat";
import { GitChanges } from "./GitChanges";
import { GraphView } from "./graph/GraphView";
import { GitIcon, RefreshIcon } from "./icons";
import { InitRepoCta } from "./InitRepoCta";
import { NoGitCta } from "./NoGitCta";

type ViewTab = "changes" | "graph";

type State =
	| { kind: "loading" }
	| { kind: "no-cwd" }
	| { kind: "not-repo" }
	| { kind: "no-git" }
	| { kind: "ready"; root: string; groups: StatusGroups }
	| { kind: "error"; message: string };

export function GitPanel(): JSX.Element {
	const { cwd } = useActivityTab();
	const { t } = useTranslation();
	const [state, setState] = useState<State>({ kind: "loading" });
	const [view, setView] = useState<ViewTab>("changes");
	const [graphReloadToken, setGraphReloadToken] = useState(0);
	const loadIdRef = useRef(0);

	const load = useCallback(async (): Promise<void> => {
		const id = ++loadIdRef.current;
		if (!cwd) {
			setState({ kind: "no-cwd" });
			return;
		}
		try {
			const root = await resolveRepoRoot(cwd);
			if (id !== loadIdRef.current) return;
			if (!root) {
				// rev-parse 失败既可能是「不是仓库」，也可能是没装 git；后者给安装引导而不是「初始化仓库」。
				const available = await isGitAvailable(getGitCommand(), cwd);
				if (id !== loadIdRef.current) return;
				setState({ kind: available ? "not-repo" : "no-git" });
				return;
			}
			const raw = await statusPorcelain(root);
			if (id !== loadIdRef.current) return;
			setState({ kind: "ready", root, groups: parseStatus(raw) });
		} catch (err) {
			if (id !== loadIdRef.current) return;
			setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
		}
	}, [cwd]);

	// Initial + cwd change.
	useEffect(() => {
		setState({ kind: "loading" });
		void load();
	}, [load]);

	// Refresh on global signals (agent turn-end) and when the window regains focus.
	useEffect(() => {
		const off = onRefreshSignal(() => void load());
		const onFocus = (): void => void load();
		window.addEventListener("focus", onFocus);
		return () => {
			off();
			window.removeEventListener("focus", onFocus);
		};
	}, [load]);

	const handleInit = useCallback(async (): Promise<void> => {
		if (!cwd) return;
		await initRepo(cwd);
		// 仓库刚被初始化：标签卡要从未上栏的「+」池挪到栏上，探测结论必须重算。
		invalidateGitTabProbe(cwd);
		await load();
		await load();
	}, [cwd, load]);

	const count = state.kind === "ready" ? countChanges(state.groups) : null;

	const handleRefresh = useCallback(() => {
		if (view === "graph") setGraphReloadToken((n) => n + 1);
		else void load();
	}, [view, load]);

	// 视图切换与提交图的作用域切换共用宿主的 SegmentedControl，勾选滑块与宿主设置页一致。
	const viewItems = useMemo(
		() => [
			{ key: "changes" as ViewTab, label: t("view.tabChanges"), count: count ?? undefined },
			{ key: "graph" as ViewTab, label: t("view.tabGraph") },
		],
		[count, t],
	);

	return (
		<div className="flex h-full flex-col">
			{/*
			 * px-2 与下方内容列（提交卡片、分支行）对齐：分段控件的左缘正好压在分支下拉的
			 * 左缘上，右侧刷新键也与 diff 卡片的 mr-2 同一条线。
			 * 分段控件再加 h-7，与分支下拉（SelectTrigger size="sm"）等高——两个胶囊一上
			 * 一下，高度差 2px 就会读成两套控件。
			 */}
			<div className="flex h-9 shrink-0 items-center justify-between px-2">
				{state.kind === "ready" ? (
					<SegmentedControl items={viewItems} value={view} onChange={setView} className="h-7" />
				) : (
					<div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
						<GitIcon className="h-3.5 w-3.5 text-muted-foreground" />
						{t("panel.title")}
					</div>
				)}
				<div className="flex shrink-0 items-center gap-2">
					{/* 行数统计紧挨刷新键：这个数字是「截至刚才那次刷新」的快照。 */}
					{state.kind === "ready" && view === "changes" ? <DiffStat root={state.root} /> : null}
					<Button type="button" variant="ghost" size="icon-xs" onClick={handleRefresh} title={t("action.refresh")}>
						<RefreshIcon className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			{state.kind === "loading" && <div className="px-3 py-4 text-[12px] text-muted-foreground">{t("state.loading")}</div>}
			{state.kind === "no-cwd" && <div className="px-3 py-4 text-[12px] text-muted-foreground">{t("state.noCwd")}</div>}
			{state.kind === "error" && <div className="px-3 py-4 text-[12px] text-rose-500">{state.message}</div>}
			{state.kind === "not-repo" && <InitRepoCta onInit={handleInit} />}
			{state.kind === "no-git" && <NoGitCta onRecheck={load} />}
			{state.kind === "ready" &&
				(view === "graph" ? (
					<GraphView root={state.root} reloadToken={graphReloadToken} />
				) : (
					<GitChanges root={state.root} groups={state.groups} onOpenGraph={() => setView("graph")} />
				))}
		</div>
	);
}

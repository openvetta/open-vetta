import { useActivityTab } from "@vetta/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildTree } from "../git/buildTree";
import { initRepo, resolveRepoRoot, statusPorcelain } from "../git/run";
import { onRefreshSignal } from "../git/runtime";
import { parseStatus } from "../git/parseStatus";
import type { TreeNode } from "../git/types";
import { TreeNodes } from "./GitTree";
import { InitRepoCta } from "./InitRepoCta";
import { GitIcon, RefreshIcon } from "./icons";

type State =
	| { kind: "loading" }
	| { kind: "no-cwd" }
	| { kind: "not-repo" }
	| { kind: "ready"; root: string; nodes: TreeNode[]; count: number }
	| { kind: "error"; message: string };

export function GitPanel(): JSX.Element {
	const { cwd } = useActivityTab();
	const [state, setState] = useState<State>({ kind: "loading" });
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
				setState({ kind: "not-repo" });
				return;
			}
			const raw = await statusPorcelain(root);
			if (id !== loadIdRef.current) return;
			const entries = parseStatus(raw);
			setState({ kind: "ready", root, nodes: buildTree(entries), count: entries.length });
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
		await load();
	}, [cwd, load]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
				<div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
					<GitIcon className="h-3.5 w-3.5 text-muted-foreground" />
					变更
					{state.kind === "ready" && <span className="text-muted-foreground">{state.count}</span>}
				</div>
				<button
					type="button"
					onClick={() => void load()}
					className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					title="刷新"
				>
					<RefreshIcon className="h-3.5 w-3.5" />
				</button>
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
				{state.kind === "loading" && (
					<div className="px-3 py-4 text-[12px] text-muted-foreground">加载中…</div>
				)}
				{state.kind === "no-cwd" && (
					<div className="px-3 py-4 text-[12px] text-muted-foreground">没有可用的项目目录。</div>
				)}
				{state.kind === "error" && <div className="px-3 py-4 text-[12px] text-rose-500">{state.message}</div>}
				{state.kind === "not-repo" && <InitRepoCta onInit={handleInit} />}
				{state.kind === "ready" &&
					(state.count === 0 ? (
						<div className="px-3 py-4 text-[12px] text-muted-foreground">没有变更，工作区是干净的。</div>
					) : (
						<TreeNodes nodes={state.nodes} depth={0} root={state.root} />
					))}
			</div>
		</div>
	);
}

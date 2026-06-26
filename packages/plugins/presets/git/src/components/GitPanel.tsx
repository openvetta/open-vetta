import { useActivityTab } from "@vetta/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { initRepo, resolveRepoRoot, statusPorcelain } from "../git/run";
import { parseStatus } from "../git/parseStatus";
import { onRefreshSignal } from "../git/runtime";
import type { ChangeEntry } from "../git/types";
import { GitChanges } from "./GitChanges";
import { GitIcon, RefreshIcon } from "./icons";
import { InitRepoCta } from "./InitRepoCta";

type State =
	| { kind: "loading" }
	| { kind: "no-cwd" }
	| { kind: "not-repo" }
	| { kind: "ready"; root: string; entries: ChangeEntry[] }
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
			setState({ kind: "ready", root, entries: parseStatus(raw) });
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

	const count = state.kind === "ready" ? state.entries.length : null;

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
				<div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
					<GitIcon className="h-3.5 w-3.5 text-muted-foreground" />
					变更
					{count !== null && <span className="text-muted-foreground">{count}</span>}
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

			{state.kind === "loading" && <div className="px-3 py-4 text-[12px] text-muted-foreground">加载中…</div>}
			{state.kind === "no-cwd" && <div className="px-3 py-4 text-[12px] text-muted-foreground">没有可用的项目目录。</div>}
			{state.kind === "error" && <div className="px-3 py-4 text-[12px] text-rose-500">{state.message}</div>}
			{state.kind === "not-repo" && <InitRepoCta onInit={handleInit} />}
			{state.kind === "ready" &&
				(state.entries.length === 0 ? (
					<div className="px-3 py-4 text-[12px] text-muted-foreground">没有变更，工作区是干净的。</div>
				) : (
					<GitChanges root={state.root} entries={state.entries} />
				))}
		</div>
	);
}

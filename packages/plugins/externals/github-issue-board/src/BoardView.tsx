import type { PluginContext } from "@vetta-org/plugin-sdk";
import { type JSX, useEffect, useState } from "react";
import {
	addManualTask,
	loadPluginState,
	savePluginState,
	type GithubTaskStatus,
	type PluginState,
} from "./state";

const STATUS_BADGE: Record<GithubTaskStatus, string> = {
	pending: "bg-muted text-muted-foreground",
	running: "bg-primary/12 text-primary",
	completed: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
	failed: "bg-red-500/12 text-red-600 dark:text-red-400",
};

export function BoardView({ ctx }: { ctx: PluginContext }): JSX.Element {
	const [state, setState] = useState<PluginState | null>(null);
	const [draft, setDraft] = useState("");
	const t = ctx.i18n.t;
	const ready = state !== null;

	useEffect(() => {
		let cancelled = false;
		void loadPluginState(ctx.storage).then((loaded) => {
			if (!cancelled) setState(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, [ctx.storage]);

	async function handleSubmit(): Promise<void> {
		const promptText = draft.trim();
		if (!promptText || state === null) return;
		const next = addManualTask(state, { id: crypto.randomUUID(), promptText, now: Date.now() });
		setState(next);
		setDraft("");
		await savePluginState(ctx.storage, next);
	}

	return (
		<div className="flex h-full w-full flex-col gap-4 bg-background p-6">
			<h1 className="text-lg font-semibold text-foreground">{t("board.title")}</h1>
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
						className="min-h-[72px] w-full resize-y rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
						disabled={!ready}
						placeholder={t("board.taskInput.placeholder")}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
					/>
				</label>
				<button
					className="self-start rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
					disabled={!ready || draft.trim() === ""}
					type="submit"
				>
					{t("board.add")}
				</button>
			</form>
			<div className="min-h-0 flex-1 overflow-auto">
				<table className="w-full text-left text-sm">
					<thead>
						<tr className="border-b border-border text-muted-foreground">
							<th className="py-2 pr-3 font-medium">{t("board.queue.title")}</th>
							<th className="py-2 pr-3 font-medium">{t("board.queue.source")}</th>
							<th className="py-2 font-medium">{t("board.queue.status")}</th>
						</tr>
					</thead>
					<tbody>
						{(state?.tasks ?? []).map((task) => (
							<tr key={task.id} className="border-b border-border/50">
								<td className="py-2 pr-3 text-foreground">{task.title}</td>
								<td className="py-2 pr-3 text-muted-foreground">{t(`board.source.${task.source.kind}`)}</td>
								<td className="py-2">
									<span
										className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[task.status]}`}
									>
										{t(`board.status.${task.status}`)}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

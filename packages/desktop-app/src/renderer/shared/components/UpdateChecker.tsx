import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { Button } from "./ui/button";

export function UpdateChecker(): JSX.Element {
	const state = useAtomValue(updaterStateAtom);
	const openRestartDialog = useSetAtom(updaterRestartDialogOpenAtom);
	const [busy, setBusy] = useState(false);

	const handleCheck = async () => {
		setBusy(true);
		try {
			await window.vetta.updater.check();
		} finally {
			setBusy(false);
		}
	};

	const handlePrimary = async () => {
		if (state.phase === "available") {
			await window.vetta.updater.download();
			return;
		}
		if (state.phase === "ready") {
			openRestartDialog(true);
			return;
		}
	};

	const checking = busy || state.phase === "checking";
	const showStatus =
		state.phase === "idle" || state.phase === "error" || state.phase === "checking";

	const statusText = (() => {
		if (state.phase === "checking") return "正在检查...";
		if (state.phase === "error") return state.error;
		if (state.phase === "idle") return `当前已是最新版本（${state.currentVersion}）`;
		return "";
	})();
	const statusColor = state.phase === "error" ? "text-red-500" : "text-muted-foreground";

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<Button
					onClick={() => void handleCheck()}
					disabled={checking}
					className="h-8 rounded-lg px-3 text-[12px]"
				>
					{checking ? "检查中..." : "检查更新"}
				</Button>
				{showStatus && statusText && (
					<span className={`text-[12px] ${statusColor}`}>{statusText}</span>
				)}
			</div>

			{(state.phase === "available" || state.phase === "downloading" || state.phase === "ready") && (
				<div className="space-y-2 rounded-lg border border-border bg-secondary p-3">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<span className="text-[13px] font-medium text-foreground">
								新版本 {state.latestVersion}
							</span>
							<span className="ml-2 text-[12px] text-muted-foreground">
								(当前 {state.currentVersion})
							</span>
						</div>
						{state.phase === "available" && (
							<Button
								onClick={() => void handlePrimary()}
								className="h-7 rounded-lg px-3 text-[12px]"
							>
								下载更新
							</Button>
						)}
						{state.phase === "downloading" && (
							<span className="shrink-0 text-[12px] text-muted-foreground">
								下载中 {Math.round((state.progress ?? 0) * 100)}%
							</span>
						)}
						{state.phase === "ready" && (
							<Button
								onClick={() => void handlePrimary()}
								className="h-7 rounded-lg px-3 text-[12px]"
							>
								立即重启
							</Button>
						)}
					</div>
					{state.releaseNote && (
						<p className="whitespace-pre-wrap text-[12px] text-muted-foreground">
							{state.releaseNote}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

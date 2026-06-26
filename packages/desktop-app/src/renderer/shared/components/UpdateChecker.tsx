import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

export function UpdateChecker(): JSX.Element {
	const { t } = useTranslation("settings");
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
		if (state.phase === "checking") return t("updaterChecking");
		if (state.phase === "error") return state.error;
		if (state.phase === "idle") return t("updaterIdle", { version: state.currentVersion });
		return "";
	})();
	const statusColor = state.phase === "error" ? "text-red-500" : "text-muted-foreground";

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				{showStatus && statusText ? (
					<span className={`min-w-0 truncate text-[12px] ${statusColor}`}>{statusText}</span>
				) : (
					<span />
				)}
				<Button
					variant="secondary"
					onClick={() => void handleCheck()}
					disabled={checking}
					className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-[12px]"
				>
					<span
						className={`icon-[mdi--refresh] h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`}
					/>
					{checking ? t("updaterCheckingBtn") : t("updaterCheck")}
				</Button>
			</div>

			{(state.phase === "available" || state.phase === "downloading" || state.phase === "ready") && (
				<div className="space-y-2 rounded-lg border border-border bg-secondary p-3">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<span className="text-[13px] font-medium text-foreground">
								{t("updaterNewVersion", { version: state.latestVersion })}
							</span>
							<span className="ml-2 text-[12px] text-muted-foreground">
								{t("updaterCurrentVersion", { version: state.currentVersion })}
							</span>
						</div>
						{state.phase === "available" && (
							<Button
								variant="primary"
								onClick={() => void handlePrimary()}
								className="h-7 rounded-lg px-3 text-[12px]"
							>
								{t("updaterDownload")}
							</Button>
						)}
						{state.phase === "downloading" && (
							<span className="shrink-0 text-[12px] text-muted-foreground">
								{t("updaterDownloading", { progress: Math.round((state.progress ?? 0) * 100) })}
							</span>
						)}
						{state.phase === "ready" && (
							<Button
								variant="primary"
								onClick={() => void handlePrimary()}
								className="h-7 rounded-lg px-3 text-[12px]"
							>
								{t("updaterRestart")}
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

import { useState } from "react";
import { Button } from "./ui/button";

interface UpdateCheckResult {
	hasUpdate: boolean;
	currentVersion: string;
	latestVersion?: string;
	releaseNote?: string;
	downloadUrl?: string;
	error?: string;
}

export function UpdateChecker(): JSX.Element {
	const [checking, setChecking] = useState(false);
	const [result, setResult] = useState<UpdateCheckResult | null>(null);

	const handleCheck = async () => {
		setChecking(true);
		setResult(null);
		try {
			const res = await window.vetta.updater.check();
			setResult(res);
		} catch {
			setResult({ hasUpdate: false, currentVersion: "", error: "检查更新失败" });
		} finally {
			setChecking(false);
		}
	};

	const handleDownload = async () => {
		if (result?.downloadUrl) {
			await window.vetta.updater.download(result.downloadUrl);
		}
	};

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
				{result && !result.hasUpdate && !result.error && (
					<span className="text-[12px] text-[var(--text-2)]">
						当前已是最新版本 ({result.currentVersion})
					</span>
				)}
				{result?.error && (
					<span className="text-[12px] text-red-500">
						{result.error}
					</span>
				)}
			</div>

			{result?.hasUpdate && (
				<div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 space-y-2">
					<div className="flex items-center justify-between">
						<div>
							<span className="text-[13px] font-medium text-[var(--text-1)]">
								新版本 {result.latestVersion}
							</span>
							<span className="ml-2 text-[12px] text-[var(--text-2)]">
								(当前 {result.currentVersion})
							</span>
						</div>
						<Button
							onClick={() => void handleDownload()}
							className="h-7 rounded-lg px-3 text-[12px]"
						>
							下载更新
						</Button>
					</div>
					{result.releaseNote && (
						<p className="text-[12px] text-[var(--text-2)] whitespace-pre-wrap">
							{result.releaseNote}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

import { useCallback, useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { activeSessionAtom, filePreviewAtom } from "@shared/store/atoms";
import { pathBasename } from "@shared/lib/utils";
import type { RequestFileInfo } from "../../../../preload/api.js";

function formatTime(ts: number): string {
	try {
		const d = new Date(ts);
		return d.toLocaleTimeString("zh-CN", { hour12: false });
	} catch {
		return String(ts);
	}
}

function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return String(n);
}

export function RequestHistorySubTab({ cwd }: { cwd: string }): JSX.Element {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const setPreview = useSetAtom(filePreviewAtom);
	const [files, setFiles] = useState<RequestFileInfo[]>([]);
	const [loading, setLoading] = useState(false);

	const projectName = pathBasename(cwd);
	const sessionId = activeSession?.runtimeId ?? null;

	const loadData = useCallback(async () => {
		if (!projectName || !sessionId) {
			setFiles([]);
			return;
		}
		setLoading(true);
		try {
			const data = await window.vetta.debug.listRequestFiles(projectName, sessionId);
			setFiles(data);
		} catch {
			setFiles([]);
		} finally {
			setLoading(false);
		}
	}, [projectName, sessionId]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const handlePreview = useCallback(
		(file: RequestFileInfo) => {
			setPreview({ name: file.filename, path: file.path });
		},
		[setPreview],
	);

	const handleShowInFolder = useCallback((filePath: string) => {
		void window.vetta.shell.showItemInFolder(filePath);
	}, []);

	if (!sessionId) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-[12px] text-muted-foreground">
				{t("activityPanel.requestHistory.noSession")}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1">
				<span className="text-[11px] text-muted-foreground">
					{loading
						? t("activityPanel.requestHistory.loading")
						: t("activityPanel.requestHistory.requestCount", { count: files.length })}
				</span>
				<button
					type="button"
					onClick={() => void loadData()}
					className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					title={t("activityPanel.requestHistory.refresh")}
				>
					<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
				</button>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto">
				{files.length === 0 && !loading && (
					<div className="p-4 text-center text-[12px] text-muted-foreground">
						{t("activityPanel.requestHistory.empty")}
					</div>
				)}
				{files.map((file) => (
					<div
						key={file.filename}
						className="flex items-center gap-2 border-b border-border px-3 py-2 transition-colors hover:bg-secondary/50"
					>
						<button
							type="button"
							onClick={() => handlePreview(file)}
							className="flex min-w-0 flex-1 items-center gap-3 text-left"
						>
							<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
								{formatTime(file.timestamp)}
							</span>
							<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
								{file.model}
							</span>
							<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
								{formatTokens(file.inputTokens)}/{formatTokens(file.outputTokens)}
							</span>
						</button>
						<button
							type="button"
							onClick={() => handleShowInFolder(file.path)}
							className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							title={t("activityPanel.requestHistory.showInFolder")}
						>
							<span className="icon-[mdi--folder-open-outline] h-3.5 w-3.5" />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

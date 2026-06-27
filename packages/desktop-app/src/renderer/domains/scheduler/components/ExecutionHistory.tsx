import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { TaskExecutionRecord } from "@shared/store/atoms";
import { openSessionFnRef, scheduledRecordsVersionAtom } from "@shared/store/atoms";

interface ExecutionHistoryProps {
	taskId: string;
	/**
	 * 嵌入抽屉时去掉自带外框/标题，body 自适应填满父容器高度；
	 * 独立使用（旧布局）时保留卡片外观。
	 */
	embedded?: boolean;
}

export function ExecutionHistory({ taskId, embedded = false }: ExecutionHistoryProps): JSX.Element {
	const { t, i18n } = useTranslation("automation");
	const locale = i18n.language === "en" ? "en-US" : "zh-CN";
	const [records, setRecords] = useState<TaskExecutionRecord[]>([]);
	const [loading, setLoading] = useState(true);
	// 删除定时 session 会删掉对应执行记录并 +1，这里据此重新拉取。
	const recordsVersion = useAtomValue(scheduledRecordsVersionAtom);

	useEffect(() => {
		loadRecords();
	}, [taskId, recordsVersion]);

	useEffect(() => {
		const unsubscribe = window.vetta.scheduler.onTaskEvent((event) => {
			if (
				(event.type === "task.started" || event.type === "record.updated") &&
				event.taskId === taskId
			) {
				loadRecords();
			}
		});
		return unsubscribe;
	}, [taskId]);

	const loadRecords = async () => {
		setLoading(true);
		try {
			const loaded = await window.vetta.scheduler.getRecords(taskId);
			setRecords(loaded);
		} finally {
			setLoading(false);
		}
	};

	const handleOpenSession = (record: TaskExecutionRecord) => {
		if (record.sessionPath && record.cwd && openSessionFnRef.current) {
			void openSessionFnRef.current(record.cwd, record.sessionPath, record.executionMode);
		}
	};

	const body = (
		<>
			{loading ? (
					<div className="flex items-center justify-center py-10">
						<span className="icon-[mdi--loading] animate-spin text-lg text-muted-foreground/50" />
					</div>
				) : records.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-1 py-10 text-muted-foreground/50">
						<span className="icon-[mdi--inbox-outline] text-2xl" />
						<p className="text-xs">{t("history.empty")}</p>
					</div>
				) : (
					<div>
						{records.map((record, i) => (
							<div
								key={record.id}
								onClick={() => handleOpenSession(record)}
								className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent/50 ${
									i > 0 ? "border-t border-border" : ""
								}`}
							>
								{/* Status dot */}
								<StatusDot status={record.status} />

								{/* Content */}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="text-sm text-foreground">
											{formatTime(record.startedAt, locale)}
										</span>
										<StatusBadge status={record.status} t={t} />
										{record.durationMs != null && record.durationMs > 0 && (
											<span className="text-xs text-muted-foreground/50">
												{formatDuration(record.durationMs)}
											</span>
										)}
									</div>
									{(record.responsePreview || record.error) && (
										<p className={`mt-0.5 truncate text-xs ${record.error ? "text-red-400" : "text-muted-foreground/50"}`}>
											{record.error || record.responsePreview}
										</p>
									)}
								</div>

								{/* Navigate arrow */}
								{record.sessionPath && (
									<span className="icon-[mdi--chevron-right] text-[16px] text-muted-foreground/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
								)}
							</div>
						))}
					</div>
				)}
		</>
	);

	if (embedded) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
					<span className="icon-[mdi--history] text-sm text-muted-foreground/50" />
					<span className="text-[13px] font-medium text-foreground">{t("history.title")}</span>
					<span className="text-[11px] text-muted-foreground/40">{records.length}</span>
					<div className="flex-1" />
					<button
						type="button"
						onClick={loadRecords}
						title={t("history.refresh")}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-all duration-150 hover:bg-accent hover:text-muted-foreground active:scale-90"
					>
						<span className="icon-[mdi--refresh] text-sm" />
					</button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-xl border border-border">
			{/* ─── Header ─── */}
			<div className="flex items-center gap-2 border-b border-border px-4 py-3">
				<span className="icon-[mdi--history] text-sm text-muted-foreground/50" />
				<span className="text-sm font-medium text-foreground">{t("history.title")}</span>
				<div className="flex-1" />
				<button
					type="button"
					onClick={loadRecords}
					title={t("history.refresh")}
					className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-all duration-150 hover:bg-accent hover:text-muted-foreground active:scale-90"
				>
					<span className="icon-[mdi--refresh] text-sm" />
				</button>
			</div>

			{/* ─── Body ─── */}
			<div className="max-h-72 overflow-y-auto">{body}</div>
		</div>
	);
}

// ─── Helpers ───

function StatusDot({ status }: { status: TaskExecutionRecord["status"] }): JSX.Element {
	const colors: Record<TaskExecutionRecord["status"], string> = {
		success: "bg-green-500",
		failed: "bg-red-400",
		running: "bg-blue-400",
		aborted: "bg-yellow-500",
	};
	return (
		<div className="relative flex h-2 w-2 shrink-0">
			{status === "running" && (
				<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-50" />
			)}
			<span className={`relative inline-flex h-2 w-2 rounded-full ${colors[status]}`} />
		</div>
	);
}

function StatusBadge({
	status,
	t,
}: {
	status: TaskExecutionRecord["status"];
	t: TFunction<"automation">;
}): JSX.Element {
	const styles: Record<TaskExecutionRecord["status"], string> = {
		success: "text-green-500 bg-green-500/8",
		failed: "text-red-400 bg-red-400/8",
		running: "text-blue-400 bg-blue-400/8",
		aborted: "text-yellow-500 bg-yellow-500/8",
	};
	const labels: Record<TaskExecutionRecord["status"], string> = {
		success: t("history.success"),
		failed: t("history.failed"),
		running: t("history.running"),
		aborted: t("history.aborted"),
	};
	return (
		<span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}>
			{labels[status]}
		</span>
	);
}

function formatTime(timestamp: number, locale: string): string {
	return new Date(timestamp).toLocaleString(locale, {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

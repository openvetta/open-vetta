import { useEffect, useState } from "react";
import type { TaskExecutionRecord } from "@shared/store/atoms";
import { openSessionFnRef } from "@shared/store/atoms";

interface ExecutionHistoryProps {
	taskId: string;
}

export function ExecutionHistory({ taskId }: ExecutionHistoryProps): JSX.Element {
	const [records, setRecords] = useState<TaskExecutionRecord[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadRecords();
	}, [taskId]);

	useEffect(() => {
		const unsubscribe = window.vetta.scheduler.onTaskEvent((event) => {
			if (event.taskId === taskId && (event.type === "task.started" || event.type === "record.updated")) {
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
			void openSessionFnRef.current(record.cwd, record.sessionPath);
		}
	};

	return (
		<div className="overflow-hidden rounded-xl border border-[var(--border)]">
			{/* ─── Header ─── */}
			<div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
				<span className="icon-[mdi--history] text-sm text-[var(--text-3)]" />
				<span className="text-sm font-medium text-[var(--text-1)]">执行历史</span>
				<div className="flex-1" />
				<button
					type="button"
					onClick={loadRecords}
					title="刷新"
					className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-3)] transition-all duration-150 hover:bg-[var(--hover-strong)] hover:text-[var(--text-2)] active:scale-90"
				>
					<span className="icon-[mdi--refresh] text-sm" />
				</button>
			</div>

			{/* ─── Body ─── */}
			<div className="max-h-72 overflow-y-auto">
				{loading ? (
					<div className="flex items-center justify-center py-10">
						<span className="icon-[mdi--loading] animate-spin text-lg text-[var(--text-3)]" />
					</div>
				) : records.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-1 py-10 text-[var(--text-3)]">
						<span className="icon-[mdi--inbox-outline] text-2xl" />
						<p className="text-xs">暂无执行记录</p>
					</div>
				) : (
					<div>
						{records.map((record, i) => (
							<div
								key={record.id}
								onClick={() => handleOpenSession(record)}
								className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[var(--hover)] ${
									i > 0 ? "border-t border-[var(--border)]" : ""
								}`}
							>
								{/* Status dot */}
								<StatusDot status={record.status} />

								{/* Content */}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="text-sm text-[var(--text-1)]">
											{formatTime(record.startedAt)}
										</span>
										<StatusBadge status={record.status} />
										{record.durationMs != null && record.durationMs > 0 && (
											<span className="text-xs text-[var(--text-3)]">
												{formatDuration(record.durationMs)}
											</span>
										)}
									</div>
									{(record.responsePreview || record.error) && (
										<p className={`mt-0.5 truncate text-xs ${record.error ? "text-red-400" : "text-[var(--text-3)]"}`}>
											{record.error || record.responsePreview}
										</p>
									)}
								</div>

								{/* Navigate arrow */}
								{record.sessionPath && (
									<span className="icon-[mdi--chevron-right] text-[16px] text-[var(--text-3)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
								)}
							</div>
						))}
					</div>
				)}
			</div>
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

function StatusBadge({ status }: { status: TaskExecutionRecord["status"] }): JSX.Element {
	const styles: Record<TaskExecutionRecord["status"], string> = {
		success: "text-green-500 bg-green-500/8",
		failed: "text-red-400 bg-red-400/8",
		running: "text-blue-400 bg-blue-400/8",
		aborted: "text-yellow-500 bg-yellow-500/8",
	};
	const labels: Record<TaskExecutionRecord["status"], string> = {
		success: "成功",
		failed: "失败",
		running: "执行中",
		aborted: "已中止",
	};
	return (
		<span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}>
			{labels[status]}
		</span>
	);
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString("zh-CN", {
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

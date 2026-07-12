import { useTranslation } from "react-i18next";
import type { ExecutionHistoryRecordModel } from "../hooks/useExecutionHistoryModel";

export type ExecutionHistoryStatus = ExecutionHistoryRecordModel["status"];

export interface ExecutionHistoryViewProps {
	readonly embedded?: boolean;
	readonly isLoading: boolean;
	readonly records: readonly ExecutionHistoryRecordModel[];
	readonly onOpenRecord: (record: ExecutionHistoryRecordModel["record"]) => void;
	readonly onRefresh: () => void;
}

export function ExecutionHistoryView({
	embedded = false,
	isLoading,
	records,
	onOpenRecord,
	onRefresh,
}: ExecutionHistoryViewProps): JSX.Element {
	const { t } = useTranslation("automation");
	const body = (
		<>
			{isLoading ? (
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
					{records.map((record, index) => (
						<div
							key={record.id}
							onClick={() => onOpenRecord(record.record)}
							className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent/50 ${
								index > 0 ? "border-t border-border" : ""
							}`}
						>
							<StatusDot status={record.status} />

							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="text-sm text-foreground">{record.startedAtLabel}</span>
									<StatusBadge status={record.status} label={record.statusLabel} />
									{record.durationLabel && (
										<span className="text-xs text-muted-foreground/50">{record.durationLabel}</span>
									)}
								</div>
								{record.preview && (
									<p className={`mt-0.5 truncate text-xs ${record.error ? "text-destructive" : "text-muted-foreground/50"}`}>
										{record.preview}
									</p>
								)}
							</div>

							{record.hasSession && (
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
				<ExecutionHistoryHeader count={records.length} compact onRefresh={onRefresh} />
				<div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-xl border border-border">
			<ExecutionHistoryHeader onRefresh={onRefresh} />
			<div className="max-h-72 overflow-y-auto">{body}</div>
		</div>
	);
}

function ExecutionHistoryHeader({
	compact = false,
	count,
	onRefresh,
}: {
	readonly compact?: boolean;
	readonly count?: number;
	readonly onRefresh: () => void;
}): JSX.Element {
	const { t } = useTranslation("automation");
	return (
		<div className={`flex items-center gap-2 border-b border-border/60 ${compact ? "px-4 py-2.5" : "px-4 py-3"}`}>
			<span className="icon-[mdi--history] text-sm text-muted-foreground/50" />
			<span className={`${compact ? "text-[13px]" : "text-sm"} font-medium text-foreground`}>
				{t("history.title")}
			</span>
			{count != null && <span className="text-[11px] text-muted-foreground/40">{count}</span>}
			<div className="flex-1" />
			<button
				type="button"
				onClick={onRefresh}
				title={t("history.refresh")}
				className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors duration-150 hover:bg-accent hover:text-muted-foreground active:scale-90"
			>
				<span className="icon-[mdi--refresh] text-sm" />
			</button>
		</div>
	);
}

function StatusDot({ status }: { readonly status: ExecutionHistoryStatus }): JSX.Element {
	const colors: Record<ExecutionHistoryStatus, string> = {
		success: "bg-emerald-500",
		failed: "bg-destructive",
		running: "bg-primary",
		aborted: "bg-amber-500",
	};
	return (
		<div className="relative flex h-2 w-2 shrink-0">
			{status === "running" && (
				<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
			)}
			<span className={`relative inline-flex h-2 w-2 rounded-full ${colors[status]}`} />
		</div>
	);
}

function StatusBadge({
	status,
	label,
}: {
	readonly status: ExecutionHistoryStatus;
	readonly label: string;
}): JSX.Element {
	const styles: Record<ExecutionHistoryStatus, string> = {
		success: "text-emerald-400 bg-emerald-500/15",
		failed: "text-destructive bg-destructive/10",
		running: "text-primary bg-primary/10",
		aborted: "text-amber-400 bg-amber-500/15",
	};
	return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}>{label}</span>;
}

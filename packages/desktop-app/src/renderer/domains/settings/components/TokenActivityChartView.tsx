import { cn } from "@shared/lib/utils";
import { useMemo, useState } from "react";
import {
	activityBlockCount,
	buildActivityColumns,
	formatTokenCount,
	TOKEN_ACTIVITY_MAX_ROWS,
	type TokenActivityMode,
	type UsageSeriesPointLike,
} from "./token-activity";

export interface TokenActivityChartViewProps {
	points: UsageSeriesPointLike[];
	loading?: boolean;
	labels: {
		title: string;
		daily: string;
		weekly: string;
		cumulative: string;
		empty: string;
		tokens: (count: string) => string;
		month: (yearMonth: string) => string;
	};
}

const MODES: TokenActivityMode[] = ["daily", "weekly", "cumulative"];

export function TokenActivityChartView({
	points,
	loading,
	labels,
}: TokenActivityChartViewProps): JSX.Element {
	const [mode, setMode] = useState<TokenActivityMode>("cumulative");
	const [hoverKey, setHoverKey] = useState<string | null>(null);

	const columns = useMemo(() => buildActivityColumns(points, mode), [points, mode]);
	const maxTokens = useMemo(() => Math.max(1, ...columns.map((c) => c.tokens)), [columns]);
	const hoverCol = hoverKey ? columns.find((c) => c.key === hoverKey) : null;
	const empty = columns.length === 0 || columns.every((c) => c.tokens === 0);

	const modeLabel = (m: TokenActivityMode): string => {
		if (m === "daily") return labels.daily;
		if (m === "weekly") return labels.weekly;
		return labels.cumulative;
	};

	return (
		<div className="rounded-xl border border-border/50 bg-card/40 p-4 backdrop-blur-sm">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h3 className="text-[13px] font-semibold text-foreground">{labels.title}</h3>
				<div className="flex rounded-lg border border-border/50 bg-muted/30 p-0.5">
					{MODES.map((m) => (
						<button
							key={m}
							type="button"
							onClick={() => setMode(m)}
							className={cn(
								"rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
								mode === m
									? "bg-background text-foreground ring-1 ring-inset ring-border/60"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{modeLabel(m)}
						</button>
					))}
				</div>
			</div>

			{loading ? (
				<div className="h-[132px] animate-pulse rounded-lg bg-muted/40" />
			) : empty ? (
				<div className="flex h-[132px] items-center justify-center text-[12px] text-muted-foreground">
					{labels.empty}
				</div>
			) : (
				<div className="relative">
					{hoverCol && (
						<div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-0.5 rounded-lg border border-border/60 bg-popover/95 px-2.5 py-1 text-[11px] text-popover-foreground">
							<span className="text-muted-foreground">
								{hoverCol.date === hoverCol.endDate
									? hoverCol.date
									: `${hoverCol.date} → ${hoverCol.endDate}`}
							</span>
							{" · "}
							{labels.tokens(formatTokenCount(hoverCol.tokens))}
						</div>
					)}

					<div
						className="overflow-x-auto pb-0.5 pt-5"
						onMouseLeave={() => setHoverKey(null)}
					>
						<div
							className="inline-flex min-w-full flex-col gap-1.5"
							style={{ minWidth: Math.max(columns.length * 10, 240) }}
						>
							<div className="flex items-end gap-[2px]">
								{columns.map((col) => {
									const filled = activityBlockCount(col.tokens, maxTokens);
									const active = hoverKey === col.key;
									return (
										<div
											key={col.key}
											className="flex flex-1 flex-col-reverse gap-[2px]"
											style={{ minWidth: 6, maxWidth: 14 }}
											onMouseEnter={() => setHoverKey(col.key)}
										>
											{Array.from({ length: TOKEN_ACTIVITY_MAX_ROWS }, (_, row) => {
												const isFilled = row < filled;
												return (
													<div
														key={row}
														className={cn(
															"aspect-square w-full rounded-[2px] transition-colors",
															isFilled
																? active
																	? "bg-primary"
																	: "bg-primary/75"
																: "bg-muted/50",
														)}
													/>
												);
											})}
										</div>
									);
								})}
							</div>

							<div className="relative mt-0.5 h-4">
								{columns.map((col, i) =>
									col.monthKey ? (
										<span
											key={col.key}
											className="absolute text-[10px] text-muted-foreground"
											style={{
												left: `${(i / Math.max(columns.length, 1)) * 100}%`,
											}}
										>
											{labels.month(col.monthKey)}
										</span>
									) : null,
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

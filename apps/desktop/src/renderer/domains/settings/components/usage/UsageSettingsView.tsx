import { Button } from "@shared/components/ui/button";
import { Calendar } from "@shared/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@shared/components/ui/popover";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { cn } from "@shared/lib/utils";
import { useState, type ReactNode } from "react";
import type { DateRange } from "react-day-picker";
import { SETTINGS_SECTION } from "../../registry";
import { dayKeyFromLocalDate, localDateFromDayKey, type UsageRangePreset } from "./usage-aggregation";
import { UsageHeatmap } from "./UsageHeatmap";
import { UsageShareChart } from "./UsageShareChart";
import { UsageTrendChart } from "./UsageTrendChart";
import type { UsageCardModel, UsageSettingsModel } from "./useUsageSettingsModel";

const CARD = "rounded-xl bg-card";

function Panel({
	id,
	title,
	aside,
	children,
	className,
}: {
	id: string;
	title: string;
	aside?: ReactNode;
	children: ReactNode;
	className?: string;
}): JSX.Element {
	return (
		<section aria-labelledby={id} className={cn(CARD, "p-4", className)} data-setting-section-highlight-target={id}>
			<div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
				<h2 id={id} className="text-[14px] font-semibold text-foreground">
					{title}
				</h2>
				{aside}
			</div>
			{children}
		</section>
	);
}

function StatCard({ card }: { card: UsageCardModel }): JSX.Element {
	return (
		<div className={cn(CARD, "px-3.5 pt-3 pb-3")}>
			<div className="text-[12px] text-muted-foreground">{card.label}</div>
			<div className="mt-1 text-[20px] font-semibold tabular-nums leading-tight text-foreground">{card.value}</div>
			<div className="mt-1 min-h-[16px] text-[11px] text-muted-foreground/80">{card.hint}</div>
		</div>
	);
}

function Swatch({ color }: { color: string }): JSX.Element {
	return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

function RangeToolbar({ model }: { model: UsageSettingsModel }): JSX.Element {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<DateRange | undefined>(undefined);
	const today = model.today ? localDateFromDayKey(model.today) : new Date();
	const openPicker = () => {
		setDraft(
			model.customRange
				? { from: localDateFromDayKey(model.customRange.start), to: localDateFromDayKey(model.customRange.end) }
				: undefined,
		);
		setOpen(true);
	};
	const onPresetChange = (preset: UsageRangePreset) => {
		if (preset === "custom") {
			openPicker();
			return;
		}
		model.actions.selectPreset(preset);
	};
	const onSelectRange = (range: DateRange | undefined) => {
		setDraft(range);
		if (range?.from && range.to) {
			model.actions.selectCustomRange({ start: dayKeyFromLocalDate(range.from), end: dayKeyFromLocalDate(range.to) });
			setOpen(false);
		}
	};
	const defaultMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
					<SegmentedControl items={model.presets} value={model.preset} onChange={onPresetChange} />
					<button
						type="button"
						onClick={openPicker}
						aria-label={model.labels.customRangeLabel}
						className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground tabular-nums transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[solar--calendar-linear] h-3.5 w-3.5" />
						<span>{model.rangeLabel}</span>
					</button>
				</div>
			</PopoverAnchor>
			<PopoverContent align="end" className="w-auto p-0">
				<Calendar
					mode="range"
					numberOfMonths={2}
					defaultMonth={draft?.from ?? defaultMonth}
					selected={draft}
					onSelect={onSelectRange}
					disabled={{ after: today }}
					locale={model.calendarLocale}
				/>
			</PopoverContent>
		</Popover>
	);
}

function UsageTable({ model }: { model: UsageSettingsModel }): JSX.Element {
	const { table } = model.labels;
	return (
		<div className="-mx-1 overflow-x-auto">
			<table className="w-full min-w-[520px] border-collapse text-[12px]">
				<thead>
					<tr className="text-left text-[11px] text-muted-foreground">
						<th className="px-1 pb-2 font-medium">{table.model}</th>
						<th className="px-1 pb-2 text-right font-medium">{table.requests}</th>
						<th className="px-1 pb-2 text-right font-medium">{table.input}</th>
						<th className="px-1 pb-2 text-right font-medium">{table.output}</th>
						<th className="px-1 pb-2 text-right font-medium">{table.cache}</th>
						<th className="px-1 pb-2 text-right font-medium">{table.total}</th>
						<th className="w-[96px] px-1 pb-2 font-medium">{table.share}</th>
					</tr>
				</thead>
				<tbody>
					{model.rows.map((row) => (
						<tr key={row.key} className="border-t border-border/40 transition-colors hover:bg-accent/40">
							<td className="max-w-[220px] px-1 py-2">
								<div className="flex min-w-0 items-center gap-2">
									<Swatch color={row.color} />
									<div className="min-w-0">
										<div className="truncate text-foreground" title={row.name}>
											{row.name}
										</div>
										{row.provider && (
											<div className="truncate text-[11px] text-muted-foreground">{row.provider}</div>
										)}
									</div>
								</div>
							</td>
							<td className="px-1 py-2 text-right tabular-nums text-muted-foreground">{row.requests}</td>
							<td className="px-1 py-2 text-right tabular-nums">{row.input}</td>
							<td className="px-1 py-2 text-right tabular-nums">{row.output}</td>
							<td className="px-1 py-2 text-right tabular-nums text-muted-foreground">{row.cache}</td>
							<td className="px-1 py-2 text-right font-medium tabular-nums text-foreground">{row.total}</td>
							<td className="px-1 py-2">
								<div className="flex items-center gap-2">
									<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/10">
										<div
											className="h-full rounded-full"
											style={{ width: `${Math.max(2, row.share * 100)}%`, background: row.color }}
										/>
									</div>
									<span className="w-[40px] text-right text-[11px] tabular-nums text-muted-foreground">
										{row.shareLabel}
									</span>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function StatusMessage({
	icon,
	title,
	description,
	action,
}: {
	icon: string;
	title: string;
	description?: string;
	action?: ReactNode;
}): JSX.Element {
	return (
		<div className={cn(CARD, "flex flex-col items-center px-6 py-14 text-center")}>
			<span className={cn(icon, "h-8 w-8 text-muted-foreground/60")} />
			<div className="mt-3 text-[14px] font-medium text-foreground">{title}</div>
			{description && <div className="mt-1 max-w-[360px] text-[12px] text-muted-foreground">{description}</div>}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}

function LoadingPlaceholder(): JSX.Element {
	return (
		<div aria-hidden="true" className="flex flex-col gap-4">
			<div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
				{Array.from({ length: 5 }, (_, index) => (
					<div key={index} className={cn(CARD, "h-[84px]")} />
				))}
			</div>
			<div className={cn(CARD, "h-[290px]")} />
		</div>
	);
}

export function UsageSettingsView({ model }: { model: UsageSettingsModel }): JSX.Element {
	const { labels } = model;
	return (
		<div className="mx-auto w-full max-w-[920px] px-8 pt-2 pb-8">
			<div className="mb-5 flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-[20px] font-bold text-foreground">{labels.title}</h1>
					<p className="mt-1 text-[12px] text-muted-foreground">{labels.subtitle}</p>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					title={labels.refresh}
					aria-label={labels.refresh}
					onClick={model.actions.reload}
					disabled={model.status === "loading"}
				>
					<span className="icon-[solar--refresh-linear] h-3.5 w-3.5" />
				</Button>
			</div>

			{model.status === "error" ? (
				<StatusMessage
					icon="icon-[solar--danger-circle-linear]"
					title={labels.errorTitle}
					action={
						<Button variant="outline" size="sm" onClick={model.actions.reload}>
							{labels.retry}
						</Button>
					}
				/>
			) : model.status === "loading" ? (
				<LoadingPlaceholder />
			) : model.empty ? (
				<StatusMessage
					icon="icon-[solar--chart-2-linear]"
					title={labels.emptyTitle}
					description={labels.emptyDescription}
				/>
			) : (
				<>
					<RangeToolbar model={model} />
					<div className="flex flex-col gap-4">
						<section
							id={SETTINGS_SECTION["usage-overview"].id}
							aria-label={labels.title}
							className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
						>
							{model.cards.map((card) => (
								<StatCard key={card.key} card={card} />
							))}
						</section>

						<Panel
							id={SETTINGS_SECTION["usage-trend"].id}
							title={labels.trend}
							aside={
								<span className="rounded-full bg-accent/60 px-2 py-0.5 text-[11px] text-muted-foreground">
									{model.trend.granularityLabel}
								</span>
							}
						>
							{model.rangeEmpty ? (
								<div className="flex h-[232px] items-center justify-center text-[12px] text-muted-foreground">
									{labels.emptyRange}
								</div>
							) : (
								<>
									<UsageTrendChart
										ariaLabel={labels.trendAria}
										columnLabels={model.trend.columnLabels}
										columnTitles={model.trend.columnTitles}
										datasets={model.trend.datasets}
										formatTokens={model.formatTokens}
										totalLabel={labels.total}
										themeKey={model.themeKey}
									/>
									{model.trend.datasets.length > 1 && (
										<ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
											{model.trend.datasets.map((dataset) => (
												<li key={dataset.key} className="flex min-w-0 items-center gap-1.5">
													<Swatch color={dataset.color} />
													<span className="truncate">{dataset.label}</span>
												</li>
											))}
										</ul>
									)}
								</>
							)}
						</Panel>

						{!model.rangeEmpty && (
							<div className="flex flex-wrap gap-4">
								<Panel title={labels.share} id="usage-share" className="min-w-[240px] flex-[1_1_240px]">
									<UsageShareChart
										ariaLabel={labels.shareAria}
										slices={model.share.slices}
										centerValue={model.share.centerValue}
										centerCaption={labels.shareCenter}
										formatTokens={model.formatTokens}
										formatShare={model.formatShare}
										themeKey={model.themeKey}
									/>
									<ul className="mt-4 flex flex-col gap-1.5 text-[12px]">
										{model.rows.slice(0, 6).map((row) => (
											<li key={row.key} className="flex min-w-0 items-center gap-2">
												<Swatch color={row.color} />
												<span className="min-w-0 flex-1 truncate text-foreground" title={row.name}>
													{row.name}
												</span>
												<span className="tabular-nums text-muted-foreground">{row.shareLabel}</span>
											</li>
										))}
									</ul>
								</Panel>
								<Panel
									id={SETTINGS_SECTION["usage-models"].id}
									title={labels.models}
									className="min-w-0 flex-[3_1_420px]"
								>
									<UsageTable model={model} />
								</Panel>
							</div>
						)}

						{model.heatmap && (
							<Panel
								id={SETTINGS_SECTION["usage-heatmap"].id}
								title={labels.heatmap}
								aside={<span className="text-[11px] text-muted-foreground">{model.heatmapSummary}</span>}
							>
								<UsageHeatmap
									heatmap={model.heatmap}
									labels={model.heatmapLabels}
									onSelectDay={model.actions.selectDay}
								/>
							</Panel>
						)}

					</div>
				</>
			)}
		</div>
	);
}

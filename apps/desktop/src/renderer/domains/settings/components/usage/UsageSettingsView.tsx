import { Button } from "@shared/components/ui/button";
import { Calendar } from "@shared/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@shared/components/ui/popover";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { cn } from "@shared/lib/utils";
import { type CSSProperties, type ReactNode, useState } from "react";
import type { DateRange } from "react-day-picker";
import { SETTINGS_SECTION } from "../../registry";
import { dayKeyFromLocalDate, localDateFromDayKey, type UsageRangePreset } from "./usage-aggregation";
import { UsageHeatmap } from "./UsageHeatmap";
import { HATCH_BACKGROUND } from "./usage-chart-theme";
import { UsageTrendChart } from "./UsageTrendChart";
import type {
	UsageCardModel,
	UsageCompositionItem,
	UsageDistributionSegment,
	UsageSettingsModel,
} from "./useUsageSettingsModel";

const CARD = "rounded-xl bg-card";

/** Soft dot grid fading out from the top-right corner of KPI cards. */
const DOT_GRID_STYLE: CSSProperties = {
	backgroundImage: "radial-gradient(color-mix(in srgb, var(--foreground) 16%, transparent) 1px, transparent 1.4px)",
	backgroundSize: "6px 6px",
	maskImage: "radial-gradient(circle at 100% 0%, black, transparent 72%)",
	WebkitMaskImage: "radial-gradient(circle at 100% 0%, black, transparent 72%)",
};

function tint(color: string, percent: number): string {
	return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

function Panel({
	id,
	title,
	subtitle,
	aside,
	children,
	className,
}: {
	id: string;
	title: string;
	subtitle?: string;
	aside?: ReactNode;
	children: ReactNode;
	className?: string;
}): JSX.Element {
	return (
		<section aria-labelledby={id} className={cn(CARD, "p-4", className)} data-setting-section-highlight-target={id}>
			<div className="mb-3 flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<h2 id={id} className="text-[14px] font-semibold text-foreground">
						{title}
					</h2>
					{subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>}
				</div>
				{aside}
			</div>
			{children}
		</section>
	);
}

function Chip({ icon, children }: { icon?: string; children: ReactNode }): JSX.Element {
	return (
		<span className="inline-flex items-center gap-1 rounded-lg bg-accent/60 px-2 py-1 text-[11px] text-muted-foreground">
			{icon && <span className={cn(icon, "h-3 w-3")} />}
			{children}
		</span>
	);
}

function StatCard({ card }: { card: UsageCardModel }): JSX.Element {
	return (
		<div data-usage-card={card.key} className={cn(CARD, "relative overflow-hidden px-4 pt-3.5 pb-3.5")}>
			<div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 h-20 w-28" style={DOT_GRID_STYLE} />
			<div className="relative flex items-start justify-between gap-2">
				<div className="text-[12px] text-muted-foreground">{card.label}</div>
				<span
					aria-hidden="true"
					className="flex h-6 w-6 items-center justify-center rounded-md"
					style={{ background: tint(card.color, 15), color: card.color }}
				>
					<span className={cn(card.icon, "h-3.5 w-3.5")} />
				</span>
			</div>
			<div data-card-value className="relative mt-1.5 text-[20px] font-semibold tabular-nums leading-tight text-foreground">
				{card.value}
			</div>
			<div className="relative mt-1.5 flex min-h-[16px] items-center gap-1 text-[11px] text-muted-foreground">
				{card.hint && (
					<>
						<span className={cn(card.hint.icon, "h-3 w-3 shrink-0")} style={{ color: card.color }} />
						<span className="truncate">{card.hint.text}</span>
					</>
				)}
			</div>
		</div>
	);
}

/** Cached tokens are drawn as coloured stripes: same family as the colour, visibly "reused". */
function compositionFill(item: UsageCompositionItem): CSSProperties {
	if (item.key === "cacheRead" || item.key === "cacheWrite") {
		return {
			backgroundImage: `repeating-linear-gradient(-45deg, ${item.color} 0 2px, ${tint(item.color, 45)} 2px 4px)`,
		};
	}
	return { background: item.color };
}

const HERO_GLOW_STYLE: CSSProperties = {
	backgroundImage:
		"radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--chart-2) 12%, transparent), transparent 55%), radial-gradient(90% 120% at 100% 100%, color-mix(in srgb, var(--chart-1) 9%, transparent), transparent 60%)",
};

function UsageHero({ model }: { model: UsageSettingsModel }): JSX.Element | null {
	const { hero, composition } = model;
	if (!hero) return null;
	const visible = composition.filter((item) => item.share > 0);
	return (
		<div data-usage-card="total" className={cn(CARD, "relative overflow-hidden p-5")} style={HERO_GLOW_STYLE}>
			<div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 h-28 w-48" style={DOT_GRID_STYLE} />
			<div className="relative flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className="flex h-6 w-6 items-center justify-center rounded-md"
						style={{ background: tint("var(--chart-2)", 15), color: "var(--chart-2)" }}
					>
						<span className="icon-[solar--bolt-linear] h-3.5 w-3.5" />
					</span>
					<div className="text-[13px] font-medium text-muted-foreground">{hero.label}</div>
				</div>
				{hero.hints.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{hero.hints.map((hint) => (
							<span
								key={hint}
								className="rounded-lg bg-background/60 px-2 py-1 text-[11px] tabular-nums text-muted-foreground"
							>
								{hint}
							</span>
						))}
					</div>
				)}
			</div>
			<div className="relative mt-2 flex items-baseline gap-2">
				<span data-card-value className="text-[40px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
					{hero.value}
				</span>
				<span className="text-[13px] text-muted-foreground">Token</span>
			</div>
			<div className="relative mt-5 flex h-3 gap-[3px]" aria-hidden="true">
				{visible.map((item) => (
					<div
						key={item.key}
						className="h-full min-w-[4px] rounded-full"
						style={{ flex: `${item.share} 1 0%`, ...compositionFill(item) }}
						title={`${item.label} · ${item.value} · ${item.percent}`}
					/>
				))}
				{visible.length === 0 && <div className="h-full flex-1 rounded-full" style={{ backgroundImage: HATCH_BACKGROUND }} />}
			</div>
			<ul className="relative mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
				{composition.map((item) => (
					<li key={item.key} className="min-w-0">
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
							<span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={compositionFill(item)} />
							<span className="truncate">{item.label}</span>
						</div>
						<div className="mt-0.5 flex items-baseline gap-1.5 pl-3.5">
							<span className="text-[14px] font-semibold tabular-nums text-foreground">{item.value}</span>
							<span className="text-[11px] tabular-nums text-muted-foreground">{item.percent}</span>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

function segmentFill(segment: UsageDistributionSegment): CSSProperties {
	return segment.striped
		? { backgroundColor: tint("var(--muted-foreground)", 10), backgroundImage: HATCH_BACKGROUND }
		: { background: segment.color };
}

/** Labelled columns over one segmented bar; small slices keep only their colour. */
function ModelDistribution({ model }: { model: UsageSettingsModel }): JSX.Element {
	const { distribution } = model;
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-baseline gap-1.5">
				<span className="text-[28px] font-semibold leading-none tabular-nums text-foreground">{distribution.total}</span>
				<span className="text-[12px] text-muted-foreground">{distribution.caption}</span>
			</div>
			<div className="mt-5 flex min-h-[132px] flex-1 gap-[3px]">
				{distribution.segments.map((segment) => {
					const labelled = segment.share >= 0.14;
					return (
						<div
							key={segment.key}
							className="flex min-w-[6px] flex-col"
							style={{ flex: `${Math.max(segment.share, 0.015)} 1 0%` }}
							title={`${segment.label} · ${segment.shareLabel} · ${segment.value}`}
						>
							<div className="flex flex-1 flex-col border-l border-border/60 pl-1.5">
								{labelled && (
									<div className="min-w-0 truncate text-[11px] leading-tight">
										<span className="font-semibold tabular-nums text-foreground">{segment.shareLabel}</span>
										<span className="ml-1 tabular-nums text-muted-foreground">{segment.value}</span>
									</div>
								)}
							</div>
							<div className="h-2.5 rounded-full" style={segmentFill(segment)} />
						</div>
					);
				})}
			</div>
			<ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-muted-foreground">
				{distribution.segments.map((segment) => (
					<li key={segment.key} className="flex min-w-0 max-w-full items-center gap-1.5">
						<span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={segmentFill(segment)} />
						<span className="truncate">{segment.label}</span>
					</li>
				))}
			</ul>
		</div>
	);
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
						className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5 text-[12px] font-medium text-foreground tabular-nums transition-colors hover:bg-accent"
					>
						<span className="icon-[solar--calendar-linear] h-3.5 w-3.5 text-muted-foreground" />
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
		<table className="w-full border-collapse text-[12px]">
			<thead className="sr-only">
				<tr>
					<th>{table.model}</th>
					<th>{table.share}</th>
					<th>{table.total}</th>
				</tr>
			</thead>
			<tbody>
				{model.rows.map((row, index) => (
					<tr key={row.key} className={cn("transition-colors hover:bg-accent/40", index > 0 && "border-t border-border/40")}>
						<td className="max-w-0 py-2.5 pr-2 pl-1">
							<div className="flex min-w-0 items-center gap-3">
								<span
									aria-hidden="true"
									className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
									style={{ background: tint(row.color, 16), color: row.color }}
								>
									{row.initial}
								</span>
								<div className="min-w-0">
									<div className="truncate font-medium text-foreground" title={row.name}>
										{row.name}
									</div>
									<div className="truncate text-[11px] text-muted-foreground" title={row.detail}>
										{[row.meta, row.detail].filter(Boolean).join(" · ")}
									</div>
								</div>
							</div>
						</td>
						<td className="w-[88px] px-2 py-2.5 text-right">
							<span
								className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
								style={{ background: tint(row.color, 14), color: row.color }}
							>
								<span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: row.color }} />
								{row.shareLabel}
							</span>
						</td>
						<td className="w-[72px] py-2.5 pr-1 pl-2 text-right text-[13px] font-semibold tabular-nums text-foreground">
							{row.total}
						</td>
					</tr>
				))}
			</tbody>
		</table>
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
		<div aria-hidden="true" className="flex flex-col gap-3">
			<div className={cn(CARD, "h-[168px]")} />
			<div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
				{Array.from({ length: 3 }, (_, index) => (
					<div key={index} className={cn(CARD, "h-[96px]")} />
				))}
			</div>
			<div className={cn(CARD, "h-[320px]")} />
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
					<div className="flex flex-col gap-5">
						<section
							id={SETTINGS_SECTION["usage-overview"].id}
							aria-label={labels.title}
							className="flex flex-col gap-3"
						>
							<UsageHero model={model} />
							<div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
								{model.cards.map((card) => (
									<StatCard key={card.key} card={card} />
								))}
							</div>
						</section>

						{model.rangeEmpty ? (
							<div
								className={cn(CARD, "flex h-[200px] items-center justify-center text-[12px] text-muted-foreground")}
								style={{ backgroundImage: HATCH_BACKGROUND }}
							>
								<span className="rounded-lg bg-card px-3 py-1.5">{labels.emptyRange}</span>
							</div>
						) : (
							<>
								<div className="flex flex-wrap gap-4">
									<Panel
										id="usage-share"
										title={labels.share}
										className="flex min-w-[260px] flex-[2_1_260px] flex-col"
									>
										<ModelDistribution model={model} />
									</Panel>
									<Panel
										id={SETTINGS_SECTION["usage-trend"].id}
										title={labels.trend}
										className="min-w-0 flex-[3_1_380px]"
										aside={<Chip icon="icon-[solar--clock-circle-linear]">{model.trend.granularityLabel}</Chip>}
									>
										<UsageTrendChart
											ariaLabel={labels.trendAria}
											columnLabels={model.trend.columnLabels}
											columnTitles={model.trend.columnTitles}
											datasets={model.trend.datasets}
											formatTokens={model.formatTokens}
											totalLabel={labels.total}
											averageLabel={labels.average}
											themeKey={model.themeKey}
										/>
									</Panel>
								</div>

								<Panel
									id={SETTINGS_SECTION["usage-models"].id}
									title={labels.models}
									aside={<Chip>{model.distribution.caption}</Chip>}
								>
									<UsageTable model={model} />
								</Panel>
							</>
						)}

						{model.heatmap && (
							<Panel
								id={SETTINGS_SECTION["usage-heatmap"].id}
								title={labels.heatmap}
								subtitle={model.heatmapSummary}
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

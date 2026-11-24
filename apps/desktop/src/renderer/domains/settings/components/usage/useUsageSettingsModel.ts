import type { UsageReport, UsageReportSeries } from "@preload/api-types/app-monitor";
import { waitForCommittedPaint } from "@shared/lib/committed-paint";
import { resolvedThemeAtom, themeNameAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "react-day-picker";
import { enUS, zhCN } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";
import type { UsageHeatmapLabels } from "./UsageHeatmap";
import type { UsageTicketModel } from "./UsageTicket";
import type { UsageTicketDialogLabels } from "./UsageTicketDialog";
import type { UsageTrendChartDataset } from "./UsageTrendChart";
import {
	buildUsageHeatmap,
	buildUsageTrend,
	formatTokenCount,
	type HeatmapCell,
	indexUsageDays,
	OTHER_SERIES_KEY,
	resolveUsageRange,
	summarizeUsageRange,
	type UsageDayRange,
	type UsageHeatmap,
	type UsageRangePreset,
	type UsageRangeSummary,
	type UsageSeriesRow,
} from "./usage-aggregation";
import { MUTED_SERIES_EXPRESSION, SERIES_COLOR_EXPRESSIONS } from "./usage-chart-theme";

const TONE = {
	blue: "var(--chart-2)",
	amber: "var(--chart-1)",
	green: "var(--term-green)",
	magenta: "var(--term-magenta)",
} as const;

export const USAGE_RANGE_PRESETS: readonly UsageRangePreset[] = ["today", "3d", "7d", "30d", "all", "custom"];
const DEFAULT_PRESET: UsageRangePreset = "today";

export type UsageLoadStatus = "loading" | "ready" | "error";

export interface UsageCardModel {
	key: "input" | "output" | "requests";
	label: string;
	value: string;
	/** Solar icon class for the corner glyph. */
	icon: string;
	/** CSS colour expression tinting the glyph and hint. */
	color: string;
	hint?: { icon: string; text: string };
}

/** One slice of where the tokens went: input, output, cache read, cache write. */
export interface UsageCompositionItem {
	key: "input" | "output" | "cacheRead" | "cacheWrite";
	label: string;
	value: string;
	/** 0–1 of all tokens in the range. */
	share: number;
	percent: string;
	color: string;
}

export interface UsageDistributionSegment {
	key: string;
	label: string;
	color: string;
	/** History without a model and the folded tail render as stripes, not a colour. */
	striped: boolean;
	share: number;
	shareLabel: string;
	value: string;
}

export interface UsageTableRowModel {
	key: string;
	name: string;
	provider: string;
	color: string;
	initial: string;
	/** "anthropic · 12 calls" */
	meta: string;
	/** "In 1.2K · Out 300 · Cache 4K / 0" */
	detail: string;
	total: string;
	share: number;
	shareLabel: string;
}

export interface UsageSettingsModel {
	status: UsageLoadStatus;
	/** No usage has ever been recorded. */
	empty: boolean;
	/** The selected period has no usage. */
	rangeEmpty: boolean;
	preset: UsageRangePreset;
	presets: Array<{ key: UsageRangePreset; label: string }>;
	customRange: UsageDayRange | null;
	rangeLabel: string;
	today: string;
	calendarLocale: Partial<Locale>;
	cards: UsageCardModel[];
	trend: {
		granularityLabel: string;
		columnLabels: string[];
		columnTitles: string[];
		datasets: UsageTrendChartDataset[];
	};
	hero: { label: string; value: string; hints: string[] } | null;
	composition: UsageCompositionItem[];
	distribution: { caption: string; segments: UsageDistributionSegment[] };
	rows: UsageTableRowModel[];
	heatmap: UsageHeatmap | null;
	/** Shareable receipt of the selected range; null until there is usage to print. */
	ticket: UsageTicketModel | null;
	heatmapLabels: UsageHeatmapLabels;
	heatmapSummary: string;
	themeKey: string;
	formatTokens: (value: number) => string;
	labels: {
		title: string;
		subtitle: string;
		refresh: string;
		customRangeLabel: string;
		trend: string;
		average: string;
		trendAria: string;
		models: string;
		heatmap: string;
		total: string;
		table: {
			model: string;
			total: string;
			share: string;
		};
		ticket: UsageTicketDialogLabels;
		emptyTitle: string;
		emptyDescription: string;
		emptyRange: string;
		errorTitle: string;
		retry: string;
	};
	actions: {
		selectPreset: (preset: UsageRangePreset) => void;
		selectCustomRange: (range: UsageDayRange | null) => void;
		selectDay: (day: string) => void;
		reload: () => void;
	};
}

const DISTRIBUTION_MAX_SEGMENTS = 5;
/** Model rows printed on the usage ticket, the last one folding the rest into "other". */
const TICKET_MAX_MODELS = 5;

/** First letter or digit of a model name, for its avatar. */
function initialOf(name: string): string {
	const match = name.match(/[\p{L}\p{N}]/u);
	return (match?.[0] ?? "?").toUpperCase();
}

function seriesColor(series: UsageReportSeries | { kind: "other" }, slot: number): string {
	if (series.kind === "unattributed" || series.kind === "other") return MUTED_SERIES_EXPRESSION;
	return SERIES_COLOR_EXPRESSIONS[slot % SERIES_COLOR_EXPRESSIONS.length] ?? MUTED_SERIES_EXPRESSION;
}

/** Colours follow the range's ranking so the biggest model always gets the accent colour. */
/**
 * Rows printed on the ticket: up to TICKET_MAX_MODELS, the last one standing in for everything
 * past the first four when there are more (`series: null`).
 */
function ticketModelRows(
	rows: readonly UsageSeriesRow[],
): Array<{ series: UsageSeriesRow["series"] | null; tokens: number; share: number }> {
	if (rows.length <= TICKET_MAX_MODELS) return rows.map(({ series, tokens, share }) => ({ series, tokens, share }));
	const head = rows.slice(0, TICKET_MAX_MODELS - 1);
	const tail = rows.slice(TICKET_MAX_MODELS - 1);
	return [
		...head.map(({ series, tokens, share }) => ({ series, tokens, share })),
		{
			series: null,
			tokens: tail.reduce((sum, row) => sum + row.tokens, 0),
			share: tail.reduce((sum, row) => sum + row.share, 0),
		},
	];
}

function assignSeriesColors(rows: readonly UsageSeriesRow[]): Map<string, string> {
	const colors = new Map<string, string>();
	let slot = 0;
	for (const row of rows) {
		colors.set(row.series.key, seriesColor(row.series, slot));
		if (row.series.kind !== "unattributed") slot += 1;
	}
	colors.set(OTHER_SERIES_KEY, MUTED_SERIES_EXPRESSION);
	return colors;
}

export function useUsageSettingsModel(): UsageSettingsModel {
	const { t, i18n } = useTranslation("settings");
	const language = i18n.language === "en" ? "en" : "zh";
	const intlLocale = language === "en" ? "en-US" : "zh-CN";
	const resolvedTheme = useAtomValue(resolvedThemeAtom);
	const themeName = useAtomValue(themeNameAtom);
	const [report, setReport] = useState<UsageReport | null>(null);
	const [status, setStatus] = useState<UsageLoadStatus>("loading");
	const [preset, setPreset] = useState<UsageRangePreset>(DEFAULT_PRESET);
	const [customRange, setCustomRange] = useState<UsageDayRange | null>(null);
	const requestRef = useRef(0);

	const load = useCallback(async () => {
		const request = ++requestRef.current;
		setStatus((current) => (current === "ready" ? current : "loading"));
		// The page shell paints first; reading month files can then take its time in main.
		await waitForCommittedPaint();
		if (request !== requestRef.current) return;
		try {
			const next = await window.vetta.appMonitor.getUsageReport();
			if (request !== requestRef.current) return;
			setReport(next);
			setStatus("ready");
		} catch {
			if (request !== requestRef.current) return;
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void load();
		return () => {
			requestRef.current += 1;
		};
	}, [load]);

	const formatters = useMemo(() => {
		const integer = new Intl.NumberFormat(intlLocale);
		const percent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 1 });
		const dayFormat = new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric", timeZone: "UTC" });
		const fullDayFormat = new Intl.DateTimeFormat(intlLocale, {
			year: "numeric",
			month: "short",
			day: "numeric",
			weekday: "short",
			timeZone: "UTC",
		});
		const monthDayFormat = new Intl.DateTimeFormat(intlLocale, { month: "2-digit", day: "2-digit", timeZone: "UTC" });
		const monthFormat = new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" });
		const weekdayFormat = new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" });
		const utc = (day: string) => new Date(`${day}T00:00:00Z`);
		return {
			tokens: formatTokenCount,
			count: (value: number) => integer.format(value),
			share: (value: number) => percent.format(value),
			day: (day: string) => dayFormat.format(utc(day)),
			fullDay: (day: string) => fullDayFormat.format(utc(day)),
			month: (day: string) => monthFormat.format(utc(day)),
			monthDay: (day: string) => monthDayFormat.format(utc(day)),
			// 2023-01-02 is a Monday; any fixed week works for weekday names.
			weekday: (offset: number) => weekdayFormat.format(utc(`2023-01-0${2 + offset}`)),
		};
	}, [intlLocale]);

	const index = useMemo(() => (report ? indexUsageDays(report) : new Map()), [report]);
	const range = useMemo<UsageDayRange | null>(
		() => (report ? resolveUsageRange(preset, report, customRange) : null),
		[report, preset, customRange],
	);
	const summary = useMemo<UsageRangeSummary | null>(
		() => (report && range ? summarizeUsageRange(report, range) : null),
		[report, range],
	);
	const colors = useMemo(() => assignSeriesColors(summary?.rows ?? []), [summary]);

	const seriesLabel = useCallback(
		(series: UsageReportSeries | undefined, key: string): string => {
			if (key === OTHER_SERIES_KEY) return t("usage.series.other");
			if (!series) return key;
			switch (series.kind) {
				case "unknown":
					return t("usage.series.unknown");
				case "unattributed":
					return t("usage.series.unattributed");
				case "knowledgeBase":
					return t("usage.series.knowledgeBase");
				case "model":
					return series.model || key;
			}
		},
		[t],
	);

	const trend = useMemo<UsageSettingsModel["trend"]>(() => {
		if (!report || !summary) return { granularityLabel: "", columnLabels: [], columnTitles: [], datasets: [] };
		const built = buildUsageTrend(report, summary, index);
		const seriesByKey = new Map(report.series.map((entry) => [entry.key, entry]));
		if (built.granularity === "hour") {
			const hours = Array.from({ length: 24 }, (_, hour) => t("usage.hourLabel", { hour }));
			return {
				granularityLabel: t("usage.granularity.hour"),
				columnLabels: hours,
				columnTitles: hours.map((hour) => `${formatters.fullDay(summary.range.start)} ${hour}`),
				datasets: built.datasets.map((dataset) => ({
					key: dataset.key,
					label: t("usage.total"),
					color: SERIES_COLOR_EXPRESSIONS[0],
					values: dataset.values,
				})),
			};
		}
		return {
			granularityLabel: t(built.granularity === "week" ? "usage.granularity.week" : "usage.granularity.day"),
			columnLabels: built.columns.map((day) => formatters.day(day)),
			columnTitles: built.columns.map((day) =>
				built.granularity === "week" ? t("usage.weekOf", { date: formatters.day(day) }) : formatters.fullDay(day),
			),
			datasets: built.datasets.map((dataset) => ({
				key: dataset.key,
				label: seriesLabel(seriesByKey.get(dataset.key), dataset.key),
				color: colors.get(dataset.key) ?? MUTED_SERIES_EXPRESSION,
				values: dataset.values,
			})),
		};
	}, [colors, formatters, index, report, seriesLabel, summary, t]);

	const rows = useMemo<UsageTableRowModel[]>(
		() =>
			(summary?.rows ?? []).map((row) => ({
				key: row.series.key,
				name: seriesLabel(row.series, row.series.key),
				provider: row.series.kind === "model" ? row.series.provider : "",
				color: colors.get(row.series.key) ?? MUTED_SERIES_EXPRESSION,
				initial: initialOf(seriesLabel(row.series, row.series.key)),
				meta: [
					row.series.kind === "model" ? row.series.provider : "",
					row.totals.requests > 0
						? t("usage.rowRequests", { count: row.totals.requests, value: formatters.count(row.totals.requests) })
						: "",
				]
					.filter(Boolean)
					.join(" · "),
				detail: t("usage.rowDetail", {
					input: formatters.tokens(row.totals.inputTokens),
					output: formatters.tokens(row.totals.outputTokens),
					cache: `${formatters.tokens(row.totals.cacheReadTokens)} / ${formatters.tokens(row.totals.cacheWriteTokens)}`,
				}),
				total: formatters.tokens(row.tokens),
				share: row.share,
				shareLabel: formatters.share(row.share),
			})),
		[colors, formatters, seriesLabel, summary, t],
	);

	const distribution = useMemo<UsageSettingsModel["distribution"]>(() => {
		const visible = (summary?.rows ?? []).filter((row) => row.tokens > 0);
		const head = visible.slice(0, DISTRIBUTION_MAX_SEGMENTS);
		const tail = visible.slice(DISTRIBUTION_MAX_SEGMENTS);
		const segments: UsageDistributionSegment[] = head.map((row) => ({
			key: row.series.key,
			label: seriesLabel(row.series, row.series.key),
			color: colors.get(row.series.key) ?? MUTED_SERIES_EXPRESSION,
			striped: row.series.kind === "unattributed",
			share: row.share,
			shareLabel: formatters.share(row.share),
			value: formatters.tokens(row.tokens),
		}));
		if (tail.length > 0) {
			const tokens = tail.reduce((sum, row) => sum + row.tokens, 0);
			const shareOfTail = tail.reduce((sum, row) => sum + row.share, 0);
			segments.push({
				key: OTHER_SERIES_KEY,
				label: t("usage.series.other"),
				color: MUTED_SERIES_EXPRESSION,
				striped: true,
				share: shareOfTail,
				shareLabel: formatters.share(shareOfTail),
				value: formatters.tokens(tokens),
			});
		}
		return {
			caption: t("usage.distributionCaption", { count: visible.length }),
			segments,
		};
	}, [colors, formatters, seriesLabel, summary, t]);

	const composition = useMemo<UsageCompositionItem[]>(() => {
		if (!summary) return [];
		const { totals } = summary;
		// Prompt-side first (fresh, cached, cache writes), then what the model wrote back.
		const entries: Array<[UsageCompositionItem["key"], number, string]> = [
			["input", totals.inputTokens, TONE.blue],
			["cacheRead", totals.cacheReadTokens, TONE.green],
			["cacheWrite", totals.cacheWriteTokens, TONE.magenta],
			["output", totals.outputTokens, TONE.amber],
		];
		return entries.map(([key, value, color]) => {
			const fraction = summary.tokens > 0 ? value / summary.tokens : 0;
			return {
				key,
				label: t(`usage.composition.${key}`),
				value: formatters.tokens(value),
				share: fraction,
				percent: formatters.share(fraction),
				color,
			};
		});
	}, [formatters, summary, t]);

	const hero = useMemo<UsageSettingsModel["hero"]>(() => {
		if (!summary) return null;
		const hints: string[] = [];
		if (summary.dayCount > 1) {
			hints.push(t("usage.hero.average", { value: formatters.tokens(summary.tokens / summary.dayCount) }));
			hints.push(t("usage.hero.activeDays", { days: summary.activeDays, total: summary.dayCount }));
		}
		if (summary.peak && summary.dayCount > 1) {
			hints.push(
				t("usage.hero.peak", {
					date: formatters.day(summary.peak.day),
					value: formatters.tokens(summary.peak.tokens),
				}),
			);
		}
		return { label: t("usage.hero.label"), value: formatters.tokens(summary.tokens), hints };
	}, [formatters, summary, t]);

	const cards = useMemo<UsageCardModel[]>(() => {
		if (!summary) return [];
		const { totals } = summary;
		const promptTokens = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
		return [
			{
				key: "input",
				label: t("usage.cards.input"),
				value: formatters.tokens(promptTokens),
				icon: "icon-[solar--import-linear]",
				color: TONE.blue,
				hint:
					summary.cacheHitRate === null
						? undefined
						: {
								icon: "icon-[solar--server-square-linear]",
								text: t("usage.cards.inputHint", {
									rate: formatters.share(summary.cacheHitRate),
									value: formatters.tokens(totals.cacheReadTokens),
								}),
							},
			},
			{
				key: "output",
				label: t("usage.cards.output"),
				value: formatters.tokens(totals.outputTokens),
				icon: "icon-[solar--export-linear]",
				color: TONE.amber,
				hint:
					summary.tokens > 0
						? {
								icon: "icon-[solar--pie-chart-2-linear]",
								text: t("usage.cards.outputHint", {
									rate: formatters.share(totals.outputTokens / summary.tokens),
								}),
							}
						: undefined,
			},
			{
				key: "requests",
				label: t("usage.cards.requests"),
				value: formatters.count(totals.requests),
				icon: "icon-[solar--cpu-bolt-linear]",
				color: TONE.green,
				hint: { icon: "icon-[solar--info-circle-linear]", text: t("usage.cards.requestsHint") },
			},
		];
	}, [formatters, summary, t]);

	const heatmap = useMemo(
		() => (report && range ? buildUsageHeatmap(index, report.today, range) : null),
		[index, range, report],
	);

	const heatmapLabels = useMemo<UsageHeatmapLabels>(
		() => ({
			ariaLabel: t("usage.heatmapAria"),
			less: t("usage.less"),
			more: t("usage.more"),
			hint: t("usage.heatmapHint"),
			weekdays: [formatters.weekday(0), formatters.weekday(2), formatters.weekday(4)],
			monthLabel: formatters.month,
			cellLabel: (cell: HeatmapCell) =>
				cell.tokens > 0
					? t("usage.heatmapCell", { date: formatters.fullDay(cell.day), tokens: formatters.tokens(cell.tokens) })
					: t("usage.heatmapCellEmpty", { date: formatters.fullDay(cell.day) }),
		}),
		[formatters, t],
	);

	const rangeLabel = range
		? range.start === range.end
			? formatters.fullDay(range.start)
			: t("usage.rangeSpan", { start: formatters.day(range.start), end: formatters.day(range.end) })
		: "";

	const ticket = useMemo<UsageTicketModel | null>(() => {
		if (!report || !summary || summary.tokens === 0) return null;
		const { range: span, totals } = summary;
		const top = summary.rows[0];
		const promptTokens = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
		const end = (day: string) => ({
			big: formatters.monthDay(day),
			sub: `${day.slice(0, 4)} · ${formatters.weekday((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7)}`,
		});
		const serialTokens = Math.round(summary.tokens).toString(36).toUpperCase().padStart(6, "0").slice(-6);
		const single = span.start === span.end;
		const isToday = single && span.start === report.today;
		return {
			single,
			fromLabel: t(isToday ? "usage.ticket.today" : single ? "usage.ticket.date" : "usage.ticket.from"),
			toLabel: t(single ? "usage.ticket.total" : "usage.ticket.to"),
			total: { big: formatters.tokens(summary.tokens), sub: "TOKEN" },
			corners: [
				"Vetta",
				single ? (isToday ? t("usage.presets.today") : formatters.fullDay(span.start)) : rangeLabel,
				formatters.fullDay(report.today),
				"#TOKENPASS",
			],
			from: end(span.start),
			to: end(span.end),
			span: t("usage.ticket.span", { count: summary.dayCount }),
			// A one-day ticket names the day in its header; the pill only belongs between two dates.
			badge: single ? "" : t("usage.ticket.active", { count: summary.activeDays }),
			highlights: [
				{ label: t("usage.hero.label"), value: formatters.tokens(summary.tokens) },
				{ label: t("usage.cards.input"), value: formatters.tokens(promptTokens) },
				{ label: t("usage.cards.output"), value: formatters.tokens(totals.outputTokens) },
			],
			details: [
				{ label: t("usage.ticket.streak"), value: t("usage.ticket.days", { count: summary.longestStreak }) },
				{ label: t("usage.ticket.topShare"), value: top ? formatters.share(top.share) : "—" },
				{
					label: t("usage.ticket.cacheHit"),
					value: summary.cacheHitRate === null ? "—" : formatters.share(summary.cacheHitRate),
				},
			],
			meta: [
				{
					label: t("usage.ticket.peakHour"),
					value:
						summary.peakHour === null
							? "—"
							: t("usage.ticket.hour", { start: summary.peakHour, end: summary.peakHour + 1 }),
				},
				{ label: t("usage.ticket.models"), value: t("usage.ticket.modelCount", { count: summary.rows.length }) },
				{ label: t("usage.ticket.issued"), value: formatters.monthDay(report.today) },
			],
			models: {
				label: t("usage.ticket.modelList"),
				rows: ticketModelRows(summary.rows).map((row) => ({
					name: row.series ? seriesLabel(row.series, row.series.key) : t("usage.series.other"),
					value: formatters.tokens(row.tokens),
					share: formatters.share(row.share),
				})),
			},
			serial: `VT-${span.end.replaceAll("-", "")}-${serialTokens}`,
			footer: t("usage.ticket.footer"),
			fileName: `vetta-usage-${span.start}_${span.end}.png`,
		};
	}, [formatters, rangeLabel, report, seriesLabel, summary, t]);

	const selectPreset = useCallback((next: UsageRangePreset) => setPreset(next), []);
	const selectCustomRange = useCallback((next: UsageDayRange | null) => {
		setCustomRange(next);
		if (next) setPreset("custom");
	}, []);
	const selectDay = useCallback((day: string) => {
		setCustomRange({ start: day, end: day });
		setPreset("custom");
	}, []);
	const reload = useCallback(() => void load(), [load]);

	return {
		status,
		empty: status === "ready" && (report?.days.length ?? 0) === 0,
		rangeEmpty: (summary?.tokens ?? 0) === 0 && (summary?.totals.requests ?? 0) === 0,
		preset,
		presets: USAGE_RANGE_PRESETS.map((key) => ({ key, label: t(`usage.presets.${key}`) })),
		customRange,
		rangeLabel,
		today: report?.today ?? "",
		calendarLocale: language === "en" ? enUS : zhCN,
		cards,
		trend,
		hero,
		composition,
		distribution,
		rows,
		heatmap,
		ticket,
		heatmapLabels,
		heatmapSummary: heatmap
			? t("usage.heatmapSummary", { tokens: formatters.tokens(heatmap.totalTokens), days: heatmap.activeDays })
			: "",
		themeKey: `${resolvedTheme}:${themeName}`,
		formatTokens: formatters.tokens,
		labels: {
			title: t("usage.title"),
			subtitle: t("usage.subtitle"),
			refresh: t("usage.refresh"),
			customRangeLabel: t("usage.customRangeLabel"),
			trend: t("usage.sections.trend"),
			average: t("usage.average"),
			trendAria: t("usage.trendAria"),
			models: t("usage.sections.models"),
			heatmap: t("usage.sections.heatmap"),
			total: t("usage.total"),
			table: {
				model: t("usage.table.model"),
				total: t("usage.table.total"),
				share: t("usage.table.share"),
			},
			ticket: {
				open: t("usage.ticket.open"),
				eyebrow: t("usage.ticket.eyebrow"),
				title: t("usage.ticket.title"),
				description: t("usage.ticket.description"),
				period: t("usage.ticket.period"),
				image: t("usage.ticket.image"),
				make: t("usage.ticket.make"),
				copy: t("usage.ticket.copy"),
				close: t("usage.ticket.close"),
				copied: t("usage.ticket.copied"),
				saved: t("usage.ticket.saved"),
				failed: t("usage.ticket.failed"),
			},
			emptyTitle: t("usage.emptyTitle"),
			emptyDescription: t("usage.emptyDescription"),
			emptyRange: t("usage.emptyRange"),
			errorTitle: t("usage.errorTitle"),
			retry: t("usage.retry"),
		},
		actions: { selectPreset, selectCustomRange, selectDay, reload },
	};
}

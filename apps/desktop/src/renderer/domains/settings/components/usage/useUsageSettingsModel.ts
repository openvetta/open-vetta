import type { UsageReport, UsageReportSeries } from "@preload/api-types/app-monitor";
import { waitForCommittedPaint } from "@shared/lib/committed-paint";
import { resolvedThemeAtom, themeNameAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "react-day-picker";
import { enUS, zhCN } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";
import type { UsageHeatmapLabels } from "./UsageHeatmap";
import type { UsageShareSlice } from "./UsageShareChart";
import type { UsageTrendChartDataset } from "./UsageTrendChart";
import {
	buildUsageHeatmap,
	buildUsageTrend,
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

export const USAGE_RANGE_PRESETS: readonly UsageRangePreset[] = ["today", "3d", "7d", "30d", "all", "custom"];
const DEFAULT_PRESET: UsageRangePreset = "7d";

export type UsageLoadStatus = "loading" | "ready" | "error";

export interface UsageCardModel {
	key: "total" | "input" | "output" | "cacheRead" | "requests" | "cost";
	label: string;
	value: string;
	hint?: string;
}

export interface UsageTableRowModel {
	key: string;
	name: string;
	provider: string;
	color: string;
	requests: string;
	input: string;
	output: string;
	cache: string;
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
	share: { slices: UsageShareSlice[]; centerValue: string };
	rows: UsageTableRowModel[];
	heatmap: UsageHeatmap | null;
	heatmapLabels: UsageHeatmapLabels;
	heatmapSummary: string;
	themeKey: string;
	formatTokens: (value: number) => string;
	formatShare: (share: number) => string;
	labels: {
		title: string;
		subtitle: string;
		refresh: string;
		customRangeLabel: string;
		trend: string;
		share: string;
		shareAria: string;
		shareCenter: string;
		trendAria: string;
		models: string;
		heatmap: string;
		total: string;
		table: {
			model: string;
			requests: string;
			input: string;
			output: string;
			cache: string;
			total: string;
			share: string;
		};
		emptyTitle: string;
		emptyDescription: string;
		emptyRange: string;
		errorTitle: string;
		retry: string;
		coverage: string;
	};
	actions: {
		selectPreset: (preset: UsageRangePreset) => void;
		selectCustomRange: (range: UsageDayRange | null) => void;
		selectDay: (day: string) => void;
		reload: () => void;
	};
}

function seriesColor(series: UsageReportSeries | { kind: "other" }, slot: number): string {
	if (series.kind === "unattributed" || series.kind === "other") return MUTED_SERIES_EXPRESSION;
	return SERIES_COLOR_EXPRESSIONS[slot % SERIES_COLOR_EXPRESSIONS.length] ?? MUTED_SERIES_EXPRESSION;
}

/** Colours follow the range's ranking so the biggest model always gets the accent colour. */
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
		const compact = new Intl.NumberFormat(intlLocale, { notation: "compact", maximumFractionDigits: 1 });
		const integer = new Intl.NumberFormat(intlLocale);
		const percent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 1 });
		const currency = new Intl.NumberFormat(intlLocale, {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: 2,
		});
		const dayFormat = new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric", timeZone: "UTC" });
		const fullDayFormat = new Intl.DateTimeFormat(intlLocale, {
			year: "numeric",
			month: "short",
			day: "numeric",
			weekday: "short",
			timeZone: "UTC",
		});
		const monthFormat = new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" });
		const weekdayFormat = new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" });
		const utc = (day: string) => new Date(`${day}T00:00:00Z`);
		return {
			tokens: (value: number) => (Math.abs(value) < 10_000 ? integer.format(value) : compact.format(value)),
			share: (value: number) => percent.format(value),
			cost: (value: number) => currency.format(value),
			day: (day: string) => dayFormat.format(utc(day)),
			fullDay: (day: string) => fullDayFormat.format(utc(day)),
			month: (day: string) => monthFormat.format(utc(day)),
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
				requests: row.totals.requests > 0 ? formatters.tokens(row.totals.requests) : "—",
				input: formatters.tokens(row.totals.inputTokens),
				output: formatters.tokens(row.totals.outputTokens),
				cache: `${formatters.tokens(row.totals.cacheReadTokens)} / ${formatters.tokens(row.totals.cacheWriteTokens)}`,
				total: formatters.tokens(row.tokens),
				share: row.share,
				shareLabel: formatters.share(row.share),
			})),
		[colors, formatters, seriesLabel, summary],
	);

	const share = useMemo<UsageSettingsModel["share"]>(() => {
		const slices = (summary?.rows ?? [])
			.filter((row) => row.tokens > 0)
			.map((row) => ({
				key: row.series.key,
				label: seriesLabel(row.series, row.series.key),
				color: colors.get(row.series.key) ?? MUTED_SERIES_EXPRESSION,
				tokens: row.tokens,
			}));
		return { slices, centerValue: formatters.tokens(summary?.tokens ?? 0) };
	}, [colors, formatters, seriesLabel, summary]);

	const cards = useMemo<UsageCardModel[]>(() => {
		if (!summary) return [];
		const { totals } = summary;
		const result: UsageCardModel[] = [
			{
				key: "total",
				label: t("usage.cards.total"),
				value: formatters.tokens(summary.tokens),
				hint:
					summary.dayCount > 1
						? t("usage.cards.totalHint", { value: formatters.tokens(summary.tokens / summary.dayCount) })
						: undefined,
			},
			{
				key: "input",
				label: t("usage.cards.input"),
				value: formatters.tokens(totals.inputTokens),
				hint:
					summary.peak && summary.dayCount > 1
						? t("usage.cards.peakHint", { date: formatters.day(summary.peak.day) })
						: undefined,
			},
			{
				key: "output",
				label: t("usage.cards.output"),
				value: formatters.tokens(totals.outputTokens),
				hint:
					summary.tokens > 0
						? t("usage.cards.outputHint", { rate: formatters.share(totals.outputTokens / summary.tokens) })
						: undefined,
			},
			{
				key: "cacheRead",
				label: t("usage.cards.cacheRead"),
				value: formatters.tokens(totals.cacheReadTokens),
				hint:
					summary.cacheHitRate !== null
						? t("usage.cards.cacheHint", { rate: formatters.share(summary.cacheHitRate) })
						: undefined,
			},
			{
				key: "requests",
				label: t("usage.cards.requests"),
				value: formatters.tokens(totals.requests),
				hint: summary.dayCount > 1 ? t("usage.cards.requestsHint", { days: summary.activeDays }) : undefined,
			},
		];
		// Costs are only known for models with configured prices; a zero would read as "free".
		if (totals.costTotal > 0) {
			result.push({ key: "cost", label: t("usage.cards.cost"), value: formatters.cost(totals.costTotal) });
		}
		return result;
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
		share,
		rows,
		heatmap,
		heatmapLabels,
		heatmapSummary: heatmap
			? t("usage.heatmapSummary", { tokens: formatters.tokens(heatmap.totalTokens), days: heatmap.activeDays })
			: "",
		themeKey: `${resolvedTheme}:${themeName}`,
		formatTokens: formatters.tokens,
		formatShare: formatters.share,
		labels: {
			title: t("usage.title"),
			subtitle: t("usage.subtitle"),
			refresh: t("usage.refresh"),
			customRangeLabel: t("usage.customRangeLabel"),
			trend: t("usage.sections.trend"),
			share: t("usage.sections.share"),
			shareAria: t("usage.shareAria"),
			shareCenter: t("usage.shareCenter"),
			trendAria: t("usage.trendAria"),
			models: t("usage.sections.models"),
			heatmap: t("usage.sections.heatmap"),
			total: t("usage.total"),
			table: {
				model: t("usage.table.model"),
				requests: t("usage.table.requests"),
				input: t("usage.table.input"),
				output: t("usage.table.output"),
				cache: t("usage.table.cache"),
				total: t("usage.table.total"),
				share: t("usage.table.share"),
			},
			emptyTitle: t("usage.emptyTitle"),
			emptyDescription: t("usage.emptyDescription"),
			emptyRange: t("usage.emptyRange"),
			errorTitle: t("usage.errorTitle"),
			retry: t("usage.retry"),
			coverage: t("usage.coverage"),
		},
		actions: { selectPreset, selectCustomRange, selectDay, reload },
	};
}

import type { UsageReport, UsageReportDay, UsageReportSeries, UsageTokenTotals } from "@preload/api-types/app-monitor";

export type UsageRangePreset = "today" | "3d" | "7d" | "30d" | "all" | "custom";

/** Inclusive `YYYY-MM-DD` bounds in the report time zone. */
export interface UsageDayRange {
	start: string;
	end: string;
}

export interface UsageSeriesRow {
	series: UsageReportSeries;
	totals: UsageTokenTotals;
	tokens: number;
	share: number;
}

export interface UsageRangeSummary {
	range: UsageDayRange;
	dayCount: number;
	activeDays: number;
	/** Longest run of consecutive days with usage inside the range. */
	longestStreak: number;
	totals: UsageTokenTotals;
	tokens: number;
	/** cacheRead / every prompt-side token; null when nothing was sent. */
	cacheHitRate: number | null;
	peak: { day: string; tokens: number } | null;
	/** Hour of day (0–23) with the most tokens summed over the range; null without hourly data. */
	peakHour: number | null;
	/** Sorted by tokens, largest first. */
	rows: UsageSeriesRow[];
}

/** Tokens bucketed for the trend chart: one column per day, or per week for long ranges. */
export interface UsageTrend {
	granularity: "hour" | "day" | "week";
	/** Day keys of each column start (hour granularity: the single day, repeated label is the hour). */
	columns: string[];
	/** Per series key, tokens in each column; ordered like `UsageRangeSummary.rows` with the tail folded into `other`. */
	datasets: Array<{ key: string; values: number[] }>;
}

export const OTHER_SERIES_KEY = "@other";
export const TREND_MAX_SERIES = 6;
/** Above this many days the trend switches to weekly columns to stay readable. */
export const TREND_DAILY_LIMIT = 92;
export const HEATMAP_WEEKS = 53;

const DAY_MS = 24 * 60 * 60 * 1000;

export function createEmptyTotals(): UsageTokenTotals {
	return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costTotal: 0, requests: 0 };
}

export function totalTokens(totals: UsageTokenTotals): number {
	return totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
}

function addTotals(target: UsageTokenTotals, source: UsageTokenTotals): void {
	target.inputTokens += source.inputTokens;
	target.outputTokens += source.outputTokens;
	target.cacheReadTokens += source.cacheReadTokens;
	target.cacheWriteTokens += source.cacheWriteTokens;
	target.costTotal += source.costTotal;
	target.requests += source.requests;
}

function dayToUtc(day: string): number {
	const [year, month, date] = day.split("-").map(Number);
	return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

function utcToDay(time: number): string {
	return new Date(time).toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
	return utcToDay(dayToUtc(day) + delta * DAY_MS);
}

export function daysBetweenInclusive(range: UsageDayRange): number {
	return Math.max(0, Math.round((dayToUtc(range.end) - dayToUtc(range.start)) / DAY_MS) + 1);
}

/** 0 = Sunday … 6 = Saturday; day keys are calendar dates, so UTC math is exact. */
export function weekdayOf(day: string): number {
	return new Date(dayToUtc(day)).getUTCDay();
}

export function dayKeyFromLocalDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

export function localDateFromDayKey(day: string): Date {
	const [year, month, date] = day.split("-").map(Number);
	return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

export function normalizeRange(range: UsageDayRange): UsageDayRange {
	return range.start <= range.end ? range : { start: range.end, end: range.start };
}

export function resolveUsageRange(
	preset: UsageRangePreset,
	report: Pick<UsageReport, "today" | "days">,
	custom: UsageDayRange | null,
): UsageDayRange {
	const today = report.today;
	switch (preset) {
		case "today":
			return { start: today, end: today };
		case "3d":
			return { start: addDays(today, -2), end: today };
		case "7d":
			return { start: addDays(today, -6), end: today };
		case "30d":
			return { start: addDays(today, -29), end: today };
		case "all": {
			const first = report.days[0]?.day;
			return { start: first && first < today ? first : today, end: today };
		}
		case "custom":
			return custom ? normalizeRange(custom) : { start: today, end: today };
	}
}

export function indexUsageDays(report: UsageReport): Map<string, UsageReportDay> {
	return new Map(report.days.map((day) => [day.day, day]));
}

function daysInRange(report: UsageReport, range: UsageDayRange): UsageReportDay[] {
	// report.days is sorted and sparse; filtering beats walking every calendar day for "all".
	return report.days.filter((day) => day.day >= range.start && day.day <= range.end);
}

export function summarizeUsageRange(report: UsageReport, range: UsageDayRange): UsageRangeSummary {
	const seriesByKey = new Map(report.series.map((entry) => [entry.key, entry]));
	const totals = createEmptyTotals();
	const bySeries = new Map<string, UsageTokenTotals>();
	let activeDays = 0;
	let longestStreak = 0;
	let streak = 0;
	let lastActive: string | null = null;
	let peak: UsageRangeSummary["peak"] = null;
	const hourly = new Array<number>(24).fill(0);
	for (const day of daysInRange(report, range)) {
		const dayTokens = totalTokens(day.totals);
		day.hourlyTokens?.forEach((tokens, hour) => {
			hourly[hour] = (hourly[hour] ?? 0) + tokens;
		});
		if (dayTokens > 0) {
			activeDays += 1;
			// report.days is sparse, so a gap in the keys is a day without usage.
			streak = lastActive !== null && addDays(lastActive, 1) === day.day ? streak + 1 : 1;
			lastActive = day.day;
			longestStreak = Math.max(longestStreak, streak);
		}
		if (dayTokens > 0 && (!peak || dayTokens > peak.tokens)) peak = { day: day.day, tokens: dayTokens };
		addTotals(totals, day.totals);
		for (const [key, seriesTotals] of Object.entries(day.bySeries)) {
			let target = bySeries.get(key);
			if (!target) {
				target = createEmptyTotals();
				bySeries.set(key, target);
			}
			addTotals(target, seriesTotals);
		}
	}
	const tokens = totalTokens(totals);
	let peakHour: number | null = null;
	hourly.forEach((value, hour) => {
		if (value > 0 && (peakHour === null || value > (hourly[peakHour] ?? 0))) peakHour = hour;
	});
	const rows: UsageSeriesRow[] = [];
	for (const [key, seriesTotals] of bySeries) {
		const series = seriesByKey.get(key) ?? { key, kind: "unknown" as const, provider: "", model: key };
		const seriesTokens = totalTokens(seriesTotals);
		if (seriesTokens === 0 && seriesTotals.requests === 0) continue;
		rows.push({ series, totals: seriesTotals, tokens: seriesTokens, share: tokens > 0 ? seriesTokens / tokens : 0 });
	}
	rows.sort((a, b) => b.tokens - a.tokens || a.series.key.localeCompare(b.series.key));
	const promptSide = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
	return {
		range,
		dayCount: daysBetweenInclusive(range),
		activeDays,
		longestStreak,
		totals,
		tokens,
		cacheHitRate: promptSide > 0 ? totals.cacheReadTokens / promptSide : null,
		peak,
		peakHour,
		rows,
	};
}

/** Series keys drawn individually in the trend; the rest are folded into `OTHER_SERIES_KEY`. */
export function pickTrendSeriesKeys(rows: readonly UsageSeriesRow[], max = TREND_MAX_SERIES): string[] {
	if (rows.length <= max) return rows.map((row) => row.series.key);
	return rows.slice(0, max - 1).map((row) => row.series.key);
}

export function buildUsageTrend(
	report: UsageReport,
	summary: UsageRangeSummary,
	index: ReadonlyMap<string, UsageReportDay>,
): UsageTrend {
	const { range } = summary;
	const keys = pickTrendSeriesKeys(summary.rows);
	const keySet = new Set(keys);
	const folds = summary.rows.length > keys.length;
	const datasetKeys = folds ? [...keys, OTHER_SERIES_KEY] : keys;

	if (summary.dayCount === 1) {
		const day = index.get(range.start);
		const hourly = day?.hourlyTokens ?? null;
		if (hourly) {
			return {
				granularity: "hour",
				columns: Array.from({ length: 24 }, () => range.start),
				datasets: [{ key: "@hourly", values: [...hourly] }],
			};
		}
	}

	const weekly = summary.dayCount > TREND_DAILY_LIMIT;
	const columns: string[] = [];
	if (weekly) {
		// Columns start on the Monday on or before the range start.
		let cursor = addDays(range.start, -((weekdayOf(range.start) + 6) % 7));
		while (cursor <= range.end) {
			columns.push(cursor);
			cursor = addDays(cursor, 7);
		}
	} else {
		for (let cursor = range.start; cursor <= range.end; cursor = addDays(cursor, 1)) columns.push(cursor);
	}
	const columnIndex = new Map(columns.map((column, position) => [column, position]));
	const datasets = datasetKeys.map((key) => ({ key, values: new Array<number>(columns.length).fill(0) }));
	const datasetByKey = new Map(datasets.map((dataset) => [dataset.key, dataset]));

	for (const day of report.days) {
		if (day.day < range.start || day.day > range.end) continue;
		const column = weekly ? addDays(day.day, -((weekdayOf(day.day) + 6) % 7)) : day.day;
		const position = columnIndex.get(column);
		if (position === undefined) continue;
		for (const [key, totals] of Object.entries(day.bySeries)) {
			const target = datasetByKey.get(keySet.has(key) ? key : OTHER_SERIES_KEY);
			if (target) target.values[position] = (target.values[position] ?? 0) + totalTokens(totals);
		}
	}
	return { granularity: weekly ? "week" : "day", columns, datasets };
}

export interface HeatmapCell {
	day: string;
	tokens: number;
	/** 0 = no usage, 1–4 = quartiles of the non-zero days in view. */
	level: 0 | 1 | 2 | 3 | 4;
	future: boolean;
	inRange: boolean;
}

export interface UsageHeatmap {
	/** Columns of 7 cells, Sunday first, like GitHub's contribution graph. */
	weeks: HeatmapCell[][];
	/** Column index where a new month starts, for the month labels row. */
	monthStarts: Array<{ week: number; day: string }>;
	totalTokens: number;
	activeDays: number;
}

function quantile(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) return 0;
	const position = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
	return sorted[position] ?? 0;
}

export function buildUsageHeatmap(
	index: ReadonlyMap<string, UsageReportDay>,
	today: string,
	selected: UsageDayRange,
	weeks = HEATMAP_WEEKS,
): UsageHeatmap {
	const lastColumnStart = addDays(today, -weekdayOf(today));
	const firstDay = addDays(lastColumnStart, -(weeks - 1) * 7);
	const values: number[] = [];
	const grid: Array<Array<{ day: string; tokens: number; future: boolean }>> = [];
	let totalInView = 0;
	let activeDays = 0;
	for (let week = 0; week < weeks; week += 1) {
		const column: Array<{ day: string; tokens: number; future: boolean }> = [];
		for (let weekday = 0; weekday < 7; weekday += 1) {
			const day = addDays(firstDay, week * 7 + weekday);
			const future = day > today;
			const entry = index.get(day);
			const tokens = !future && entry ? totalTokens(entry.totals) : 0;
			if (tokens > 0) {
				values.push(tokens);
				totalInView += tokens;
				activeDays += 1;
			}
			column.push({ day, tokens, future });
		}
		grid.push(column);
	}
	values.sort((a, b) => a - b);
	const thresholds = [quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75)];
	const levelOf = (tokens: number): HeatmapCell["level"] => {
		if (tokens <= 0) return 0;
		if (tokens <= (thresholds[0] ?? 0)) return 1;
		if (tokens <= (thresholds[1] ?? 0)) return 2;
		if (tokens <= (thresholds[2] ?? 0)) return 3;
		return 4;
	};
	const monthStarts: UsageHeatmap["monthStarts"] = [];
	let previousMonth = "";
	const cells = grid.map((column, week) => {
		const first = column[0]?.day ?? firstDay;
		const month = first.slice(0, 7);
		if (month !== previousMonth) {
			// Skip a label squeezed into the very first column when the month started mid-week.
			if (week > 0 || first.endsWith("-01")) monthStarts.push({ week, day: first });
			previousMonth = month;
		}
		return column.map((cell) => ({
			...cell,
			level: levelOf(cell.tokens),
			inRange: cell.day >= selected.start && cell.day <= selected.end,
		}));
	});
	return { weeks: cells, monthStarts, totalTokens: totalInView, activeDays };
}

const TOKEN_UNITS = [
	{ value: 1e3, suffix: "K" },
	{ value: 1e6, suffix: "M" },
	{ value: 1e9, suffix: "B" },
	{ value: 1e12, suffix: "T" },
] as const;

function scaleTokens(value: number, unit: (typeof TOKEN_UNITS)[number]): string {
	const scaled = value / unit.value;
	return scaled.toFixed(Math.abs(scaled) < 100 ? 1 : 0).replace(/\.0$/, "");
}

/** Token counts read as K/M/B in every language (1.3M, not 130万), matching how model limits are quoted. */
export function formatTokenCount(value: number): string {
	const abs = Math.abs(value);
	if (abs < 1000) return String(Math.round(value));
	let index = 0;
	while (index < TOKEN_UNITS.length - 1 && abs >= TOKEN_UNITS[index + 1].value) index += 1;
	// 999,960 would print as "1000K"; step up to "1M" instead.
	if (index < TOKEN_UNITS.length - 1 && Math.abs(Number(scaleTokens(value, TOKEN_UNITS[index]))) >= 1000) index += 1;
	return `${scaleTokens(value, TOKEN_UNITS[index])}${TOKEN_UNITS[index].suffix}`;
}

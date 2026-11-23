import type {
	UsageReport,
	UsageReportDay,
	UsageReportSeries,
	UsageTokenTotals,
} from "../../preload/api-types/app-monitor.js";
import type { AppMonitorData } from "./app-monitor-data.js";
import type { AppMonitorMonthData } from "./app-monitor-month-data.js";
import { UNKNOWN_MODEL_KEY } from "./app-monitor-usage.js";

export const UNATTRIBUTED_SERIES_KEY = "@unattributed";
export const KNOWLEDGE_BASE_SERIES_KEY = "@knowledge-base";

export function createEmptyUsageTotals(): UsageTokenTotals {
	return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costTotal: 0, requests: 0 };
}

function addTotals(target: UsageTokenTotals, source: UsageTokenTotals): void {
	target.inputTokens += source.inputTokens;
	target.outputTokens += source.outputTokens;
	target.cacheReadTokens += source.cacheReadTokens;
	target.cacheWriteTokens += source.cacheWriteTokens;
	target.costTotal += source.costTotal;
	target.requests += source.requests;
}

function totalTokens(totals: UsageTokenTotals): number {
	return totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
}

function isEmpty(totals: UsageTokenTotals): boolean {
	return totalTokens(totals) === 0 && totals.requests === 0 && totals.costTotal === 0;
}

/**
 * One reporting day from a monitor day bucket.
 *
 * Token sums recorded before per-model tracking existed are kept as an "unattributed" series so the
 * day total stays equal to what the monitor counted, and knowledge-base processing (tracked apart
 * from conversations) is folded in as its own series.
 */
export function buildUsageReportDay(
	day: string,
	data: AppMonitorData,
	seriesByKey: Map<string, UsageReportSeries>,
): UsageReportDay | null {
	const bySeries: Record<string, UsageTokenTotals> = {};
	const attributed = createEmptyUsageTotals();
	for (const [key, stats] of Object.entries(data.usage.byModel)) {
		const totals: UsageTokenTotals = {
			inputTokens: stats.inputTokens,
			outputTokens: stats.outputTokens,
			cacheReadTokens: stats.cacheReadTokens,
			cacheWriteTokens: stats.cacheWriteTokens,
			costTotal: stats.costTotal,
			requests: stats.requests,
		};
		if (isEmpty(totals)) continue;
		addTotals(attributed, totals);
		bySeries[key] = totals;
		if (!seriesByKey.has(key)) {
			seriesByKey.set(key, {
				key,
				kind: key === UNKNOWN_MODEL_KEY ? "unknown" : "model",
				provider: stats.provider,
				model: stats.model,
			});
		}
	}

	const remainder: UsageTokenTotals = {
		inputTokens: Math.max(0, data.usage.inputTokens - attributed.inputTokens),
		outputTokens: Math.max(0, data.usage.outputTokens - attributed.outputTokens),
		cacheReadTokens: Math.max(0, data.usage.cacheReadTokens - attributed.cacheReadTokens),
		cacheWriteTokens: Math.max(0, data.usage.cacheWriteTokens - attributed.cacheWriteTokens),
		costTotal: Math.max(0, data.usage.costTotal - attributed.costTotal),
		requests: Math.max(0, data.usage.requests - attributed.requests),
	};
	// Float cost sums can leave a sub-cent residue that is not real unattributed spend.
	if (remainder.costTotal < 1e-9) remainder.costTotal = 0;
	if (!isEmpty(remainder)) {
		bySeries[UNATTRIBUTED_SERIES_KEY] = remainder;
		if (!seriesByKey.has(UNATTRIBUTED_SERIES_KEY)) {
			seriesByKey.set(UNATTRIBUTED_SERIES_KEY, {
				key: UNATTRIBUTED_SERIES_KEY,
				kind: "unattributed",
				provider: "",
				model: "",
			});
		}
	}

	const knowledgeBase: UsageTokenTotals = {
		inputTokens: data.knowledgeBase.processingInputTokens,
		outputTokens: data.knowledgeBase.processingOutputTokens,
		cacheReadTokens: data.knowledgeBase.processingCacheReadTokens,
		cacheWriteTokens: data.knowledgeBase.processingCacheWriteTokens,
		costTotal: data.knowledgeBase.processingCostTotal,
		requests: 0,
	};
	if (!isEmpty(knowledgeBase)) {
		bySeries[KNOWLEDGE_BASE_SERIES_KEY] = knowledgeBase;
		if (!seriesByKey.has(KNOWLEDGE_BASE_SERIES_KEY)) {
			seriesByKey.set(KNOWLEDGE_BASE_SERIES_KEY, {
				key: KNOWLEDGE_BASE_SERIES_KEY,
				kind: "knowledgeBase",
				provider: "",
				model: "",
			});
		}
	}

	const totals = createEmptyUsageTotals();
	for (const seriesTotals of Object.values(bySeries)) addTotals(totals, seriesTotals);
	if (isEmpty(totals)) return null;

	const hasHourly = data.usage.hourlyTokens.some((tokens) => tokens > 0);
	return { day, totals, bySeries, hourlyTokens: hasHourly ? [...data.usage.hourlyTokens] : null };
}

export function buildUsageReportMonthDays(
	month: AppMonitorMonthData,
	seriesByKey: Map<string, UsageReportSeries>,
): UsageReportDay[] {
	const days: UsageReportDay[] = [];
	for (const [day, bucket] of Object.entries(month.days)) {
		const row = buildUsageReportDay(day, bucket.data, seriesByKey);
		if (row) days.push(row);
	}
	return days;
}

export function assembleUsageReport(input: {
	timeZone: string;
	today: string;
	days: readonly UsageReportDay[];
	seriesByKey: ReadonlyMap<string, UsageReportSeries>;
}): UsageReport {
	const byDay = new Map<string, UsageReportDay>();
	for (const day of input.days) byDay.set(day.day, day);
	const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
	const used = new Set<string>();
	for (const day of days) for (const key of Object.keys(day.bySeries)) used.add(key);
	const series = [...input.seriesByKey.values()].filter((entry) => used.has(entry.key));
	return { timeZone: input.timeZone, today: input.today, series, days };
}

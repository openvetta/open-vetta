import type { UsageReport, UsageReportDay, UsageTokenTotals } from "@preload/api-types/app-monitor";
import { describe, expect, it } from "vitest";
import {
	buildUsageHeatmap,
	buildUsageTrend,
	formatTokenCount,
	indexUsageDays,
	OTHER_SERIES_KEY,
	resolveUsageRange,
	summarizeUsageRange,
	weekdayOf,
} from "./usage-aggregation";

function totals(input: number, output = 0, cacheRead = 0, requests = 1): UsageTokenTotals {
	return {
		inputTokens: input,
		outputTokens: output,
		cacheReadTokens: cacheRead,
		cacheWriteTokens: 0,
		costTotal: 0,
		requests,
	};
}

function day(
	key: string,
	bySeries: Record<string, UsageTokenTotals>,
	hourlyTokens: number[] | null = null,
): UsageReportDay {
	const sum = totals(0, 0, 0, 0);
	for (const entry of Object.values(bySeries)) {
		sum.inputTokens += entry.inputTokens;
		sum.outputTokens += entry.outputTokens;
		sum.cacheReadTokens += entry.cacheReadTokens;
		sum.requests += entry.requests;
	}
	return { day: key, totals: sum, bySeries, hourlyTokens };
}

const series = [
	{ key: "a/opus", kind: "model" as const, provider: "a", model: "opus" },
	{ key: "b/gpt", kind: "model" as const, provider: "b", model: "gpt" },
	{ key: "@unattributed", kind: "unattributed" as const, provider: "", model: "" },
];

function report(days: UsageReportDay[], today = "2026-11-23"): UsageReport {
	return { timeZone: "Asia/Shanghai", today, series, days };
}

describe("时间范围", () => {
	const sample = report([day("2026-06-02", { "a/opus": totals(1) })]);

	it("预设按报表时区的今天向前推，含今天", () => {
		expect(resolveUsageRange("today", sample, null)).toEqual({ start: "2026-11-23", end: "2026-11-23" });
		expect(resolveUsageRange("3d", sample, null)).toEqual({ start: "2026-11-21", end: "2026-11-23" });
		expect(resolveUsageRange("7d", sample, null)).toEqual({ start: "2026-11-17", end: "2026-11-23" });
		expect(resolveUsageRange("30d", sample, null)).toEqual({ start: "2026-10-25", end: "2026-11-23" });
	});

	it("全部从第一条记录开始；自定义区间颠倒时自动纠正", () => {
		expect(resolveUsageRange("all", sample, null)).toEqual({ start: "2026-06-02", end: "2026-11-23" });
		expect(resolveUsageRange("custom", sample, { start: "2026-11-10", end: "2026-11-01" })).toEqual({
			start: "2026-11-01",
			end: "2026-11-10",
		});
	});

	it("跨月、跨年推算日期", () => {
		expect(resolveUsageRange("7d", report([], "2026-01-03"), null).start).toBe("2025-12-28");
	});
});

describe("区间汇总", () => {
	const data = report([
		day("2026-11-20", { "a/opus": totals(100, 10, 300), "b/gpt": totals(50) }),
		day("2026-11-22", { "a/opus": totals(500, 50) }),
		day("2026-11-23", { "@unattributed": totals(40, 0, 0, 0) }),
		day("2026-10-01", { "b/gpt": totals(9999) }),
	]);

	it("只统计区间内的天，按 token 从多到少列出各模型", () => {
		const summary = summarizeUsageRange(data, resolveUsageRange("7d", data, null));
		expect(summary.tokens).toBe(100 + 10 + 300 + 50 + 500 + 50 + 40);
		expect(summary.rows.map((row) => row.series.key)).toEqual(["a/opus", "b/gpt", "@unattributed"]);
		expect(summary.rows[0]?.totals.requests).toBe(2);
		expect(summary.activeDays).toBe(3);
		expect(summary.peak).toEqual({ day: "2026-11-22", tokens: 550 });
		expect(summary.dayCount).toBe(7);
	});

	it("连续使用取区间内最长的一段，中间断一天就重新计", () => {
		expect(summarizeUsageRange(data, resolveUsageRange("7d", data, null)).longestStreak).toBe(2);
		const streaky = report([
			day("2026-11-17", { "a/opus": totals(1) }),
			day("2026-11-18", { "a/opus": totals(1) }),
			day("2026-11-19", { "a/opus": totals(1) }),
			day("2026-11-20", { "a/opus": totals(0, 0, 0, 0) }),
			day("2026-11-21", { "a/opus": totals(1) }),
		]);
		expect(summarizeUsageRange(streaky, resolveUsageRange("7d", streaky, null)).longestStreak).toBe(3);
		expect(summarizeUsageRange(streaky, { start: "2026-11-18", end: "2026-11-21" }).longestStreak).toBe(2);
	});

	it("高峰时段按区间内各天同一小时的 token 累加取最大；没有小时数据为空", () => {
		const hours = (entries: Record<number, number>) => Array.from({ length: 24 }, (_, hour) => entries[hour] ?? 0);
		const hourly = report([
			day("2026-11-22", { "a/opus": totals(500) }, hours({ 9: 300, 23: 200 })),
			day("2026-11-23", { "a/opus": totals(400) }, hours({ 9: 100, 23: 300 })),
		]);
		expect(summarizeUsageRange(hourly, resolveUsageRange("3d", hourly, null)).peakHour).toBe(23);
		expect(summarizeUsageRange(hourly, { start: "2026-11-22", end: "2026-11-22" }).peakHour).toBe(9);
		expect(summarizeUsageRange(data, resolveUsageRange("7d", data, null)).peakHour).toBeNull();
	});

	it("缓存命中率 = 缓存读取 / 全部输入侧 token", () => {
		const summary = summarizeUsageRange(data, { start: "2026-11-20", end: "2026-11-20" });
		expect(summary.cacheHitRate).toBeCloseTo(300 / (150 + 300));
	});

	it("没有用量的区间为空", () => {
		const summary = summarizeUsageRange(data, { start: "2026-11-01", end: "2026-11-05" });
		expect(summary.tokens).toBe(0);
		expect(summary.rows).toEqual([]);
		expect(summary.cacheHitRate).toBeNull();
		expect(summary.peak).toBeNull();
	});
});

describe("趋势图分组", () => {
	it("按天出列，缺记录的日期补 0", () => {
		const data = report([day("2026-11-21", { "a/opus": totals(10) }), day("2026-11-23", { "b/gpt": totals(5) })]);
		const summary = summarizeUsageRange(data, resolveUsageRange("3d", data, null));
		const trend = buildUsageTrend(data, summary, indexUsageDays(data));
		expect(trend.granularity).toBe("day");
		expect(trend.columns).toEqual(["2026-11-21", "2026-11-22", "2026-11-23"]);
		expect(trend.datasets.find((entry) => entry.key === "a/opus")?.values).toEqual([10, 0, 0]);
		expect(trend.datasets.find((entry) => entry.key === "b/gpt")?.values).toEqual([0, 0, 5]);
	});

	it("模型超过上限时尾部合并为「其他」", () => {
		const bySeries: Record<string, UsageTokenTotals> = {};
		for (let index = 0; index < 8; index += 1) bySeries[`p/m${index}`] = totals(100 - index);
		const data = report([day("2026-11-23", bySeries)]);
		const summary = summarizeUsageRange(data, resolveUsageRange("7d", data, null));
		const trend = buildUsageTrend(data, summary, indexUsageDays(data));
		expect(trend.datasets.map((entry) => entry.key)).toEqual([
			"p/m0",
			"p/m1",
			"p/m2",
			"p/m3",
			"p/m4",
			OTHER_SERIES_KEY,
		]);
		expect(trend.datasets.at(-1)?.values.at(-1)).toBe(95 + 94 + 93);
	});

	it("单日且有小时数据时按小时出列", () => {
		const hourly = Array.from({ length: 24 }, (_, hour) => hour);
		const data = report([day("2026-11-23", { "a/opus": totals(276) }, hourly)]);
		const summary = summarizeUsageRange(data, resolveUsageRange("today", data, null));
		const trend = buildUsageTrend(data, summary, indexUsageDays(data));
		expect(trend.granularity).toBe("hour");
		expect(trend.datasets[0]?.values).toEqual(hourly);
	});

	it("超过 92 天改按周出列，周一为一列的起点", () => {
		const data = report([day("2026-01-01", { "a/opus": totals(1) }), day("2026-11-23", { "a/opus": totals(2) })]);
		const summary = summarizeUsageRange(data, resolveUsageRange("all", data, null));
		const trend = buildUsageTrend(data, summary, indexUsageDays(data));
		expect(trend.granularity).toBe("week");
		expect(trend.columns.every((column) => weekdayOf(column) === 1)).toBe(true);
		expect(trend.columns[0]).toBe("2025-12-29");
		const values = trend.datasets[0]?.values ?? [];
		expect(values[0]).toBe(1);
		expect(values.at(-1)).toBe(2);
	});
});

describe("每日活跃热力图", () => {
	it("53 列 × 7 天，周日在上，今天之后的格子标为未来", () => {
		const data = report([day("2026-11-23", { "a/opus": totals(10) })]);
		const heatmap = buildUsageHeatmap(indexUsageDays(data), data.today, { start: "2026-11-23", end: "2026-11-23" });
		expect(heatmap.weeks).toHaveLength(53);
		expect(heatmap.weeks.every((column) => column.length === 7)).toBe(true);
		expect(heatmap.weeks.every((column) => weekdayOf(column[0]?.day ?? "") === 0)).toBe(true);
		const last = heatmap.weeks.at(-1) ?? [];
		const todayCell = last.find((cell) => cell.day === "2026-11-23");
		expect(todayCell).toMatchObject({ tokens: 10, future: false, inRange: true });
		expect(last.filter((cell) => cell.future).map((cell) => cell.day)).toEqual([
			"2026-11-24",
			"2026-11-25",
			"2026-11-26",
			"2026-11-27",
			"2026-11-28",
		]);
	});

	it("按有用量日期的四分位分级，没用量为 0 级", () => {
		const days = [10, 20, 30, 40, 1000].map((value, index) => day(`2026-11-1${index}`, { "a/opus": totals(value) }));
		const data = report(days);
		const heatmap = buildUsageHeatmap(indexUsageDays(data), data.today, { start: "2026-11-23", end: "2026-11-23" });
		const levels = new Map(heatmap.weeks.flat().map((cell) => [cell.day, cell.level]));
		expect(levels.get("2026-11-10")).toBe(1);
		expect(levels.get("2026-11-14")).toBe(4);
		expect(levels.get("2026-11-15")).toBe(0);
		expect(heatmap.activeDays).toBe(5);
		expect(heatmap.monthStarts.length).toBeGreaterThanOrEqual(11);
	});
});

describe("token 数显示", () => {
	it("不足一千显示原数，往上依次用 K、M、B、T，整数不带 .0", () => {
		expect(
			[0, 999, 1000, 1250, 12_500, 999_960, 1_300_000, 250_000_000, 4_200_000_000, 1_250_000_000_000].map(
				formatTokenCount,
			),
		).toEqual(["0", "999", "1K", "1.3K", "12.5K", "1M", "1.3M", "250M", "4.2B", "1.3T"]);
	});
});

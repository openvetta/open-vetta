import { describe, expect, it } from "vitest";
import type { UsageReportSeries } from "../../preload/api-types/app-monitor";
import { createDefaultAppMonitorData, normalizeAppMonitorData } from "./app-monitor-data";
import { normalizeHourlyTokens, recordUsageSample } from "./app-monitor-usage";
import {
	assembleUsageReport,
	buildUsageReportDay,
	KNOWLEDGE_BASE_SERIES_KEY,
	UNATTRIBUTED_SERIES_KEY,
} from "./app-monitor-usage-report";

const opus = { provider: "anthropic", id: "claude-opus" };
const gpt = { provider: "openai", id: "gpt-5" };

describe("按模型记录用量", () => {
	it("同一模型多次调用累加，总数、调用次数与小时分布一起更新", () => {
		const data = createDefaultAppMonitorData(0);
		recordUsageSample(
			data.usage,
			{ input: 100, output: 20, cacheRead: 300, cacheWrite: 5, costTotal: 0.5, model: opus },
			9,
		);
		recordUsageSample(
			data.usage,
			{ input: 50, output: 10, cacheRead: 0, cacheWrite: 0, costTotal: 0.25, model: opus },
			9,
		);
		recordUsageSample(data.usage, { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, costTotal: 0, model: gpt }, 23);

		expect(data.usage).toMatchObject({ inputTokens: 157, outputTokens: 33, cacheReadTokens: 300, requests: 3 });
		expect(data.usage.byModel["anthropic/claude-opus"]).toMatchObject({
			provider: "anthropic",
			model: "claude-opus",
			requests: 2,
			inputTokens: 150,
			outputTokens: 30,
			costTotal: 0.75,
		});
		expect(data.usage.byModel["openai/gpt-5"]?.requests).toBe(1);
		expect(data.usage.hourlyTokens[9]).toBe(485);
		expect(data.usage.hourlyTokens[23]).toBe(10);
	});

	it("运行时没报告模型的调用归到 unknown", () => {
		const data = createDefaultAppMonitorData(0);
		recordUsageSample(data.usage, { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 }, 0);
		expect(Object.keys(data.usage.byModel)).toEqual(["unknown"]);
	});

	it("旧文件没有按模型字段时读成空表，小时分布补齐 24 格", () => {
		const data = normalizeAppMonitorData({ usage: { inputTokens: 10, outputTokens: 2 } });
		expect(data.usage.byModel).toEqual({});
		expect(data.usage.requests).toBe(0);
		expect(data.usage.hourlyTokens).toHaveLength(24);
		expect(normalizeHourlyTokens([1, -2, "x"]).slice(0, 3)).toEqual([1, 0, 0]);
	});

	it("持久化后再读，按模型的数据保持不变", () => {
		const data = createDefaultAppMonitorData(0);
		recordUsageSample(
			data.usage,
			{ input: 4, output: 2, cacheRead: 1, cacheWrite: 0, costTotal: 0.1, model: opus },
			3,
		);
		const reloaded = normalizeAppMonitorData(JSON.parse(JSON.stringify(data)));
		expect(reloaded.usage.byModel).toEqual(data.usage.byModel);
		expect(reloaded.usage.hourlyTokens).toEqual(data.usage.hourlyTokens);
	});
});

describe("用量报表的按天行", () => {
	it("按模型统计之前的历史作为未区分模型的一项，当天总数不变", () => {
		const series = new Map<string, UsageReportSeries>();
		const data = normalizeAppMonitorData({ usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 50 } });
		recordUsageSample(
			data.usage,
			{ input: 100, output: 20, cacheRead: 0, cacheWrite: 0, costTotal: 0, model: opus },
			10,
		);

		const row = buildUsageReportDay("2026-11-23", data, series);

		expect(row?.totals).toMatchObject({ inputTokens: 1100, outputTokens: 220, cacheReadTokens: 50, requests: 1 });
		expect(row?.bySeries[UNATTRIBUTED_SERIES_KEY]).toMatchObject({ inputTokens: 1000, outputTokens: 200 });
		expect(series.get(UNATTRIBUTED_SERIES_KEY)?.kind).toBe("unattributed");
		expect(series.get("anthropic/claude-opus")?.kind).toBe("model");
	});

	it("知识库加工单独成一项并计入当天总数", () => {
		const series = new Map<string, UsageReportSeries>();
		const data = createDefaultAppMonitorData(0);
		data.knowledgeBase.processingInputTokens = 40;
		data.knowledgeBase.processingOutputTokens = 10;

		const row = buildUsageReportDay("2026-11-23", data, series);

		expect(row?.bySeries[KNOWLEDGE_BASE_SERIES_KEY]).toMatchObject({ inputTokens: 40, outputTokens: 10 });
		expect(row?.totals.inputTokens).toBe(40);
		expect(series.get(KNOWLEDGE_BASE_SERIES_KEY)?.kind).toBe("knowledgeBase");
	});

	it("没有用量的日期不出行；没有小时数据时 hourlyTokens 为 null", () => {
		const series = new Map<string, UsageReportSeries>();
		expect(buildUsageReportDay("2026-11-01", createDefaultAppMonitorData(0), series)).toBeNull();
		const legacy = normalizeAppMonitorData({ usage: { inputTokens: 5 } });
		expect(buildUsageReportDay("2026-11-02", legacy, series)?.hourlyTokens).toBeNull();
	});

	it("报表按日期升序，只列出实际出现过的项", () => {
		const series = new Map<string, UsageReportSeries>([
			["openai/gpt-5", { key: "openai/gpt-5", kind: "model", provider: "openai", model: "gpt-5" }],
		]);
		const late = createDefaultAppMonitorData(0);
		recordUsageSample(late.usage, { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, costTotal: 0, model: opus }, 1);
		const early = normalizeAppMonitorData({ usage: { inputTokens: 3 } });
		const days = [buildUsageReportDay("2026-11-05", late, series), buildUsageReportDay("2026-10-30", early, series)];

		const report = assembleUsageReport({
			timeZone: "Asia/Shanghai",
			today: "2026-11-05",
			days: days.filter((day) => day !== null),
			seriesByKey: series,
		});

		expect(report.days.map((day) => day.day)).toEqual(["2026-10-30", "2026-11-05"]);
		expect(report.series.map((entry) => entry.key).sort()).toEqual(
			["anthropic/claude-opus", UNATTRIBUTED_SERIES_KEY].sort(),
		);
	});
});

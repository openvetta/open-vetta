// @vitest-environment jsdom

import { localModelsConfigAtom } from "@shared/store/model-catalog-atoms";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelUsageSettings } from "./ModelUsageSettings";
import { buildOverviewSlots } from "./useModelUsageModel";

const SUMMARY = {
	from: Date.UTC(2026, 8, 23, 0, 0, 0),
	to: Date.UTC(2026, 8, 24, 0, 0, 0),
	requests: 3,
	errors: 0,
	input: 57_000_000,
	output: 10_600_000,
	cacheRead: 116_800_000,
	cacheWrite: 7_800_000,
	totalTokens: 192_200_000,
	costTotal: 50.02,
	models: [
		{
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			api: "anthropic-messages",
			requests: 2,
			errors: 0,
			input: 21_800_000,
			output: 3_000_000,
			cacheRead: 54_600_000,
			cacheWrite: 3_800_000,
			totalTokens: 83_200_000,
			costTotal: 26.48,
			totalDurationMs: 120_000,
			maxDurationMs: 90_000,
			outputSpeed: 78,
			buckets: [
				{
					startedAt: Date.UTC(2026, 8, 23, 14, 0, 0),
					requests: 2,
					errors: 0,
					input: 10_000_000,
					output: 1_500_000,
					cacheRead: 27_000_000,
					cacheWrite: 1_800_000,
					costTotal: 13.0,
				},
			],
		},
		{
			provider: "openai",
			model: "gpt-5.4",
			api: "openai-responses",
			requests: 1,
			errors: 0,
			input: 12_400_000,
			output: 2_200_000,
			cacheRead: 21_800_000,
			cacheWrite: 1_600_000,
			totalTokens: 38_000_000,
			costTotal: 13.45,
			totalDurationMs: 60_000,
			maxDurationMs: 60_000,
			outputSpeed: 71,
			buckets: [
				{
					startedAt: Date.UTC(2026, 8, 23, 14, 0, 0),
					requests: 1,
					errors: 0,
					input: 6_000_000,
					output: 1_000_000,
					cacheRead: 10_000_000,
					cacheWrite: 800_000,
					costTotal: 6.0,
				},
			],
		},
	],
};

const CONFIG = {
	providers: {
		anthropic: {
			api: "anthropic-messages",
			models: [
				{
					id: "claude-sonnet-4-5",
					name: "Claude Sonnet 4.5",
					cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
				},
			],
		},
		openai: {
			api: "openai-responses",
			models: [
				{ id: "gpt-5.4", name: "GPT-5.4", cost: { input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 2.5 } },
			],
		},
	},
	defaultModel: "anthropic/claude-sonnet-4-5",
};

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, params?: Record<string, unknown>) => {
			if (params)
				return `${key}(${Object.entries(params)
					.map(([k, v]) => `${k}=${v}`)
					.join(",")})`;
			return key;
		},
	}),
}));

const summaryMock = vi.fn();
const exportCsvMock = vi.fn();
const backfillCostMock = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	window.scrollTo = vi.fn();
	summaryMock.mockResolvedValue(SUMMARY);
	exportCsvMock.mockResolvedValue({ path: "/tmp/export.csv", count: 3, preview: "" });
	backfillCostMock.mockResolvedValue({ updated: 2 });
	getDefaultStore().set(localModelsConfigAtom, CONFIG);
	Object.defineProperty(window, "vetta", {
		value: {
			...window.vetta,
			models: { get: vi.fn().mockResolvedValue(CONFIG) },
			modelUsage: {
				summary: summaryMock,
				exportCsv: exportCsvMock,
				backfillCost: backfillCostMock,
			},
		},
		configurable: true,
		writable: true,
	});
});

function renderModelUsage(initial = "/settings/modelUsage") {
	const root = createRootRoute();
	const settings = createRoute({ getParentRoute: () => root, path: "/settings/$tab", component: ModelUsageSettings });
	const router = createRouter({
		routeTree: root.addChildren([settings]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
	render(<RouterProvider router={router} />);
	return router;
}

describe("ModelUsageSettings", () => {
	it("滚动 24 小时包含当前 2 小时段与查询起点所在时段", () => {
		const now = Date.UTC(2026, 8, 23, 15, 30);
		const from = now - 24 * 60 * 60 * 1000;
		const first = Math.floor(from / (2 * 60 * 60 * 1000)) * (2 * 60 * 60 * 1000);
		const current = Math.floor(now / (2 * 60 * 60 * 1000)) * (2 * 60 * 60 * 1000);
		const summary = {
			...SUMMARY,
			from,
			to: now,
			models: [
				{
					...SUMMARY.models[0],
					buckets: [
						{ ...SUMMARY.models[0].buckets[0], startedAt: first, requests: 1 },
						{ ...SUMMARY.models[0].buckets[0], startedAt: current, requests: 1 },
					],
				},
			],
		};
		const slots = buildOverviewSlots(summary);
		expect(slots[0]?.startedAt).toBe(first);
		expect(slots.at(-1)?.startedAt).toBe(current);
		expect(slots.reduce((total, slot) => total + slot.requests, 0)).toBe(2);
	});
	it("加载后展示顶部统计与模型明细，并触发 summary IPC", async () => {
		renderModelUsage();
		await waitFor(() => expect(summaryMock).toHaveBeenCalled());
		expect(await screen.findByText("$50.02")).toBeTruthy();
		expect(screen.getByText("192.2M")).toBeTruthy();
		expect(screen.getByText("Claude Sonnet 4.5")).toBeTruthy();
		expect(screen.getByText("GPT-5.4")).toBeTruthy();
		expect(screen.getByText("$26.48")).toBeTruthy();
		expect(screen.getByRole("region", { name: "modelUsage.models.title" }).tabIndex).toBe(0);
	});

	it("总览与账单页各只呈现一个主标题，操作仍可切换", async () => {
		const user = userEvent.setup();
		renderModelUsage();
		await screen.findByText("$50.02");
		expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: /pricingLink/i }));
		await screen.findByText(/heatmapTitle/i);
		expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
	});

	it("切到「价格标准与账单拆解」后展示热力矩阵与单价目录，可导出 CSV", async () => {
		const user = userEvent.setup();
		const router = renderModelUsage();
		await screen.findByText("Claude Sonnet 4.5");
		await user.click(screen.getByRole("button", { name: /pricingLink/i }));
		expect(await screen.findByText(/heatmapTitle/i)).toBeTruthy();
		expect(router.state.location.search).toMatchObject({ section: "model-usage-pricing" });
		expect(screen.getByText(/catalogTitle/i)).toBeTruthy();
		expect(screen.getByRole("region", { name: "modelUsage.pricing.heatmapTitle" }).tabIndex).toBe(0);
		expect(screen.getByRole("region", { name: "modelUsage.pricing.catalogTitle" }).tabIndex).toBe(0);
		expect(screen.getByText("$3.00")).toBeTruthy();
		expect(screen.getByText("$15.00")).toBeTruthy();
		expect(screen.getByText("modelUsage.pricing.budgetUnconfigured")).toBeTruthy();
		expect(screen.queryByText("modelUsage.pricing.budgetSafe")).toBeNull();
		expect(screen.queryByText(/\$150\.00/)).toBeNull();
		await user.click(screen.getByRole("button", { name: /exportCsv/i }));
		await waitFor(() => expect(exportCsvMock).toHaveBeenCalled());
		await user.click(screen.getByRole("button", { name: /childOverview/i }));
		await screen.findByRole("button", { name: /pricingLink/i });
		expect(router.state.location.search).toMatchObject({ section: "model-usage-overview" });
		router.history.back();
		expect(await screen.findByText(/heatmapTitle/i)).toBeTruthy();
	});

	it("选择时段与日期范围后，剖析标题和查询窗口同步变化", async () => {
		const user = userEvent.setup();
		renderModelUsage();
		await screen.findByText("Claude Sonnet 4.5");
		// 时段按用户本地时间呈现；同一 UTC 样本在隔离测试的时区中可能跨日。
		const startedAt = SUMMARY.models[0].buckets[0].startedAt;
		const hour = (time: number) => String(new Date(time).getHours()).padStart(2, "0");
		const slotLabel = `${hour(startedAt)}-${hour(startedAt + 2 * 60 * 60 * 1000)}`;
		await user.click(screen.getByRole("button", { name: new RegExp(slotLabel) }));
		expect(screen.getByText(`modelUsage.peak.slotDetail(range=${slotLabel})`)).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "modelUsage.range.7d" }));
		await waitFor(() => {
			const query = summaryMock.mock.lastCall?.[0];
			expect(query.to - query.from).toBe(7 * 24 * 60 * 60 * 1000);
		});
	});

	it("空数据时展示空态提示", async () => {
		summaryMock.mockResolvedValue({ ...SUMMARY, requests: 0, models: [] });
		renderModelUsage();
		expect(await screen.findByText("modelUsage.empty")).toBeTruthy();
	});

	it("数据仍在加载时可先进入账单页", async () => {
		summaryMock.mockReturnValue(new Promise(() => {}));
		renderModelUsage();
		await userEvent.click(await screen.findByRole("button", { name: /pricingLink/i }));
		expect(await screen.findByText(/heatmapTitle/i)).toBeTruthy();
	});
	it("从设置侧栏或深链进入账单页时显示对应内容，而不是停留在总览", async () => {
		renderModelUsage("/settings/modelUsage?section=model-usage-pricing");
		expect(await screen.findByText(/heatmapTitle/i)).toBeTruthy();
	});
	it("读取用量失败时不冒充空数据，并能在页面重试", async () => {
		summaryMock.mockRejectedValueOnce(new Error("disk failure"));
		const user = userEvent.setup();
		renderModelUsage();
		expect((await screen.findByRole("alert")).textContent).toContain("modelUsage.loadFailed");
		expect(screen.queryByText("modelUsage.empty")).toBeNull();
		await user.click(screen.getByRole("button", { name: "modelUsage.retry" }));
		expect(await screen.findByText("$50.02")).toBeTruthy();
	});
});

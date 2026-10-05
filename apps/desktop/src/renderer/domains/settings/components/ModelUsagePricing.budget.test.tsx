// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type ModelUsagePricingBudget,
	ModelUsagePricingView,
	type ModelUsagePricingViewProps,
} from "@vetta-org/theme-ui/settings";
import { describe, expect, it } from "vitest";

function props(budget?: ModelUsagePricingBudget | null): ModelUsagePricingViewProps {
	return {
		budget,
		models: [],
		slots: [],
		configuredCount: 0,
		totalCount: 0,
		avgCacheDiscount: 0,
		exporting: false,
		onExportCsv: () => {},
		onSyncOfficial: () => {},
		onBack: () => {},
		composition: {
			inputCost: 0,
			cacheReadCost: 0,
			cacheWriteCost: 0,
			outputCost: 0,
			cacheSavings: 0,
			cacheSavingsShare: 0,
			inputTokens: "0",
			cacheReadTokens: "0",
			cacheWriteTokens: "0",
			outputTokens: "0",
		},
		labels: {
			title: "Pricing",
			description: "Usage estimates",
			scrollHint: "Scroll",
			back: "Overview",
			syncOfficial: "Sync",
			exportCsv: "Export",
			exporting: "Exporting",
			heatmapTitle: "Cost by time",
			heatmapHint: "Less",
			heatmapHintPeak: "More",
			slotTotal: "Total",
			compositionTitle: "Cost breakdown",
			savedBadge: (share) => `Saved ${share}`,
			regularInput: (tokens) => `Input ${tokens}`,
			cacheReadLine: (tokens) => `Read ${tokens}`,
			cacheWriteLine: (tokens) => `Write ${tokens}`,
			outputLine: (tokens) => `Output ${tokens}`,
			budgetTitle: "Budget",
			budgetUnconfigured:
				"No budget is configured. These are local estimates, not an account balance or provider invoice.",
			budgetSafe: "Within budget",
			budgetHint: (cost) => `Projected ${cost}`,
			catalogTitle: "Prices",
			catalogHint: "Model prices",
			catalogNote: "Estimates",
			configuredCount: "Configured",
			avgCacheDiscount: "Discount",
			standardInput: "Input",
			columns: {
				model: "Model",
				api: "API",
				input: "Input",
				cacheRead: "Read",
				cacheWrite: "Write",
				output: "Output",
				perRequest: "Per request",
				status: "Status",
			},
			statusSynced: "Synced",
			perMillion: "Per million",
			perRequestSuffix: "Per request",
			readDiscountBadge: "Discount",
		},
	};
}

describe("模型价格页的预算来源", () => {
	it("两张横向滚动表格保留具名区域与键盘 Tab 入口", async () => {
		const user = userEvent.setup();
		render(<ModelUsagePricingView {...props()} />);
		await user.tab();
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Overview" }));
		await user.tab();
		await user.tab();
		await user.tab();
		expect(document.activeElement).toBe(screen.getByRole("region", { name: "Cost by time" }));
		await user.tab();
		expect(document.activeElement).toBe(screen.getByRole("region", { name: "Prices" }));
	});

	it.each([undefined, null, { used: 5, total: 0, projected: 10 }, { used: 5, total: Number.NaN, projected: 10 }])(
		"预算缺失或无效时展示估算说明，不显示额度、预测或安全承诺 (%j)",
		(budget) => {
			render(<ModelUsagePricingView {...props(budget)} />);
			expect(screen.getByText(/No budget is configured/)).toBeTruthy();
			expect(screen.queryByText("Within budget")).toBeNull();
			expect(screen.queryByText(/^Projected /)).toBeNull();
			expect(screen.queryByText("Budget")).toBeNull();
		},
	);

	it("调用方提供真实预算时保留额度与预测，使用或预计超额时不宣称安全", () => {
		const view = render(<ModelUsagePricingView {...props({ used: 20, total: 100, projected: 70 })} />);
		expect(screen.getByText("$20.00 / $100.00（20.0%）")).toBeTruthy();
		expect(screen.getByText("Projected $70.00")).toBeTruthy();
		expect(screen.getByText("Within budget")).toBeTruthy();
		view.rerender(<ModelUsagePricingView {...props({ used: 120, total: 100, projected: 140 })} />);
		expect(screen.getByText("$120.00 / $100.00（120.0%）")).toBeTruthy();
		expect(screen.queryByText("Within budget")).toBeNull();
		view.rerender(<ModelUsagePricingView {...props({ used: 80, total: 100, projected: 140 })} />);
		expect(screen.getByText("Projected $140.00")).toBeTruthy();
		expect(screen.queryByText("Within budget")).toBeNull();
	});
});

// @vitest-environment jsdom
/**
 * 设置 → 用量：打开页面后先出页面壳再读报表，默认看近 7 天；切换时间范围、点热力图某天、加载失败重试。
 */
import settings from "@/shared/i18n/locales/zh/settings.json";
import type { UsageReport } from "@preload/api-types/app-monitor";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/lib/committed-paint", () => ({ waitForCommittedPaint: () => Promise.resolve("painted") }));

const { UsageSettings } = await import("./UsageSettings");

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { settings } }, interpolation: { escapeValue: false } });

function totals(input: number, output: number, requests: number) {
	return { inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0, costTotal: 0, requests };
}

const REPORT: UsageReport = {
	timeZone: "Asia/Shanghai",
	today: "2026-11-23",
	series: [
		{ key: "anthropic/claude-opus", kind: "model", provider: "anthropic", model: "claude-opus" },
		{ key: "openai/gpt-5", kind: "model", provider: "openai", model: "gpt-5" },
		{ key: "@unattributed", kind: "unattributed", provider: "", model: "" },
	],
	days: [
		{
			day: "2026-10-01",
			totals: totals(7000, 0, 0),
			bySeries: { "@unattributed": totals(7000, 0, 0) },
			hourlyTokens: null,
		},
		{
			day: "2026-11-20",
			totals: totals(3000, 1000, 4),
			bySeries: { "openai/gpt-5": totals(3000, 1000, 4) },
			hourlyTokens: null,
		},
		{
			day: "2026-11-23",
			totals: totals(1200, 300, 3),
			bySeries: { "anthropic/claude-opus": totals(1200, 300, 3) },
			hourlyTokens: [...new Array(9).fill(0), 1500, ...new Array(14).fill(0)],
		},
	],
};

function mockReport(getUsageReport: () => Promise<UsageReport>): void {
	(window as unknown as { vetta: unknown }).vetta = { appMonitor: { getUsageReport } };
}

function renderPage() {
	return render(
		<I18nextProvider i18n={i18n}>
			<UsageSettings />
		</I18nextProvider>,
	);
}

function cardValue(label: string): string {
	const card = screen.getByText(label, { selector: "div" }).parentElement;
	return card?.children[1]?.textContent ?? "";
}

beforeEach(() => {
	// jsdom has no canvas; charts skip drawing and the rest of the page must still work.
	HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement["getContext"];
});

afterEach(() => {
	cleanup();
});

describe("用量设置页", () => {
	it("默认展示近 7 天，按模型列出明细；切到今天只剩当天的模型", async () => {
		mockReport(async () => REPORT);
		renderPage();

		expect(screen.getByRole("heading", { name: "用量" })).toBeTruthy();
		await screen.findByRole("table");

		expect(cardValue("总 Token")).toBe("5,500");
		expect(cardValue("调用次数")).toBe("7");
		const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
		expect(rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
			"gpt-5openai",
			"claude-opusanthropic",
		]);

		await userEvent.click(screen.getByRole("button", { name: "今天" }));
		expect(cardValue("总 Token")).toBe("1,500");
		expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
		expect(screen.getByText("按小时")).toBeTruthy();

		await userEvent.click(screen.getByRole("button", { name: "全部" }));
		expect(cardValue("总 Token")).toBe("1.3万");
		expect(screen.getByText("未区分模型（早期记录）", { selector: "div" })).toBeTruthy();
	});

	it("点热力图里的某一天，切到那一天的明细", async () => {
		mockReport(async () => REPORT);
		const { container } = renderPage();
		await screen.findByRole("table");

		const cell = container.querySelector('rect[data-day="2026-11-20"]');
		expect(cell).toBeTruthy();
		fireEvent.click(cell as Element);

		expect(cardValue("总 Token")).toBe("4,000");
		const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.textContent).toContain("gpt-5");
	});

	it("所选时间段没有用量时给出提示，不画空图表", async () => {
		mockReport(async () => ({ ...REPORT, days: REPORT.days.slice(0, 1) }));
		renderPage();
		await screen.findByText("每日活跃");
		expect(screen.getByText("这段时间没有用量")).toBeTruthy();
		expect(screen.queryByRole("table")).toBeNull();
	});

	it("从没有记录时显示空状态", async () => {
		mockReport(async () => ({ ...REPORT, series: [], days: [] }));
		renderPage();
		expect(await screen.findByText("还没有用量记录")).toBeTruthy();
	});

	it("加载失败可以重试", async () => {
		let attempts = 0;
		mockReport(async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("disk");
			return REPORT;
		});
		renderPage();

		await userEvent.click(await screen.findByRole("button", { name: "重试" }));
		await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
		expect(screen.queryByText("用量加载失败")).toBeNull();
	});
});

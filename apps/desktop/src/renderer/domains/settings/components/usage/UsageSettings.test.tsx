// @vitest-environment jsdom
/**
 * 设置 → 用量：打开页面后先出页面壳再读报表，默认看今天；切换时间范围、点热力图某天、加载失败重试。
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
	const card = screen.getByText(label, { selector: "div" }).closest("[data-usage-card]");
	return card?.querySelector("[data-card-value]")?.textContent ?? "";
}

function modelNames(): string[] {
	const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
	return rows.map((row) => within(row).getAllByRole("cell")[0]?.querySelector("[title]")?.textContent ?? "");
}

beforeEach(() => {
	// jsdom has no canvas; charts skip drawing and the rest of the page must still work.
	HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement["getContext"];
});

afterEach(() => {
	cleanup();
});

describe("用量设置页", () => {
	it("默认展示今天，只列当天的模型；切到近 7 天按模型列出明细", async () => {
		mockReport(async () => REPORT);
		renderPage();

		expect(screen.getByRole("heading", { name: "用量" })).toBeTruthy();
		await screen.findByRole("table");

		expect(cardValue("总用量")).toBe("1.5K");
		expect(modelNames()).toEqual(["claude-opus"]);
		expect(screen.getByText("按小时")).toBeTruthy();

		await userEvent.click(screen.getByRole("button", { name: "近 7 天" }));
		expect(cardValue("总用量")).toBe("5.5K");
		expect(cardValue("模型请求")).toBe("7");
		expect(modelNames()).toEqual(["gpt-5", "claude-opus"]);
		expect(screen.getByText("openai · 4 次调用 · 输入 3K · 输出 1K · 缓存 0 / 0")).toBeTruthy();

		await userEvent.click(screen.getByRole("button", { name: "全部" }));
		expect(cardValue("总用量")).toBe("12.5K");
		expect(modelNames()).toContain("未区分模型（早期记录）");
	});

	it("点热力图里的某一天，切到那一天的明细", async () => {
		mockReport(async () => REPORT);
		const { container } = renderPage();
		await screen.findByRole("table");

		const cell = container.querySelector('rect[data-day="2026-11-20"]');
		expect(cell).toBeTruthy();
		fireEvent.click(cell as Element);

		expect(cardValue("总用量")).toBe("4K");
		expect(modelNames()).toEqual(["gpt-5"]);
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

	it("制作小票：多天显示起止日期，只选今天时顶部只显示今天", async () => {
		mockReport(async () => REPORT);
		renderPage();
		await screen.findByRole("table");

		await userEvent.click(screen.getByRole("button", { name: "近 7 天" }));
		await userEvent.click(screen.getByRole("button", { name: "制作小票" }));
		const dialog = await screen.findByRole("dialog");
		const ticket = within(dialog).getByRole("img");
		expect(within(ticket).getByText("FROM")).toBeTruthy();
		expect(within(ticket).getByText("11/17")).toBeTruthy();
		expect(within(ticket).getByText("TO")).toBeTruthy();
		expect(within(ticket).getByText("活跃 2 天")).toBeTruthy();
		expect(within(ticket).getByText("5.5K")).toBeTruthy();
		expect(within(ticket).queryByText("模型请求")).toBeNull();
		expect(within(ticket).getByText("连续使用")).toBeTruthy();
		expect(within(ticket).getByText("1 天")).toBeTruthy();
		expect(within(ticket).getByText("2 个")).toBeTruthy();
		expect(within(ticket).queryByText("主力模型")).toBeNull();
		// Model list: names only, no provider / id.
		expect(within(ticket).getByText("gpt-5")).toBeTruthy();
		expect(within(ticket).getByText("claude-opus")).toBeTruthy();
		expect(within(ticket).queryByText(/anthropic|openai/)).toBeNull();
		await userEvent.keyboard("{Escape}");

		await userEvent.click(screen.getByRole("button", { name: "今天" }));
		await userEvent.click(screen.getByRole("button", { name: "制作小票" }));
		const todayTicket = within(await screen.findByRole("dialog")).getByRole("img");
		expect(within(todayTicket).queryByText("FROM")).toBeNull();
		expect(within(todayTicket).queryByText("11/17")).toBeNull();
		expect(within(todayTicket).getByText("TODAY")).toBeTruthy();
		expect(within(todayTicket).getAllByText("今天").length).toBeGreaterThan(0);
		expect(within(todayTicket).getAllByText("1.5K").length).toBeGreaterThan(0);
		expect(within(todayTicket).getByText("高峰时段")).toBeTruthy();
		expect(within(todayTicket).getByText("9–10 点")).toBeTruthy();
		expect(within(todayTicket).queryByText("Asia/Shanghai")).toBeNull();
	});

	it("制作小票：模型超过 5 个时列前 4 个，第 5 行合并为「其他」", async () => {
		const keys = ["m1", "m2", "m3", "m4", "m5", "m6"];
		mockReport(async () => ({
			...REPORT,
			series: keys.map((key) => ({ key: `p/${key}`, kind: "model" as const, provider: "p", model: key })),
			days: [
				{
					day: "2026-11-23",
					totals: totals(2100, 0, 6),
					bySeries: Object.fromEntries(keys.map((key, index) => [`p/${key}`, totals(600 - index * 100, 0, 1)])),
					hourlyTokens: null,
				},
			],
		}));
		renderPage();
		await screen.findByRole("table");

		await userEvent.click(screen.getByRole("button", { name: "制作小票" }));
		const ticket = within(await screen.findByRole("dialog")).getByRole("img");
		for (const key of ["m1", "m2", "m3", "m4"]) expect(within(ticket).getByText(key)).toBeTruthy();
		expect(within(ticket).queryByText("m5")).toBeNull();
		expect(within(ticket).queryByText("m6")).toBeNull();
		expect(within(ticket).getByText("其他")).toBeTruthy();
		expect(within(ticket).getByText("6 个")).toBeTruthy();
	});
});

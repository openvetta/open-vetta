// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeBaseSettings } from "./KnowledgeBaseSettings";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: { m?: number; n?: number }) => `${key}${values?.m ?? values?.n ?? ""}`,
		i18n: { exists: () => true },
	}),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

afterEach(() => {
	Reflect.deleteProperty(window, "vetta");
});

describe("知识库设置反馈", () => {
	it("读取设置后按名称调整加工频率，测试失败显示原因，重试成功替换旧错误", async () => {
		const set = vi.fn(async () => {});
		const probe = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, error: "The selected model is unavailable" })
			.mockResolvedValueOnce({ ok: true, message: "Connection verified" });
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				config: {
					get: async () => ({
						knowledgeBase: {
							enabled: true,
							processingModelKey: "test/model",
							pollIntervalMinutes: 5,
							agentConcurrency: 3,
						},
					}),
					set,
				},
				knowledge: { reload: async () => {} },
				models: { get: async () => ({ providers: {} }), fetchRemote: async () => ({ providers: {} }), probe },
			},
		});
		const user = userEvent.setup();
		render(<KnowledgeBaseSettings />);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "kbTestConnect" }).hasAttribute("disabled")).toBe(false),
		);
		expect(screen.getByRole("switch", { name: "kbEnable", checked: true })).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "kbInterval" }));
		await user.click(await screen.findByRole("button", { name: "kbEveryNMinutes10" }));
		expect(set).toHaveBeenCalledWith({ knowledgeBase: { pollIntervalMinutes: 10 } });
		expect(screen.getByRole("button", { name: "kbParallel" })).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "kbTestConnect" }));
		expect((await screen.findByRole("status")).textContent).toBe("The selected model is unavailable");
		await user.click(screen.getByRole("button", { name: "kbTestConnect" }));
		await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Connection verified"));
		expect(screen.queryByText("The selected model is unavailable")).toBeNull();
		await user.click(screen.getByRole("switch", { name: "kbEnable", checked: true }));
		expect(screen.getByRole("button", { name: "kbTestConnect" }).hasAttribute("disabled")).toBe(true);
		expect(set).toHaveBeenCalledWith({ knowledgeBase: { enabled: false } });
	});
});

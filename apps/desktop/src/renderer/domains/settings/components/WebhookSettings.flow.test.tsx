// @vitest-environment jsdom
import type { WebhookCreateInput, WebhookEndpointPublic, WebhookMutationResult } from "@preload/api";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebhookSettingsModel } from "./useWebhookSettingsModel";
import { WebhookSettingsView } from "./WebhookSettingsView";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { exists: () => true } }),
}));

function Harness(): JSX.Element {
	return <WebhookSettingsView model={useWebhookSettingsModel()} />;
}

function installWebhook() {
	const endpoints: WebhookEndpointPublic[] = [];
	const create = vi.fn(async (input: WebhookCreateInput): Promise<WebhookMutationResult> => {
		const endpoint: WebhookEndpointPublic = {
			...input,
			id: "channel-1",
			enabled: input.enabled ?? true,
			createdAt: "2026-01-01",
			updatedAt: "2026-01-01",
			urlMask: "https://example.test/…",
		};
		endpoints.push(endpoint);
		return { ok: true, endpoint };
	});
	const update = vi.fn(async () => ({ ok: true }));
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			webhook: {
				list: async () => [...endpoints],
				listProviders: async () => [
					{ kind: "feishu", displayName: "Feishu" },
					{ kind: "dingtalk", displayName: "DingTalk" },
				],
				create,
				update,
			},
		},
	});
	return { create, update, endpoints };
}

beforeEach(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	Reflect.deleteProperty(window, "vetta");
	vi.unstubAllGlobals();
});

describe("Webhook 设置表单", () => {
	it("按字段名称填写、切换渠道并用 Enter 保存，失败后保留草稿供重试", async () => {
		const { create } = installWebhook();
		create.mockResolvedValueOnce({ ok: false, error: "Please check the webhook address" });
		const user = userEvent.setup();
		render(<Harness />);
		await user.click(await screen.findByRole("button", { name: "whAdd" }));
		await user.click(screen.getByRole("button", { name: "whDingtalk", pressed: false }));
		expect(screen.getByRole("button", { name: "whDingtalk", pressed: true })).toBeTruthy();
		await user.type(screen.getByRole("textbox", { name: "whName" }), "Build alerts");
		await user.type(screen.getByRole("textbox", { name: "whAtPhone whAtPhoneSuffix" }), "13800138000");
		await user.click(screen.getByRole("switch", { name: "whAtAll" }));
		await user.type(screen.getByRole("textbox", { name: "whUrl" }), "https://example.test/hook{Enter}");

		expect((await screen.findByRole("alert")).textContent).toBe("Please check the webhook address");
		expect((screen.getByRole("textbox", { name: "whName" }) as HTMLInputElement).value).toBe("Build alerts");
		expect((screen.getByRole("textbox", { name: "whUrl" }) as HTMLInputElement).value).toBe(
			"https://example.test/hook",
		);
		await user.click(screen.getByRole("button", { name: "whSave" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(screen.getByText("Build alerts")).toBeTruthy();
		expect(screen.getByRole("switch", { name: "Build alerts", checked: true })).toBeTruthy();
		expect(create).toHaveBeenLastCalledWith(
			expect.objectContaining({
				name: "Build alerts",
				kind: "dingtalk",
				dingtalk: { mentionAll: true, atMobiles: ["13800138000"], keyword: undefined },
			}),
		);
	});

	it("显示和隐藏签名值保留输入，保存期间 Enter 不重复提交", async () => {
		const { create } = installWebhook();
		let resolveSave: (result: WebhookMutationResult) => void = () => {};
		create.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveSave = resolve;
				}),
		);
		const user = userEvent.setup();
		render(<Harness />);
		await user.click(await screen.findByRole("button", { name: "whAdd" }));
		const secret = screen.getByLabelText("whSecret whSecretHint") as HTMLInputElement;
		await user.type(secret, "test-signature");
		await user.click(screen.getByRole("button", { name: "whShow" }));
		expect(secret.type).toBe("text");
		expect(secret.value).toBe("test-signature");
		await user.click(screen.getByRole("button", { name: "whHide" }));
		expect(secret.type).toBe("password");
		await user.type(screen.getByRole("textbox", { name: "whUrl" }), "https://example.test/hook{Enter}");
		expect(screen.getByRole("button", { name: "whSaving" }).hasAttribute("disabled")).toBe(true);
		await user.keyboard("{Enter}");
		expect(create).toHaveBeenCalledTimes(1);
		resolveSave({ ok: true });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("编辑时保持渠道锁定，空白地址与签名继续使用已有配置", async () => {
		const { endpoints, update } = installWebhook();
		endpoints.push({
			id: "channel-1",
			name: "Existing alerts",
			kind: "feishu",
			enabled: true,
			createdAt: "2026-01-01",
			updatedAt: "2026-01-01",
		});
		const user = userEvent.setup();
		render(<Harness />);
		await user.click(await screen.findByRole("button", { name: "whEdit" }));
		expect(screen.getByRole("button", { name: "whDingtalk" }).hasAttribute("disabled")).toBe(true);
		await user.clear(screen.getByRole("textbox", { name: "whName" }));
		await user.type(screen.getByRole("textbox", { name: "whName" }), "Renamed alerts{Enter}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(update).toHaveBeenCalledWith("channel-1", { name: "Renamed alerts", feishu: { mentionAll: false } });
	});
});

// @vitest-environment jsdom
import type { ModelsConfigData, PresetProviderInfo } from "@preload/api.js";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePresetProvidersSectionModel } from "./usePresetProvidersSectionModel";

vi.mock("react-i18next", () => {
	// 引用要稳定:t 每次渲染都换新,目录加载的 effect 会反复重跑。
	const translation = { t: (key: string) => key, i18n: { language: "zh-CN" } };
	return { useTranslation: () => translation };
});
vi.mock("@shared/store/toast-atoms", () => ({ showToast: vi.fn() }));

const deepseekPreset: PresetProviderInfo = {
	id: "deepseek",
	displayName: "DeepSeek",
	api: "openai-completions-deepseek",
	baseUrl: "https://api.deepseek.com",
	icon: "deepseek",
	catalogModels: [],
};

const magpiePreset: PresetProviderInfo = {
	id: "magpie",
	displayName: "Magpie",
	api: "openai-completions",
	baseUrl: "http://127.0.0.1:3425/v1",
	icon: "magpie",
	managedBy: "magpie",
	catalogModels: [],
};

const models = {
	listPresets: vi.fn(async () => ({ providers: [deepseekPreset, magpiePreset], catalogSource: "live" as const })),
	onPresetsUpdated: vi.fn(() => () => {}),
	refreshPresetModels: vi.fn(async () => ({ models: [{ id: "deepseek-chat" }] })),
};

vi.stubGlobal("window", Object.assign(globalThis.window, { vetta: { models } }));

describe("预设服务商启用", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("改 key 重新启用时保留用户手加的请求头", async () => {
		const saveConfig = vi.fn(async (_next: ModelsConfigData) => {});
		const config: ModelsConfigData = {
			providers: {
				deepseek: { source: "template", templateId: "deepseek", apiKey: "old", headers: { "X-Trace": "1" } },
			},
		};
		const { result } = renderHook(() => usePresetProvidersSectionModel({ config, saveConfig }));
		await waitFor(() => expect(result.current.rows.some((row) => row.id === "deepseek")).toBe(true));
		act(() => result.current.onDraftKeyChange("deepseek", "sk-new"));
		const row = result.current.rows.find((item) => item.id === "deepseek");
		if (!row) throw new Error("missing deepseek row");
		await act(async () => {
			await result.current.onAdopt(row);
		});
		expect(saveConfig).toHaveBeenCalledOnce();
		expect(saveConfig.mock.calls[0][0].providers.deepseek).toMatchObject({
			apiKey: "sk-new",
			headers: { "X-Trace": "1" },
		});
	});

	it("Magpie 写进来的条目算已接入并展示它的模型,同名的自建条目不算", async () => {
		const saveConfig = vi.fn(async (_next: ModelsConfigData) => {});
		const connected: ModelsConfigData = {
			providers: { magpie: { source: "magpie", apiKey: "***", models: [{ id: "codex/gpt-6.1-sol" }] } },
		};
		const { result, rerender } = renderHook(({ config }) => usePresetProvidersSectionModel({ config, saveConfig }), {
			initialProps: { config: connected },
		});
		await waitFor(() => expect(result.current.rows.some((row) => row.id === "magpie")).toBe(true));
		expect(result.current.rows.find((row) => row.id === "magpie")).toMatchObject({
			managedBy: "magpie",
			adopted: true,
			models: [{ id: "codex/gpt-6.1-sol" }],
		});

		rerender({ config: { providers: { magpie: { baseUrl: "http://127.0.0.1:3425/v1", models: [{ id: "x" }] } } } });
		expect(result.current.rows.find((row) => row.id === "magpie")).toMatchObject({ adopted: false, models: [] });
	});
});

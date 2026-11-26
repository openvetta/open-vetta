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

const magpiePreset: PresetProviderInfo = {
	id: "magpie",
	displayName: "Magpie",
	api: "openai-completions",
	baseUrl: "http://127.0.0.1:3425/v1",
	icon: "magpie",
	defaultApiKey: "magpie",
	defaultHeaders: { "User-Agent": "Vetta" },
	catalogModels: [],
};

const models = {
	listPresets: vi.fn(async () => ({ providers: [magpiePreset], catalogSource: "live" as const })),
	onPresetsUpdated: vi.fn(() => () => {}),
	refreshPresetModels: vi.fn(async () => ({ models: [{ id: "gpt-5" }] })),
};

vi.stubGlobal("window", Object.assign(globalThis.window, { vetta: { models } }));

async function adoptMagpie(config: ModelsConfigData): Promise<ModelsConfigData> {
	const saveConfig = vi.fn(async (_next: ModelsConfigData) => {});
	const { result } = renderHook(() => usePresetProvidersSectionModel({ config, saveConfig }));
	await waitFor(() => expect(result.current.rows.some((row) => row.id === "magpie")).toBe(true));
	const row = result.current.rows.find((item) => item.id === "magpie");
	if (!row) throw new Error("missing magpie row");
	await act(async () => {
		await result.current.onAdopt(row);
	});
	expect(saveConfig).toHaveBeenCalledOnce();
	return saveConfig.mock.calls[0][0];
}

describe("预设服务商启用", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("启用 Magpie 时写入 User-Agent: Vetta,让 Magpie 认出 Vetta", async () => {
		const saved = await adoptMagpie({ providers: {} });
		expect(saved.providers.magpie?.headers).toEqual({ "User-Agent": "Vetta" });
	});

	it("改 key 重新启用时保留用户手加的请求头,不覆盖用户自己的 User-Agent", async () => {
		const saved = await adoptMagpie({
			providers: {
				magpie: {
					source: "template",
					templateId: "magpie",
					apiKey: "old",
					headers: { "user-agent": "MyVetta/1", "X-Trace": "1" },
				},
			},
		});
		expect(saved.providers.magpie?.headers).toEqual({ "user-agent": "MyVetta/1", "X-Trace": "1" });
	});
});

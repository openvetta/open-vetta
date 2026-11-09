// @vitest-environment jsdom

import { localModelsConfigAtom, remoteProvidersAtom } from "@shared/store/atoms";
import type { ModelsConfigData } from "@preload/api";
import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useModelOptions } from "./useModelOptions";

// 只替换会发请求的 modelCatalog；原模块还重新导出了 localModelsConfigAtom 等，不能整个换掉。
vi.mock("@shared/store/model-catalog", async (importOriginal) => ({
	...(await importOriginal<typeof import("@shared/store/model-catalog")>()),
	modelCatalog: { revalidate: vi.fn(async () => undefined) },
}));

function renderOptions(config: ModelsConfigData, remote: Record<string, unknown> = {}) {
	const store = createStore();
	store.set(localModelsConfigAtom, config);
	store.set(remoteProvidersAtom, remote);
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	return renderHook(() => useModelOptions(), { wrapper }).result.current;
}

const config: ModelsConfigData = {
	defaultModel: "deepseek/chat",
	providers: {
		deepseek: { displayName: "DeepSeek", disabled: true, models: [{ id: "chat" }, { id: "reasoner" }] },
		kimi: { displayName: "Kimi", models: [{ id: "k2" }] },
	},
};

describe("useModelOptions 停用的服务商", () => {
	it("被停用（disabled）的服务商不出现在模型选项与分组里", () => {
		const { options, grouped } = renderOptions(config);

		expect(options.map((option) => option.key)).toEqual(["kimi/k2"]);
		expect([...grouped.keys()]).toEqual(["kimi"]);
	});

	it("重新启用后又会出现", () => {
		const { options } = renderOptions({
			...config,
			providers: { ...config.providers, deepseek: { displayName: "DeepSeek", models: [{ id: "chat" }] } },
		});

		expect(options.map((option) => option.key)).toEqual(["deepseek/chat", "kimi/k2"]);
	});

	it("默认模型属于被停用的服务商时不再当作默认，避免自动选中一个不可用的模型", () => {
		expect(renderOptions(config).defaultKey).toBeUndefined();
		expect(renderOptions({ ...config, defaultModel: "kimi/k2" }).defaultKey).toBe("kimi/k2");
	});
});

// @vitest-environment jsdom
import { magpieHandoverDialogAtom } from "@shared/store/magpie-handover-atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAGPIE_PLUGIN_NAME, useMagpieHandoverDialogModel } from "./useMagpieHandoverDialogModel";

vi.mock("react-i18next", () => {
	const translation = { t: (key: string) => key };
	return { useTranslation: () => translation };
});

const takeMagpieHandoverNotice = vi.fn();
const openExternal = vi.fn(async () => {});
const writeText = vi.fn(async () => {});

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, { vetta: { models: { takeMagpieHandoverNotice }, shell: { openExternal } } }),
);
Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText }, configurable: true });

// 每个用例一份独立的 jotai store,免得上一个用例的弹窗状态带过来。
function renderModel() {
	const store = createStore();
	const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children);
	return { store, ...renderHook(() => useMagpieHandoverDialogModel(), { wrapper }) };
}

describe("Magpie 接入方式变化提示", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("本次启动删过旧配置时弹出,并说明默认模型被清掉了", async () => {
		takeMagpieHandoverNotice.mockResolvedValue({ defaultModelCleared: true });
		const { result } = renderModel();
		await waitFor(() => expect(result.current.visible).toBe(true));
		expect(result.current.defaultModelCleared).toBe(true);

		act(() => result.current.onClose());
		expect(result.current.visible).toBe(false);
	});

	it("没有删过旧配置时不弹", async () => {
		takeMagpieHandoverNotice.mockResolvedValue(null);
		const { result } = renderModel();
		await waitFor(() => expect(takeMagpieHandoverNotice).toHaveBeenCalledOnce());
		expect(result.current.visible).toBe(false);
	});

	it("复制官方插件名并短暂显示已复制,说明链接指向官方插件仓库", async () => {
		takeMagpieHandoverNotice.mockResolvedValue({ defaultModelCleared: false });
		const { result } = renderModel();
		await waitFor(() => expect(result.current.visible).toBe(true));

		await act(async () => {
			result.current.onCopyPluginName();
		});
		expect(writeText).toHaveBeenCalledWith(MAGPIE_PLUGIN_NAME);
		expect(result.current.copied).toBe(true);

		result.current.onOpenGuide();
		expect(openExternal).toHaveBeenCalledWith("https://github.com/openvetta/magpie-vetta#readme");
	});

	it("从设置打开时是接入指南:不提移除,也没有默认模型提示", async () => {
		takeMagpieHandoverNotice.mockResolvedValue(null);
		const { result, store } = renderModel();
		await waitFor(() => expect(takeMagpieHandoverNotice).toHaveBeenCalledOnce());

		act(() => store.set(magpieHandoverDialogAtom, { reason: "guide" }));
		expect(result.current.visible).toBe(true);
		expect(result.current.defaultModelCleared).toBe(false);
		expect(result.current.labels.title).toBe("magpieHandover.guideTitle");
		expect(result.current.labels.description).toBe("magpieHandover.guideDescription");
	});
});

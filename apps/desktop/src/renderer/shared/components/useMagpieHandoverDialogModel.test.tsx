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

// 主进程这次要给的提示、界面领取的次数、写进剪贴板的内容、打开的链接,都按事实记下来。
let nextNotice: { defaultModelCleared: boolean } | null = null;
let noticesTaken = 0;
const clipboardWrites: string[] = [];
const openedUrls: string[] = [];
const takeMagpieHandoverNotice = async () => {
	noticesTaken += 1;
	return nextNotice;
};
const openExternal = async (url: string) => {
	openedUrls.push(url);
};
const writeText = async (text: string) => {
	clipboardWrites.push(text);
};

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
		nextNotice = null;
		noticesTaken = 0;
		clipboardWrites.length = 0;
		openedUrls.length = 0;
	});

	it("本次启动删过旧配置时弹出,并说明默认模型被清掉了", async () => {
		nextNotice = { defaultModelCleared: true };
		const { result } = renderModel();
		await waitFor(() => expect(result.current.visible).toBe(true));
		expect(result.current.defaultModelCleared).toBe(true);

		act(() => result.current.onClose());
		expect(result.current.visible).toBe(false);
	});

	it("没有删过旧配置时不弹", async () => {
		const { result } = renderModel();
		await waitFor(() => expect(noticesTaken).toBe(1));
		expect(result.current.visible).toBe(false);
	});

	it("复制官方插件名并短暂显示已复制,说明链接指向官方插件仓库", async () => {
		nextNotice = { defaultModelCleared: false };
		const { result } = renderModel();
		await waitFor(() => expect(result.current.visible).toBe(true));

		await act(async () => {
			result.current.onCopyPluginName();
		});
		expect(clipboardWrites).toEqual([MAGPIE_PLUGIN_NAME]);
		expect(result.current.copied).toBe(true);

		result.current.onOpenGuide();
		expect(openedUrls).toEqual(["https://github.com/openvetta/magpie-vetta#readme"]);
	});

	it("从设置打开时是接入指南:不提移除,也没有默认模型提示", async () => {
		const { result, store } = renderModel();
		await waitFor(() => expect(noticesTaken).toBe(1));

		act(() => store.set(magpieHandoverDialogAtom, { reason: "guide" }));
		expect(result.current.visible).toBe(true);
		expect(result.current.defaultModelCleared).toBe(false);
		expect(result.current.labels.title).toBe("magpieHandover.guideTitle");
		expect(result.current.labels.description).toBe("magpieHandover.guideDescription");
	});
});

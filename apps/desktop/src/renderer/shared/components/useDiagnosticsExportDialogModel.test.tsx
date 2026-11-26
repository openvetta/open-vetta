// @vitest-environment jsdom
import { diagnosticsExportDialogOpenAtom } from "@shared/store/diagnostics-export-atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIAGNOSTICS_ISSUE_URL, useDiagnosticsExportDialogModel } from "./useDiagnosticsExportDialogModel";

vi.mock("react-i18next", () => {
	const translation = { t: (key: string) => key };
	return { useTranslation: () => translation };
});

type ExportResult = { canceled: true } | { canceled: false; zipPath: string };

// 主进程这次的导出结果、打开的链接、在文件夹中显示的路径，都按事实记下来。
let nextExport: () => Promise<ExportResult> = async () => ({ canceled: true });
const exportCalls: unknown[] = [];
const openedUrls: string[] = [];
const revealedPaths: string[] = [];

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			diagnostics: {
				exportDiagnosticsPackage: (options: unknown) => {
					exportCalls.push(options);
					return nextExport();
				},
			},
			shell: {
				openExternal: async (url: string) => {
					openedUrls.push(url);
				},
				showItemInFolder: async (path: string) => {
					revealedPaths.push(path);
				},
			},
		},
	}),
);

function renderOpenDialog() {
	const store = createStore();
	store.set(diagnosticsExportDialogOpenAtom, true);
	const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children);
	return { store, ...renderHook(() => useDiagnosticsExportDialogModel(), { wrapper }) };
}

describe("导出诊断包弹窗", () => {
	beforeEach(() => {
		nextExport = async () => ({ canceled: true });
		exportCalls.length = 0;
		openedUrls.length = 0;
		revealedPaths.length = 0;
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("保存成功后显示保存位置，并能在文件夹中找到它", async () => {
		nextExport = async () => ({ canceled: false, zipPath: "/Users/me/Desktop/vetta-diagnostics.zip" });
		const { result } = renderOpenDialog();
		expect(result.current.visible).toBe(true);
		expect(result.current.phase).toBe("idle");

		act(() => result.current.onExport());
		await waitFor(() => expect(result.current.phase).toBe("done"));
		expect(result.current.savedFileName).toBe("/Users/me/Desktop/vetta-diagnostics.zip");
		expect(exportCalls).toEqual([{ dialogTitle: "diagnosticsExport.saveDialogTitle" }]);

		act(() => result.current.onShowInFolder());
		expect(revealedPaths).toEqual(["/Users/me/Desktop/vetta-diagnostics.zip"]);
	});

	it("在保存对话框里取消时回到初始状态，不算失败", async () => {
		const { result } = renderOpenDialog();
		act(() => result.current.onExport());
		await waitFor(() => expect(exportCalls).toHaveLength(1));
		await waitFor(() => expect(result.current.phase).toBe("idle"));
		expect(result.current.savedFileName).toBeUndefined();
	});

	it("导出失败时在弹窗里说明原因，可以再试一次", async () => {
		nextExport = async () => {
			throw new Error("disk full");
		};
		const { result } = renderOpenDialog();
		act(() => result.current.onExport());
		await waitFor(() => expect(result.current.phase).toBe("error"));
		expect(result.current.errorMessage).toBe("disk full");

		nextExport = async () => ({ canceled: false, zipPath: "/tmp/retry.zip" });
		act(() => result.current.onExport());
		await waitFor(() => expect(result.current.phase).toBe("done"));
		expect(result.current.errorMessage).toBeUndefined();
	});

	it("导出进行中再点不会重复弹保存对话框", async () => {
		let finish: (value: ExportResult) => void = () => {};
		nextExport = () => new Promise((resolve) => (finish = resolve));
		const { result } = renderOpenDialog();
		act(() => {
			result.current.onExport();
			result.current.onExport();
		});
		expect(result.current.phase).toBe("exporting");
		expect(exportCalls).toHaveLength(1);
		await act(async () => finish({ canceled: true }));
	});

	it("打开 GitHub 的 Bug 反馈页", () => {
		const { result } = renderOpenDialog();
		act(() => result.current.onOpenIssue());
		expect(openedUrls).toEqual([DIAGNOSTICS_ISSUE_URL]);
		expect(DIAGNOSTICS_ISSUE_URL).toContain("github.com/openvetta/open-vetta/issues/new");
	});

	it("关掉后重新打开从头开始", async () => {
		nextExport = async () => ({ canceled: false, zipPath: "/tmp/a.zip" });
		const { result, store } = renderOpenDialog();
		act(() => result.current.onExport());
		await waitFor(() => expect(result.current.phase).toBe("done"));

		act(() => result.current.onClose());
		expect(result.current.visible).toBe(false);
		act(() => store.set(diagnosticsExportDialogOpenAtom, true));
		await waitFor(() => expect(result.current.phase).toBe("idle"));
		expect(result.current.savedFileName).toBeUndefined();
	});
});

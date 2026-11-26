/**
 * @vitest-environment jsdom
 */
import type { UpdaterState } from "@preload/api";
import {
	updaterCurrentNotesDialogOpenAtom,
	updaterRestartDialogOpenAtom,
	updaterStateAtom,
} from "@shared/store/atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider, useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateRestartDialogModel } from "./useUpdateRestartDialogModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@shared/shortcuts", () => ({ useShortcutScope: () => undefined }));

const updater = {
	check: vi.fn(),
	download: vi.fn(),
	getCurrentReleaseNote: vi.fn(),
	install: vi.fn(),
};
const shell = { openExternal: vi.fn() };

beforeEach(() => {
	vi.clearAllMocks();
	updater.getCurrentReleaseNote.mockResolvedValue("## 新增\n\n- A");
	Object.defineProperty(window, "vetta", { configurable: true, value: { updater, shell } });
});

function setup() {
	// 每个用例独立的 store，避免对话框开关在用例之间残留。
	const store = createStore();
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	return renderHook(
		() => ({
		model: useUpdateRestartDialogModel(),
		setState: useSetAtom(updaterStateAtom),
		setUpdateOpen: useSetAtom(updaterRestartDialogOpenAtom),
		setNotesOpen: useSetAtom(updaterCurrentNotesDialogOpenAtom),
		updateOpen: useAtomValue(updaterRestartDialogOpenAtom),
		notesOpen: useAtomValue(updaterCurrentNotesDialogOpenAtom),
	}),
		{ wrapper },
	);
}

function open(result: ReturnType<typeof setup>["result"], state: UpdaterState) {
	act(() => {
		result.current.setState(state);
		result.current.setUpdateOpen(true);
	});
}

describe("useUpdateRestartDialogModel", () => {
	it("两个开关都关着时不可见", () => {
		const { result } = setup();
		expect(result.current.model.visible).toBe(false);
	});

	it("检查中：显示检查状态，只有关闭按钮", () => {
		const { result } = setup();
		open(result, { phase: "checking", currentVersion: "1.0.0" });
		expect(result.current.model.visible).toBe(true);
		expect(result.current.model.status?.kind).toBe("checking");
		expect(result.current.model.primary).toBeUndefined();
	});

	it("已是最新：主按钮跳到版本介绍并关掉更新对话框", async () => {
		const { result } = setup();
		open(result, { phase: "idle", currentVersion: "1.0.0" });
		expect(result.current.model.title).toBe("updateDialog.latestTitle");
		act(() => result.current.model.primary?.onClick());
		expect(result.current.updateOpen).toBe(false);
		expect(result.current.notesOpen).toBe(true);
		await waitFor(() => expect(result.current.model.releaseNote).toBe("## 新增\n\n- A"));
	});

	it("有新版本：带更新内容，主按钮触发下载，右上角关闭按钮关掉对话框", () => {
		const { result } = setup();
		open(result, { phase: "available", currentVersion: "1.0.0", latestVersion: "1.1.0", releaseNote: "- 新" });
		expect(result.current.model.releaseNote).toBe("- 新");
		act(() => result.current.model.primary?.onClick());
		expect(updater.download).toHaveBeenCalledTimes(1);
		act(() => result.current.model.onClose());
		expect(result.current.updateOpen).toBe(false);
	});

	it("跨多个版本更新：更早的各版折叠列出，可打开完整更新记录", () => {
		const { result } = setup();
		open(result, {
			phase: "available",
			currentVersion: "1.0.0",
			latestVersion: "1.3.0",
			releaseNote: "- 1.3",
			earlierReleaseNotes: [
				{ version: "1.2.0", note: "- 1.2" },
				{ version: "1.1.0", note: "- 1.1" },
			],
		});
		expect(result.current.model.releaseNote).toBe("- 1.3");
		expect(result.current.model.earlierReleaseNotes).toEqual([
			{ id: "1.2.0", note: "- 1.2", title: "updateDialog.versionHeading" },
			{ id: "1.1.0", note: "- 1.1", title: "updateDialog.versionHeading" },
		]);
		expect(result.current.model.earlierTitle).toBe("updateDialog.earlierTitle");
		act(() => result.current.model.viewAll?.onClick());
		expect(shell.openExternal).toHaveBeenCalledWith("https://github.com/openvetta/open-vetta/releases");
	});

	it("只跨一个版本时不显示更早的版本和完整记录入口", () => {
		const { result } = setup();
		open(result, { phase: "available", currentVersion: "1.0.0", latestVersion: "1.1.0", releaseNote: "- 新" });
		expect(result.current.model.earlierReleaseNotes).toBeUndefined();
		expect(result.current.model.viewAll).toBeUndefined();
	});

	it("下载中：进度条随进度变化，可后台继续", () => {
		const { result } = setup();
		open(result, { phase: "downloading", currentVersion: "1.0.0", latestVersion: "1.1.0", progress: 0.42 });
		expect(result.current.model.status).toMatchObject({ kind: "progress", progress: 0.42 });
		expect(result.current.model.primary).toBeUndefined();
	});

	it("已就绪：立即重启会先关对话框再安装", () => {
		const { result } = setup();
		open(result, { phase: "ready", currentVersion: "1.0.0", latestVersion: "1.1.0" });
		act(() => result.current.model.primary?.onClick());
		expect(updater.install).toHaveBeenCalledTimes(1);
		expect(result.current.updateOpen).toBe(false);
	});

	it("出错：显示原因，主按钮重试", () => {
		const { result } = setup();
		open(result, { phase: "error", currentVersion: "1.0.0", error: "boom" });
		expect(result.current.model.status).toEqual({ kind: "error", text: "boom" });
		act(() => result.current.model.primary?.onClick());
		expect(updater.check).toHaveBeenCalledTimes(1);
	});

	it("版本介绍：读不到说明时显示占位，读取失败同样兜底", async () => {
		updater.getCurrentReleaseNote.mockRejectedValue(new Error("x"));
		const { result } = setup();
		act(() => {
			result.current.setState({ phase: "idle", currentVersion: "1.0.0" });
			result.current.setNotesOpen(true);
		});
		await waitFor(() => expect(result.current.model.loading).toBe(false));
		expect(result.current.model.releaseNote).toBeUndefined();
		expect(result.current.model.emptyText).toBe("updateDialog.currentEmpty");
		act(() => result.current.model.onClose());
		expect(result.current.notesOpen).toBe(false);
	});
});

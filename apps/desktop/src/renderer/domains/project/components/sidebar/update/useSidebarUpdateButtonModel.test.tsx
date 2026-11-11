/**
 * @vitest-environment jsdom
 */
import { updaterRestartDialogOpenAtom, updaterStateAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { useAtomValue, useSetAtom } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { useSidebarUpdateButtonModel } from "./useSidebarUpdateButtonModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

function setup() {
	return renderHook(() => ({
		model: useSidebarUpdateButtonModel(),
		setState: useSetAtom(updaterStateAtom),
		dialogOpen: useAtomValue(updaterRestartDialogOpenAtom),
	}));
}

describe("useSidebarUpdateButtonModel", () => {
	it("非 ready 阶段不出现图标", () => {
		const { result } = setup();
		act(() => result.current.setState({ phase: "available", currentVersion: "1.0.0", latestVersion: "1.1.0" }));
		expect(result.current.model).toBeNull();
	});

	it("ready 阶段出现，点击打开更新对话框", () => {
		const { result } = setup();
		act(() => result.current.setState({ phase: "ready", currentVersion: "1.0.0", latestVersion: "1.1.0" }));
		expect(result.current.model).not.toBeNull();
		expect(result.current.dialogOpen).toBe(false);
		act(() => result.current.model?.onOpen());
		expect(result.current.dialogOpen).toBe(true);
	});
});

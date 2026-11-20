import { describe, expect, it } from "vitest";
import { openCanvasTab } from "../src/canvas/open-canvas-tab";

/** 模拟宿主面板：只记录面板翻开那一刻的宽度与打开参数。 */
function fakePanel() {
	const state: {
		width: number | "max";
		widthWhenOpened: number | "max" | null;
		opened: { tabId: string; options?: unknown } | null;
	} = { width: 360, widthWhenOpened: null, opened: null };
	return {
		state,
		ui: {
			setActivityPanelWidth(width: number | "max") {
				state.width = width;
			},
			openActivityTab(tabId: string, options?: unknown) {
				state.widthWhenOpened = state.width;
				state.opened = { tabId, options };
			},
		},
	};
}

describe("openCanvasTab", () => {
	it("面板翻开那一刻已经是全宽，一步滑到最终宽度", () => {
		const { state, ui } = fakePanel();
		openCanvasTab(ui);
		expect(state.widthWhenOpened).toBe("max");
		expect(state.opened).toEqual({ tabId: "canvas", options: { width: "max" } });
	});

	it("带上会话 cwd 时按该会话的面板打开", () => {
		const { state, ui } = fakePanel();
		openCanvasTab(ui, "/repo");
		expect(state.opened).toEqual({ tabId: "canvas", options: { width: "max", cwd: "/repo" } });
	});
});

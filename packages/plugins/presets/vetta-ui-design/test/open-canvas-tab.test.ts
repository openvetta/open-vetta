import { describe, expect, it, vi } from "vitest";
import { openCanvasTab } from "../src/canvas/open-canvas-tab";

describe("openCanvasTab", () => {
	it("在翻开面板之前先把宽度拉满，面板一步滑到最终宽度", () => {
		const calls: string[] = [];
		const ui = {
			setActivityPanelWidth: vi.fn(() => calls.push("width")),
			openActivityTab: vi.fn(() => calls.push("open")),
		};
		openCanvasTab(ui);
		expect(calls).toEqual(["width", "open"]);
		expect(ui.setActivityPanelWidth).toHaveBeenCalledWith("max");
		expect(ui.openActivityTab).toHaveBeenCalledWith("canvas", { width: "max" });
	});

	it("带上会话 cwd 时按该会话的面板打开", () => {
		const ui = { setActivityPanelWidth: vi.fn(), openActivityTab: vi.fn() };
		openCanvasTab(ui, "/repo");
		expect(ui.openActivityTab).toHaveBeenCalledWith("canvas", { width: "max", cwd: "/repo" });
	});
});

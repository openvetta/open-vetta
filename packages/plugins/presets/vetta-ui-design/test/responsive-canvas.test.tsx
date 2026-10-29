/**
 * 画布变窄时浮层的收紧：档位划分是纯函数；底部预设面板的分类 tab 在窄档收成下拉；
 * 底部工具栏收掉缩放加减；右上角按钮组收成图标。
 */
import { expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({
		t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join("/")}` : key),
	}),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { CanvasCornerActions } from "../src/canvas/CanvasCornerActions";
import { ControlBar } from "../src/canvas/ControlBar";
import { CategoryDropdown } from "../src/canvas/FrameSizeUi";
import { CORNER_RESERVE, densityOf } from "../src/canvas/responsive";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: React.ReactNode) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => root.render(node));
	return {
		host,
		cleanup: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

it("picks density tiers from the canvas width, widest tier first", () => {
	expect(densityOf(1280)).toEqual({ dock: "full", corner: "full" });
	expect(densityOf(700)).toEqual({ dock: "full", corner: "icons" });
	expect(densityOf(500)).toEqual({ dock: "compact", corner: "icons" });
	expect(densityOf(380)).toEqual({ dock: "tight", corner: "minimal" });
	// 阈值边界：恰好够宽就留在上一档。
	expect(densityOf(560).dock).toBe("full");
	expect(densityOf(559).dock).toBe("compact");
	expect(densityOf(400).dock).toBe("compact");
	expect(densityOf(399).dock).toBe("tight");
	expect(densityOf(760).corner).toBe("full");
	expect(densityOf(759).corner).toBe("icons");
	expect(densityOf(480).corner).toBe("icons");
	expect(densityOf(479).corner).toBe("minimal");
	// 越窄给右上角预留越少。
	expect(CORNER_RESERVE.full).toBeGreaterThan(CORNER_RESERVE.icons);
	expect(CORNER_RESERVE.icons).toBeGreaterThan(CORNER_RESERVE.minimal);
});

it("category dropdown opens upward, picks a category and closes on Escape", () => {
	const picked: string[] = [];
	const view = mount(<CategoryDropdown active="phone" onChange={(id) => picked.push(id)} />);
	const trigger = view.host.querySelector<HTMLButtonElement>("button[aria-haspopup='listbox']");
	expect(trigger?.textContent).toContain("canvas.size.category.phone");
	expect(view.host.querySelector("[role='listbox']")).toBeNull();

	act(() => trigger?.click());
	const list = view.host.querySelector("[role='listbox']");
	expect(list?.className).toContain("bottom-full");
	const options = [...view.host.querySelectorAll<HTMLButtonElement>("[role='option']")];
	expect(options).toHaveLength(5);
	expect(options[0]?.getAttribute("aria-selected")).toBe("true");

	act(() => options[3]?.click());
	expect(picked).toEqual(["paper"]);
	expect(view.host.querySelector("[role='listbox']")).toBeNull();

	act(() => trigger?.click());
	act(() => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
	});
	expect(view.host.querySelector("[role='listbox']")).toBeNull();
	view.cleanup();
});

const barProps = {
	tool: "select" as const,
	zoom: { get: () => 1, subscribe: () => () => {} },
	designSystemsActive: false,
	pendingNotes: 0,
	notesVisible: true,
	onToggleNotes: () => {},
	onToolChange: () => {},
	onZoomDelta: () => {},
	onZoomReset: () => {},
	onDesignSystems: () => {},
};

it("toolbar drops zoom in/out when compact but keeps the zoom readout, and never exceeds the viewport", () => {
	const full = mount(<ControlBar {...barProps} density="full" />);
	expect(full.host.querySelector("button[aria-label='controlbar.zoomIn']")).not.toBeNull();
	full.cleanup();

	const compact = mount(<ControlBar {...barProps} density="compact" />);
	expect(compact.host.querySelector("button[aria-label='controlbar.zoomIn']")).toBeNull();
	expect(compact.host.querySelector("button[aria-label='controlbar.zoomOut']")).toBeNull();
	expect(compact.host.querySelector("button[aria-label='controlbar.zoomReset']")?.textContent).toBe("100%");
	const wrapper = compact.host.firstElementChild as HTMLElement;
	expect(wrapper.style.maxWidth).toBe("calc(100% - 24px)");
	compact.cleanup();

	const tight = mount(<ControlBar {...barProps} density="tight" />);
	expect(tight.host.querySelector(".overflow-x-auto")).not.toBeNull();
	tight.cleanup();
});

const cornerProps = {
	offsetTop: 0,
	historyOpen: false,
	onExport: () => {},
	materials: { selectedCount: 0, totalCount: 1, progress: null, onPick: () => {} },
	onToggleHistory: () => {},
};

it("corner actions keep their labels in full and lose history/export text in icons", () => {
	const full = mount(<CanvasCornerActions {...cornerProps} density="full" />);
	expect(full.host.textContent).toContain("controlbar.history");
	expect(full.host.textContent).toContain("canvas.export.label");
	full.cleanup();

	const icons = mount(<CanvasCornerActions {...cornerProps} density="icons" />);
	expect(icons.host.textContent).not.toContain("controlbar.history");
	expect(icons.host.textContent).not.toContain("canvas.export.label");
	// 只剩图标时仍要有可读的名字。
	expect(icons.host.querySelector("button[aria-label='controlbar.history']")).not.toBeNull();
	expect(icons.host.querySelector("button[aria-label='canvas.export.label']")).not.toBeNull();
	icons.cleanup();
});

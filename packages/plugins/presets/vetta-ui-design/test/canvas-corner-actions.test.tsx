/**
 * 画布右上角按钮组的构成与顺序：运行在最右，中间是
 * 版本历史 / 导出。顺序是产品要求，不是实现细节，
 * 所以按 DOM 顺序断言。
 */
import { expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { CanvasCornerActions } from "../src/canvas/CanvasCornerActions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Rendered {
	buttons: HTMLButtonElement[];
	calls: string[];
	cleanup(): void;
}

function render(): Rendered {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	const calls: string[] = [];
	act(() => {
		root.render(
			<CanvasCornerActions
				offsetTop={0}
				historyOpen={false}
				onExport={() => calls.push("export")}
				materials={{ selectedCount: 0, totalCount: 1, progress: null, onPick: (action) => calls.push(action) }}
				onToggleHistory={() => calls.push("history")}
			/>,
		);
	});
	return {
		buttons: [...host.querySelectorAll("button")],
		calls,
		cleanup: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

it("orders the group as history export, with no run or refresh button", () => {
	const { buttons, cleanup } = render();
	expect(buttons.map((button) => button.getAttribute("aria-label") ?? button.getAttribute("title"))).toEqual([
		"controlbar.history",
		"canvas.export.label",
	]);
	// 两个按钮各自是独立的全圆角胶囊，不再合在一条 bar 里。
	for (const button of buttons) expect(button.className).toMatch(/rounded-full/);
	expect(buttons[0]?.textContent).toContain("controlbar.history");
	expect(buttons[1]?.textContent).toContain("canvas.export.label");
	cleanup();
});

it("puts the trailing slot (design / interaction toggle) at the far right of the group", () => {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => {
		root.render(
			<CanvasCornerActions
				offsetTop={0}
				historyOpen={false}
				onExport={() => {}}
				materials={{ selectedCount: 0, totalCount: 1, progress: null, onPick: () => {} }}
				onToggleHistory={() => {}}
				trailing={<span data-testid="toggle">t</span>}
			/>,
		);
	});
	expect(host.firstElementChild?.lastElementChild?.getAttribute("data-testid")).toBe("toggle");
	act(() => root.unmount());
	host.remove();
});

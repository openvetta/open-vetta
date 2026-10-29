/**
 * 底部工具栏最左边的撤销 / 重做：栈为空时灰显且点不动，提示里带栈顶那一步的名字。
 */
import { expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({
		t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join("/")}` : key),
	}),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ControlBar } from "../src/canvas/ControlBar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(history: Parameters<typeof ControlBar>[0]["history"]) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => {
		root.render(
			<ControlBar
				tool="select"
				zoom={{ get: () => 1, subscribe: () => () => {} }}
				designSystemsActive={false}
				pendingNotes={0}
				notesVisible
				onToggleNotes={() => {}}
				history={history}
				onToolChange={() => {}}
				onZoomDelta={() => {}}
				onZoomReset={() => {}}
				onDesignSystems={() => {}}
			/>,
		);
	});
	return {
		host,
		button: (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`),
		cleanup: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

it("disables undo / redo when the stacks are empty and names the action otherwise", () => {
	const calls: string[] = [];
	const view = render({
		canUndo: true,
		canRedo: false,
		undoLabel: "调整尺寸",
		redoLabel: null,
		onUndo: () => calls.push("undo"),
		onRedo: () => calls.push("redo"),
	});
	const undo = view.button("undo.tip.undo");
	expect(undo?.getAttribute("aria-label")).toBe("undo.tip.undo:调整尺寸");
	expect(undo?.disabled).toBe(false);
	const redo = view.button("controlbar.redo");
	expect(redo?.disabled).toBe(true);

	act(() => undo?.click());
	act(() => redo?.click());
	expect(calls).toEqual(["undo"]);
	view.cleanup();
});

it("hides the group when no history is wired", () => {
	const view = render(undefined);
	expect(view.button("controlbar.undo")).toBeNull();
	view.cleanup();
});

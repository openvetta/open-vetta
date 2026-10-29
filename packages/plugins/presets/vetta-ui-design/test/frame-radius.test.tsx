/**
 * 圆角手柄：四个角各一个圆点，往 frame 里面拖变大、往外拖变小，结果取整并钳在 [0, 短边/2]；
 * 悬停和拖拽时浮出数值；松手才提交，拖拽中只走实时回调。
 */
import { expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({
		t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join("/")}` : key),
	}),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { FrameRadiusHandles, radiusFromDrag } from "../src/canvas/FrameRadiusHandles";
import { DEFAULT_FRAME_RADIUS, frameRadius } from "../src/vetd/manifest-types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("maps pointer movement to radius per corner, scaled by zoom and clamped", () => {
	// 左上角：往右下拖 = 往里 = 变大；缩放 2 倍时同样的屏幕位移只算一半。
	expect(radiusFromDrag(12, "nw", 20, 20, 1, 100)).toBe(32);
	expect(radiusFromDrag(12, "nw", 20, 20, 2, 100)).toBe(22);
	// 右下角：往左上拖才是往里。
	expect(radiusFromDrag(12, "se", -20, -20, 1, 100)).toBe(32);
	expect(radiusFromDrag(12, "se", 20, 20, 1, 100)).toBe(0);
	// 钳制：不小于 0，不超过短边一半。
	expect(radiusFromDrag(12, "ne", 500, -500, 1, 100)).toBe(0);
	expect(radiusFromDrag(12, "sw", 500, -500, 1, 100)).toBe(100);
});

it("defaults to 12px and never exceeds half of the short side", () => {
	expect(frameRadius({ width: 300, height: 300 })).toBe(DEFAULT_FRAME_RADIUS);
	expect(frameRadius({ width: 300, height: 300, radius: 0 })).toBe(0);
	expect(frameRadius({ width: 300, height: 40, radius: 62 })).toBe(20);
});

function pointer(type: string, init: { clientX: number; clientY: number; pointerId?: number }): PointerEvent {
	const event = new MouseEvent(type, { bubbles: true, clientX: init.clientX, clientY: init.clientY, button: 0 });
	Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
	return event as PointerEvent;
}

it("renders four handles, labels the hovered one, and commits only on release", () => {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	const drafts: Array<number | null> = [];
	const commits: number[] = [];
	act(() => {
		root.render(
			<FrameRadiusHandles
				radius={20}
				max={100}
				getZoom={() => 1}
				onDraft={(value) => drafts.push(value)}
				onCommit={(value) => commits.push(value)}
			/>,
		);
	});
	const handles = [...host.querySelectorAll<HTMLElement>("[data-vetd-radius-handle]")];
	expect(handles.map((handle) => handle.dataset.vetdRadiusHandle)).toEqual(["nw", "ne", "sw", "se"]);
	expect(host.textContent).not.toContain("canvas.radius.label");

	const nw = handles[0] as HTMLElement;
	nw.setPointerCapture = () => {};
	act(() => {
		nw.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
		nw.dispatchEvent(new MouseEvent("pointerenter"));
	});
	expect(host.textContent).toContain("canvas.radius.label:20");

	act(() => {
		nw.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0 }));
	});
	act(() => {
		nw.dispatchEvent(pointer("pointermove", { clientX: 10, clientY: 10 }));
	});
	// 拖拽中只有实时值，还没落盘。
	expect(drafts).toEqual([30]);
	expect(commits).toEqual([]);
	act(() => {
		nw.dispatchEvent(pointer("pointerup", { clientX: 10, clientY: 10 }));
	});
	expect(commits).toEqual([30]);
	expect(drafts.at(-1)).toBeNull();

	act(() => root.unmount());
	host.remove();
});

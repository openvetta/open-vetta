/**
 * 点阵光晕：监听挂在父容器上，位置只写 CSS 变量、每帧最多一次，不走 React 状态。
 * 视觉（点距、遮罩）是 CSS，测不了；这里钉住的是「不卡」的那几条行为约束。
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CanvasDotGlow } from "../src/canvas/CanvasDotGlow";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let frames: FrameRequestCallback[];
let host: HTMLDivElement;
let unmount: () => void;

beforeEach(() => {
	frames = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
	vi.stubGlobal("cancelAnimationFrame", () => {});
	host = document.createElement("div");
	host.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => root.render(<CanvasDotGlow />));
	unmount = () => act(() => root.unmount());
});

afterEach(() => {
	unmount();
	host.remove();
	vi.unstubAllGlobals();
});

function move(x: number, y: number): void {
	host.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
}

it("coalesces pointer moves into one CSS-variable write per frame, relative to the host", () => {
	const glow = host.querySelector<HTMLElement>(".vetd-dot-glow");
	host.dispatchEvent(new MouseEvent("pointerenter"));
	move(150, 90);
	move(180, 120);
	move(210, 150);
	// 三次移动只排一帧，而且这一帧还没跑：此刻一个变量都没写。
	expect(frames).toHaveLength(1);
	expect(glow?.style.getPropertyValue("--vetd-glow-x")).toBe("");
	frames[0]?.(0);
	// 取最后一次位置，换算成容器内坐标。
	expect(glow?.style.getPropertyValue("--vetd-glow-x")).toBe("110px");
	expect(glow?.style.getPropertyValue("--vetd-glow-y")).toBe("100px");
	// 下一次移动重新排帧。
	move(160, 60);
	expect(frames).toHaveLength(2);
});

it("fades in on enter and out on leave through a CSS variable", () => {
	const glow = host.querySelector<HTMLElement>(".vetd-dot-glow");
	host.dispatchEvent(new MouseEvent("pointerenter"));
	expect(glow?.style.getPropertyValue("--vetd-glow-on")).toBe("1");
	host.dispatchEvent(new MouseEvent("pointerleave"));
	expect(glow?.style.getPropertyValue("--vetd-glow-on")).toBe("0");
});

it("removes its listeners on unmount", () => {
	unmount();
	move(150, 90);
	expect(frames).toHaveLength(0);
	// afterEach 会再卸载一次：给它一个空实现。
	unmount = () => {};
});

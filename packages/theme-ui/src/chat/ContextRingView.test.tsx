// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextRingView } from "./ContextRingView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Radix 的定位靠 floating-ui 的 autoUpdate，jsdom 没有 ResizeObserver。
if (typeof globalThis.ResizeObserver === "undefined") {
	class NoopResizeObserver implements ResizeObserver {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	}
	Object.assign(globalThis, { ResizeObserver: NoopResizeObserver });
}

// 同一批 jsdom 版本也没有 PointerEvent，而 Radix 靠它区分鼠标与触摸。
if (typeof globalThis.PointerEvent === "undefined") {
	class MousePointerEvent extends MouseEvent {
		readonly pointerType: string;
		constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
			super(type, init);
			this.pointerType = init.pointerType ?? "mouse";
		}
	}
	Object.assign(globalThis, { PointerEvent: MousePointerEvent });
}

const TOOLTIP = "上下文已使用 234k tokens（22.4%，1.0M 窗口）";

describe("ContextRingView tooltip", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("悬停提示挂在 body 上，不留在输入栏那一列里被裁掉、被活动面板盖住", async () => {
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		await act(async () => root.render(view()));

		const trigger = container.firstElementChild;
		if (!(trigger instanceof HTMLElement)) throw new Error("missing ring trigger");
		await act(async () => {
			trigger.dispatchEvent(pointerEvent("pointerenter", false));
			trigger.dispatchEvent(pointerEvent("pointermove", true));
			vi.advanceTimersByTime(300);
		});

		const tip = document.querySelector('[role="tooltip"]');
		expect(tip?.textContent).toBe(TOOLTIP);
		// 关键断言：提示不是触发器的后代。留在原地的话父级的 overflow-clip 会裁掉它，
		// isolate 又把它关在自己的层里，压不过右边的活动面板。
		expect(container.contains(tip as Node)).toBe(false);
		expect(document.body.contains(tip as Node)).toBe(true);

		await act(async () => root.unmount());
		container.remove();
	});
});

function view(): ReactElement {
	return createElement(ContextRingView, {
		percent: 22.4,
		offset: 10,
		color: "currentColor",
		isCompacting: false,
		tooltip: TOOLTIP,
	});
}

function pointerEvent(type: string, bubbles: boolean): PointerEvent {
	return new PointerEvent(type, { bubbles, pointerType: "mouse", clientX: 0, clientY: 0 });
}

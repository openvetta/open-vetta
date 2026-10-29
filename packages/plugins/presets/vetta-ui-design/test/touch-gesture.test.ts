import { describe, expect, it } from "vitest";
import {
	DRAG_THRESHOLD,
	DragTracker,
	FLICK_VELOCITY,
	INERTIA_MIN_VELOCITY,
	inertiaStep,
	snapNudge,
} from "../engine/src/touch-gesture";

describe("DragTracker", () => {
	it("没超过阈值仍是点击，没有主轴", () => {
		const tracker = new DragTracker(100, 100, 0);
		const { axis } = tracker.move(100 + DRAG_THRESHOLD - 1, 100, 10);
		expect(axis).toBeNull();
		expect(tracker.dragging).toBe(false);
		expect(tracker.release(20)).toBe(0);
	});

	it("超过阈值按位移更大的一轴定主轴，之后不再改", () => {
		const tracker = new DragTracker(100, 100, 0);
		expect(tracker.move(100, 130, 10).axis).toBe("y");
		expect(tracker.move(400, 140, 20).axis).toBe("y");
		const horizontal = new DragTracker(0, 0, 0);
		expect(horizontal.move(40, 5, 10).axis).toBe("x");
	});

	it("松手速度只看最后一小段，符号跟手指方向", () => {
		const tracker = new DragTracker(0, 0, 0);
		tracker.move(0, 100, 20); // 早先快速向下
		tracker.move(0, 100, 150); // 然后停住
		tracker.move(0, 90, 200);
		tracker.move(0, 80, 240);
		const velocity = tracker.release(250);
		expect(velocity).toBeLessThan(0);
		expect(velocity).toBeCloseTo(-20 / 100, 1);
	});
});

describe("inertiaStep", () => {
	it("速度衰减，慢到阈值以下就停", () => {
		const first = inertiaStep(1, 16.67);
		expect(first?.velocity).toBeLessThan(1);
		expect(first?.distance).toBeCloseTo(16.67, 1);
		expect(inertiaStep(INERTIA_MIN_VELOCITY / 2, 16)).toBeNull();
	});

	it("掉帧时衰减得更多", () => {
		const normal = inertiaStep(1, 16.67);
		const dropped = inertiaStep(1, 50);
		expect(dropped?.velocity).toBeLessThan(normal?.velocity ?? 0);
	});
});

describe("snapNudge（吸附容器松手时多推半页）", () => {
	it("慢拖不推，快甩沿滚动方向推半页", () => {
		expect(snapNudge(FLICK_VELOCITY / 2, 208)).toBe(0);
		expect(snapNudge(-FLICK_VELOCITY / 2, 208)).toBe(0);
		expect(snapNudge(FLICK_VELOCITY * 2, 208)).toBe(104);
		expect(snapNudge(-FLICK_VELOCITY * 2, 208)).toBe(-104);
	});
});

/**
 * 把鼠标当手指用的手势判定，纯逻辑，不碰 DOM（DOM 那半在 touch.ts）。
 *
 * 一次按下到松开只会是三种之一：点击（没怎么动）、拖动（超过阈值，按主轴滚动）、
 * 长按（不动且超时）。
 */
export type Axis = "x" | "y";

/** 移动超过这个距离（px）才算拖动，之前的抖动仍然是点击。 */
export const DRAG_THRESHOLD = 6;
/** 按住不动超过这个时间（ms）算长按。 */
export const LONG_PRESS_MS = 500;
/** 惯性每帧衰减系数与停止速度（px/ms）。 */
export const INERTIA_DECAY = 0.95;
export const INERTIA_MIN_VELOCITY = 0.02;
/** 只用最近这段时间（ms）的样本估算松手速度，更早的是减速前的动作。 */
const VELOCITY_WINDOW_MS = 100;

interface Sample {
	x: number;
	y: number;
	time: number;
}

export class DragTracker {
	private readonly startX: number;
	private readonly startY: number;
	private readonly samples: Sample[] = [];
	private axisValue: Axis | null = null;

	constructor(x: number, y: number, time: number) {
		this.startX = x;
		this.startY = y;
		this.samples.push({ x, y, time });
	}

	/** 是否已经进入拖动；一旦进入，主轴就定了，之后沿另一轴的抖动不再影响滚动。 */
	get dragging(): boolean {
		return this.axisValue !== null;
	}

	get axis(): Axis | null {
		return this.axisValue;
	}

	/** 返回自按下以来的总位移；还没超过阈值时 axis 为 null。 */
	move(x: number, y: number, time: number): { dx: number; dy: number; axis: Axis | null } {
		const dx = x - this.startX;
		const dy = y - this.startY;
		this.samples.push({ x, y, time });
		if (this.axisValue === null && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
			this.axisValue = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
		}
		return { dx, dy, axis: this.axisValue };
	}

	/** 松手瞬间的速度（px/ms，沿主轴，符号与手指移动方向一致）。 */
	release(time: number): number {
		if (this.axisValue === null) return 0;
		const recent = this.samples.filter((sample) => time - sample.time <= VELOCITY_WINDOW_MS);
		const first = recent[0];
		const last = recent[recent.length - 1];
		if (!first || !last || last.time === first.time) return 0;
		const distance = this.axisValue === "x" ? last.x - first.x : last.y - first.y;
		return distance / (last.time - first.time);
	}
}

/** 惯性的一帧：返回这一帧该滚的距离与衰减后的速度；速度过小返回 null 表示停下。 */
export function inertiaStep(velocity: number, elapsedMs: number): { distance: number; velocity: number } | null {
	if (Math.abs(velocity) < INERTIA_MIN_VELOCITY) return null;
	// 衰减按 60fps 为一帧折算，掉帧时衰减得更多，手感与帧率无关。
	const frames = elapsedMs / (1000 / 60);
	return { distance: velocity * elapsedMs, velocity: velocity * INERTIA_DECAY ** frames };
}

/**
 * 交互模式下的「手机触摸」：把鼠标变成手指。
 *
 * 灰色圆点光标、按住拖动滚动（带惯性）、长按触发 contextmenu。滚轮不处理，保持原生滚动。
 * 不派发真正的 TouchEvent：设计稿是原型，很少依赖触摸事件，合成它反而容易和 click 打架。
 * 由宿主通过 bridge 的 `interaction-config` 消息开关。
 */
import { DragTracker, inertiaStep, LONG_PRESS_MS, type Axis } from "./touch-gesture";

const STYLE_ID = "vetd-touch-style";
const DOT_ID = "vetd-touch-dot";
const DOT_SIZE = 28;

let installed: (() => void) | null = null;

/** 沿 axis 方向还能滚动的、离 target 最近的祖先；找不到就是文档本身。 */
function findScroller(target: Element | null, axis: Axis): HTMLElement {
	for (let node: Element | null = target; node && node !== document.documentElement; node = node.parentElement) {
		const style = getComputedStyle(node);
		const overflow = axis === "x" ? style.overflowX : style.overflowY;
		if (overflow !== "auto" && overflow !== "scroll") continue;
		const element = node as HTMLElement;
		const scrollable = axis === "x" ? element.scrollWidth > element.clientWidth : element.scrollHeight > element.clientHeight;
		if (scrollable) return element;
	}
	return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

function scrollBy(element: HTMLElement, axis: Axis, delta: number): void {
	if (axis === "x") element.scrollLeft += delta;
	else element.scrollTop += delta;
}

/** 输入类元素上的按下是在聚焦 / 选字 / 拖滑块，不是滚动手势。 */
function isEditable(target: Element | null): boolean {
	return !!target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}

function install(): () => void {
	const style = document.createElement("style");
	style.id = STYLE_ID;
	// 手机上文字和图片不能被拖选 / 拖走：不禁掉的话，按住链接拖动会变成浏览器的拖放。
	style.textContent = [
		"html[data-vetd-touch], html[data-vetd-touch] * { cursor: none !important; -webkit-user-drag: none; }",
		"html[data-vetd-touch] *:not(input):not(textarea):not([contenteditable]) { user-select: none; -webkit-user-select: none; }",
	].join("\n");
	document.head.appendChild(style);

	const dot = document.createElement("div");
	dot.id = DOT_ID;
	dot.setAttribute("data-vetd-overlay", "");
	Object.assign(dot.style, {
		position: "fixed",
		left: "0",
		top: "0",
		width: `${DOT_SIZE}px`,
		height: `${DOT_SIZE}px`,
		borderRadius: "50%",
		background: "rgba(120, 120, 128, 0.55)",
		border: "1px solid rgba(255, 255, 255, 0.7)",
		boxShadow: "0 1px 4px rgba(0, 0, 0, 0.25)",
		pointerEvents: "none",
		zIndex: "2147483647",
		opacity: "0",
		transition: "opacity 120ms, scale 120ms",
		translate: "-100px -100px",
	});
	document.documentElement.appendChild(dot);
	document.documentElement.setAttribute("data-vetd-touch", "");

	let tracker: DragTracker | null = null;
	let downTarget: Element | null = null;
	let scroller: HTMLElement | null = null;
	let lastX = 0;
	let lastY = 0;
	let longPressTimer = 0;
	/** 这次按下已经被拖动或长按消费，随后的 click 要吞掉。 */
	let swallowClick = false;
	let inertiaFrame = 0;

	const place = (x: number, y: number): void => {
		dot.style.translate = `${x - DOT_SIZE / 2}px ${y - DOT_SIZE / 2}px`;
		dot.style.opacity = "1";
	};

	const stopInertia = (): void => {
		cancelAnimationFrame(inertiaFrame);
		inertiaFrame = 0;
	};

	const onMouseMove = (event: MouseEvent): void => {
		place(event.clientX, event.clientY);
		if (!tracker) return;
		const { axis } = tracker.move(event.clientX, event.clientY, event.timeStamp);
		if (!axis) return;
		window.clearTimeout(longPressTimer);
		swallowClick = true;
		// 拖动期间不选字。
		window.getSelection()?.removeAllRanges();
		scroller ??= findScroller(downTarget, axis);
		// 逐帧增量：手指往上拖，内容往上走，scrollTop 增加。
		const delta = axis === "x" ? lastX - event.clientX : lastY - event.clientY;
		scrollBy(scroller, axis, delta);
		lastX = event.clientX;
		lastY = event.clientY;
	};

	const onMouseDown = (event: MouseEvent): void => {
		if (event.button !== 0) return;
		stopInertia();
		place(event.clientX, event.clientY);
		dot.style.scale = "0.78";
		downTarget = event.target instanceof Element ? event.target : null;
		swallowClick = false;
		if (isEditable(downTarget)) {
			tracker = null;
			return;
		}
		tracker = new DragTracker(event.clientX, event.clientY, event.timeStamp);
		scroller = null;
		lastX = event.clientX;
		lastY = event.clientY;
		longPressTimer = window.setTimeout(() => {
			if (!tracker || tracker.dragging || !downTarget) return;
			swallowClick = true;
			downTarget.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: lastX, clientY: lastY }),
			);
		}, LONG_PRESS_MS);
	};

	const onMouseUp = (event: MouseEvent): void => {
		dot.style.scale = "1";
		window.clearTimeout(longPressTimer);
		const axis = tracker?.axis ?? null;
		const velocity = tracker?.release(event.timeStamp) ?? 0;
		const target = scroller;
		tracker = null;
		if (!axis || !target) return;
		// 手指拖动方向与滚动方向相反。
		let v = -velocity;
		let previous = performance.now();
		const tick = (now: number): void => {
			const step = inertiaStep(v, now - previous);
			previous = now;
			if (!step) {
				inertiaFrame = 0;
				return;
			}
			scrollBy(target, axis, step.distance);
			v = step.velocity;
			inertiaFrame = requestAnimationFrame(tick);
		};
		inertiaFrame = requestAnimationFrame(tick);
	};

	const onClick = (event: MouseEvent): void => {
		if (!swallowClick) return;
		swallowClick = false;
		event.preventDefault();
		event.stopPropagation();
	};

	const onLeave = (event: MouseEvent): void => {
		if (event.relatedTarget === null) dot.style.opacity = "0";
	};

	const onWheel = (): void => stopInertia();

	// 链接和图片的原生拖放会吞掉后续的 mousemove，滚动手势就断了。
	const onDragStart = (event: DragEvent): void => event.preventDefault();

	document.addEventListener("mousemove", onMouseMove, true);
	document.addEventListener("mousedown", onMouseDown, true);
	document.addEventListener("mouseup", onMouseUp, true);
	document.addEventListener("click", onClick, true);
	document.addEventListener("mouseout", onLeave, true);
	document.addEventListener("wheel", onWheel, { capture: true, passive: true });
	document.addEventListener("dragstart", onDragStart, true);

	return () => {
		stopInertia();
		window.clearTimeout(longPressTimer);
		document.removeEventListener("mousemove", onMouseMove, true);
		document.removeEventListener("mousedown", onMouseDown, true);
		document.removeEventListener("mouseup", onMouseUp, true);
		document.removeEventListener("click", onClick, true);
		document.removeEventListener("mouseout", onLeave, true);
		document.removeEventListener("wheel", onWheel, true);
		document.removeEventListener("dragstart", onDragStart, true);
		document.documentElement.removeAttribute("data-vetd-touch");
		style.remove();
		dot.remove();
	};
}

/** 开 / 关触摸模拟；重复开关是幂等的。 */
export function setTouchMode(enabled: boolean): void {
	if (enabled && !installed) installed = install();
	else if (!enabled && installed) {
		installed();
		installed = null;
	}
}

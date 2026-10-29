import { useEffect, useRef } from "react";

/**
 * 画布点阵上跟着鼠标的光晕。
 *
 * 光晕是第二层同样的点阵，只是更亮，再用径向渐变做遮罩、圆心跟着指针——所以它亮起来
 * 的恰好是指针附近那些点，和底下的暗点严丝合缝对齐。
 *
 * 为什么不会卡：
 * - 没有 JS 动画，也不走 React 状态。pointermove 里只改这一层自己的两个 CSS 变量，
 *   每帧最多一次（rAF 合并），重绘范围就是这一个元素，不碰 world 和 frame。
 * - 淡入淡出（离开画布、缩放/平移期间收起）是 CSS 的 opacity 过渡。
 * - 它是画布容器的第一个子节点、在 world 之下，被 frame 盖住的地方本来就看不见。
 *
 * 监听挂在父元素（画布容器）上：画布和只读预览共用，各放一个 <CanvasDotGlow /> 即可。
 */
export function CanvasDotGlow() {
	const glowRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const glow = glowRef.current;
		const host = glow?.parentElement;
		if (!glow || !host) return;

		let frame = 0;
		let x = 0;
		let y = 0;
		/** 容器在视口里的位置：进入时量一次，免得每次移动都强制一次布局。 */
		let left = 0;
		let top = 0;

		const paint = (): void => {
			frame = 0;
			glow.style.setProperty("--vetd-glow-x", `${x}px`);
			glow.style.setProperty("--vetd-glow-y", `${y}px`);
		};
		const onEnter = (): void => {
			const rect = host.getBoundingClientRect();
			left = rect.left;
			top = rect.top;
			glow.style.setProperty("--vetd-glow-on", "1");
		};
		const onMove = (event: PointerEvent): void => {
			x = event.clientX - left;
			y = event.clientY - top;
			if (frame === 0) frame = requestAnimationFrame(paint);
		};
		const onLeave = (): void => {
			glow.style.setProperty("--vetd-glow-on", "0");
		};

		host.addEventListener("pointerenter", onEnter);
		host.addEventListener("pointermove", onMove, { passive: true });
		host.addEventListener("pointerleave", onLeave);
		return () => {
			host.removeEventListener("pointerenter", onEnter);
			host.removeEventListener("pointermove", onMove);
			host.removeEventListener("pointerleave", onLeave);
			if (frame !== 0) cancelAnimationFrame(frame);
		};
	}, []);

	return <div ref={glowRef} className="vetd-dot-glow" aria-hidden />;
}

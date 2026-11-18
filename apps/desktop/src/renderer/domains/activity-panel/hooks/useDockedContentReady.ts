import { type RefObject, useEffect, useState } from "react";

// Also used when switching to the responsive sheet or when Chromium skips a transition.
export const DOCKED_CONTENT_FALLBACK_MS = 260;

/**
 * 停靠内容是否可以挂载：面板已打开且滑出过渡已结束。
 *
 * 首次渲染就处于打开态时没有过渡可等，直接就绪；关闭时立刻回到未就绪，
 * 下次打开重新等一遍。
 */
export function useDockedContentReady(
	isOpen: boolean,
	narrowSheet: boolean,
	surfaceRef: RefObject<HTMLDivElement | null>,
): boolean {
	const [ready, setReady] = useState(isOpen);
	useEffect(() => {
		if (!isOpen) {
			setReady(false);
			return;
		}
		if (ready) return;
		const surface = narrowSheet ? null : surfaceRef.current;
		const settle = (): void => setReady(true);
		if (surface && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
			settle();
			return;
		}
		const onTransitionEnd = (event: TransitionEvent): void => {
			if (event.target === surface && event.propertyName === "transform") settle();
		};
		surface?.addEventListener("transitionend", onTransitionEnd);
		const timer = window.setTimeout(settle, DOCKED_CONTENT_FALLBACK_MS);
		return () => {
			surface?.removeEventListener("transitionend", onTransitionEnd);
			window.clearTimeout(timer);
		};
	}, [isOpen, narrowSheet, ready, surfaceRef]);
	return isOpen && ready;
}

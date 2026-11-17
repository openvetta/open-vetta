import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeUiZoomFactor, UI_ZOOM_DEFAULT } from "@/shared/ui-zoom";

/**
 * 主窗口界面缩放。比例的事实源在主进程（滑块与 Cmd +/- 都改它），这里只镜像：
 * 拖动时本地值立即跟手，写主进程按帧节流；主进程广播（含快捷键触发）再同步回来。
 */
export function useUiZoom(): {
	factor: number;
	loaded: boolean;
	setFactor: (value: number) => void;
	reset: () => void;
} {
	const [factor, setFactorState] = useState(UI_ZOOM_DEFAULT);
	// factor 在读到主进程的值之前只是占位默认值，不能拿它去纠正实际缩放。
	const [loaded, setLoaded] = useState(false);
	const pendingRef = useRef<number | null>(null);
	const frameRef = useRef<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		void window.vetta.uiZoom.get().then((value) => {
			if (cancelled) return;
			setFactorState(normalizeUiZoomFactor(value));
			setLoaded(true);
		});
		const off = window.vetta.uiZoom.onChanged((value) => setFactorState(normalizeUiZoomFactor(value)));
		return () => {
			cancelled = true;
			off();
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		};
	}, []);

	const setFactor = useCallback((value: number) => {
		const next = normalizeUiZoomFactor(value);
		setFactorState(next);
		pendingRef.current = next;
		if (frameRef.current !== null) return;
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			const pending = pendingRef.current;
			pendingRef.current = null;
			if (pending !== null) void window.vetta.uiZoom.set(pending);
		});
	}, []);

	const reset = useCallback(() => setFactor(UI_ZOOM_DEFAULT), [setFactor]);

	return { factor, loaded, setFactor, reset };
}

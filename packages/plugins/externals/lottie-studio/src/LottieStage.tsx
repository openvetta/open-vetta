import { useEffect, useRef, useState } from "react";
import type { Color, ManagedSkottieAnimation, Rect, Surface } from "canvaskit-wasm/full";
import { loadCanvasKit } from "./canvaskit";

// Cap the canvas backing store so a huge composition can't allocate an enormous
// GPU surface; the zoom view scales the element to fit either way.
const MAX_DIMENSION = 1024;

export interface SkottieController {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	anim: ManagedSkottieAnimation | null;
	ready: boolean;
	error: string | null;
	/** Backing-store size of the canvas (natural pixels), for fit/zoom math. */
	width: number;
	height: number;
	/** Re-draw the current frame immediately (after a slot edit while paused). */
	redraw(): void;
}

export type TickListener = (frame: number) => void;

export interface SkottieResult {
	controller: SkottieController;
	playing: boolean;
	setPlaying: (next: boolean) => void;
	totalFrames: number;
	seek: (frame: number) => void;
	/**
	 * Subscribe to per-frame updates. Used to drive the scrubber + label
	 * imperatively (DOM writes only) so playback never re-renders React.
	 * Fires immediately with the current frame on subscribe.
	 */
	subscribeTick: (listener: TickListener) => () => void;
}

interface InternalState {
	anim: ManagedSkottieAnimation;
	surface: Surface;
	dstRect: Rect;
	transparent: Color;
	fps: number;
	totalFrames: number;
}

/**
 * Owns the CanvasKit/Skottie animation for one document. `jsonText` is the
 * source of truth; changing it rebuilds the animation. Playback runs on a
 * single rAF loop that draws imperatively and pushes the current frame to tick
 * listeners — no React state churn per frame.
 */
export function useSkottie(jsonText: string): SkottieResult {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const stateRef = useRef<InternalState | null>(null);
	const playingRef = useRef(true);
	const frameRef = useRef(0);
	const lastTickRef = useRef(0);
	const loopRef = useRef(0);
	const startRef = useRef<() => void>(() => {});
	const stopRef = useRef<() => void>(() => {});
	const listenersRef = useRef<Set<TickListener>>(new Set());

	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [anim, setAnim] = useState<ManagedSkottieAnimation | null>(null);
	const [playing, setPlayingState] = useState(true);
	const [totalFrames, setTotalFrames] = useState(1);
	const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

	const notify = (): void => {
		for (const listener of listenersRef.current) listener(frameRef.current);
	};

	const drawCurrent = (): void => {
		const s = stateRef.current;
		if (!s) return;
		const canvas = s.surface.getCanvas();
		canvas.clear(s.transparent);
		s.anim.seekFrame(frameRef.current);
		s.anim.render(canvas, s.dstRect);
		s.surface.flush();
	};

	useEffect(() => {
		let cancelled = false;
		setReady(false);
		setError(null);
		setAnim(null);

		void loadCanvasKit()
			.then((ck) => {
				if (cancelled) return;
				const canvasEl = canvasRef.current;
				if (!canvasEl) return;

				let animation: ManagedSkottieAnimation;
				try {
					animation = ck.MakeManagedAnimation(jsonText);
				} catch (err) {
					setError(`无法解析动画：${(err as Error).message}`);
					return;
				}
				if (!animation) {
					setError("无法解析动画（Skottie 返回空）。");
					return;
				}

				const [aw, ah] = animation.size();
				const scale = Math.min(1, MAX_DIMENSION / Math.max(aw || 1, ah || 1));
				const w = Math.max(1, Math.round((aw || MAX_DIMENSION) * scale));
				const h = Math.max(1, Math.round((ah || MAX_DIMENSION) * scale));
				canvasEl.width = w;
				canvasEl.height = h;

				const surface = ck.MakeWebGLCanvasSurface(canvasEl) ?? ck.MakeSWCanvasSurface(canvasEl);
				if (!surface) {
					animation.delete();
					setError("无法创建渲染画布（WebGL 不可用）。");
					return;
				}

				const fps = animation.fps() || 30;
				const total = Math.max(1, Math.round(animation.duration() * fps));
				stateRef.current = {
					anim: animation,
					surface,
					dstRect: ck.LTRBRect(0, 0, w, h),
					transparent: ck.TRANSPARENT,
					fps,
					totalFrames: total,
				};
				frameRef.current = 0;
				lastTickRef.current = performance.now();
				setSize({ w, h });
				setTotalFrames(total);
				setAnim(animation);
				setReady(true);

				const tick = (now: number): void => {
					const s = stateRef.current;
					if (!s) return;
					const dt = (now - lastTickRef.current) / 1000;
					lastTickRef.current = now;
					frameRef.current = (frameRef.current + dt * s.fps) % s.totalFrames;
					drawCurrent();
					notify();
					loopRef.current = requestAnimationFrame(tick);
				};
				startRef.current = (): void => {
					lastTickRef.current = performance.now();
					cancelAnimationFrame(loopRef.current);
					loopRef.current = requestAnimationFrame(tick);
				};
				stopRef.current = (): void => {
					cancelAnimationFrame(loopRef.current);
					loopRef.current = 0;
				};

				drawCurrent();
				notify();
				if (playingRef.current) startRef.current();
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(`CanvasKit 初始化失败：${(err as Error).message}`);
			});

		return () => {
			cancelled = true;
			cancelAnimationFrame(loopRef.current);
			loopRef.current = 0;
			startRef.current = () => {};
			stopRef.current = () => {};
			const s = stateRef.current;
			stateRef.current = null;
			if (s) {
				s.surface.delete();
				s.anim.delete();
			}
		};
	}, [jsonText]);

	const setPlaying = (next: boolean): void => {
		playingRef.current = next;
		setPlayingState(next);
		if (next) startRef.current();
		else stopRef.current();
	};

	const seek = (target: number): void => {
		frameRef.current = Math.max(0, Math.min(totalFrames - 1, target));
		drawCurrent();
		notify();
	};

	const subscribeTick = (listener: TickListener): (() => void) => {
		listenersRef.current.add(listener);
		listener(frameRef.current);
		return () => {
			listenersRef.current.delete(listener);
		};
	};

	return {
		controller: { canvasRef, anim, ready, error, width: size.w, height: size.h, redraw: drawCurrent },
		playing,
		setPlaying,
		totalFrames,
		seek,
		subscribeTick,
	};
}

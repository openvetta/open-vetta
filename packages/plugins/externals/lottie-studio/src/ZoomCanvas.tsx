import { type ReactNode, useCallback, useEffect, useReducer, useRef } from "react";

const MIN_SCALE = 0.05;
const MAX_SCALE = 16;
const WHEEL_FACTOR = 0.0015;
const STEP = 1.2;
const PADDING = 24;

interface ZoomCanvasProps {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	/** Natural (backing-store) size of the canvas; 0/0 until ready. */
	naturalSize: { w: number; h: number };
	ready: boolean;
	error: string | null;
	/** Overlay rendered at the top-right of the stage (e.g. the 属性 toggle). */
	topRight?: ReactNode;
	/** Free overlay layer (e.g. the floating slot panel). */
	children?: ReactNode;
}

const clamp = (v: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

/**
 * A pannable / zoomable viewport around the Skottie canvas. The canvas keeps its
 * fixed backing-store size; this scales+translates it via a GPU transform so
 * nothing is ever clipped (auto-fit centers it with padding), with cursor-
 * anchored wheel-zoom, drag-to-pan and a percentage toolbar.
 *
 * scale/offset live in refs and are committed together in one render — never as
 * nested setState updaters (which drop the offset under React batching, making
 * the zoom appear to pin to the viewport center instead of the cursor).
 */
export function ZoomCanvas({ canvasRef, naturalSize, ready, error, topRight, children }: ZoomCanvasProps) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const scaleRef = useRef(1);
	const offsetRef = useRef({ x: 0, y: 0 });
	const autoFitRef = useRef(true);
	const sizeRef = useRef({ vw: 0, vh: 0 });
	const natRef = useRef(naturalSize);
	natRef.current = naturalSize;
	const panRef = useRef({ active: false, x: 0, y: 0, ox: 0, oy: 0 });
	const [, render] = useReducer((c: number) => c + 1, 0);

	const commit = useCallback(
		(scale: number, offset: { x: number; y: number }) => {
			scaleRef.current = scale;
			offsetRef.current = offset;
			render();
		},
		[],
	);

	const fit = useCallback(() => {
		const { vw, vh } = sizeRef.current;
		const { w, h } = natRef.current;
		if (!vw || !vh || !w || !h) return;
		const s = clamp(Math.min((vw - PADDING * 2) / w, (vh - PADDING * 2) / h) || 1);
		autoFitRef.current = true;
		commit(s, { x: (vw - w * s) / 2, y: (vh - h * s) / 2 });
	}, [commit]);

	/** Zoom to `nextScale`, keeping the content point under (ax, ay) fixed. */
	const zoomTo = useCallback(
		(nextScale: number, ax: number, ay: number) => {
			const prev = scaleRef.current;
			const s = clamp(nextScale);
			const ratio = s / prev;
			const o = offsetRef.current;
			autoFitRef.current = false;
			commit(s, { x: ax - ratio * (ax - o.x), y: ay - ratio * (ay - o.y) });
		},
		[commit],
	);

	// Refit when the animation size becomes known or changes.
	useEffect(() => {
		if (naturalSize.w && naturalSize.h) fit();
	}, [naturalSize.w, naturalSize.h, fit]);

	// Track viewport size; refit while in auto-fit mode (panel resize, etc.).
	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const r = entries[0].contentRect;
			sizeRef.current = { vw: r.width, vh: r.height };
			if (autoFitRef.current) fit();
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [fit]);

	// Cursor-anchored wheel zoom. Native listener so we can preventDefault.
	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent): void => {
			e.preventDefault();
			const rect = el.getBoundingClientRect();
			zoomTo(scaleRef.current * (1 - e.deltaY * WHEEL_FACTOR), e.clientX - rect.left, e.clientY - rect.top);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [zoomTo]);

	const onPointerDown = (e: React.PointerEvent): void => {
		if (e.button !== 0) return;
		viewportRef.current?.setPointerCapture(e.pointerId);
		const o = offsetRef.current;
		panRef.current = { active: true, x: e.clientX, y: e.clientY, ox: o.x, oy: o.y };
		autoFitRef.current = false;
		render();
	};
	const onPointerMove = (e: React.PointerEvent): void => {
		const p = panRef.current;
		if (!p.active) return;
		commit(scaleRef.current, { x: p.ox + (e.clientX - p.x), y: p.oy + (e.clientY - p.y) });
	};
	const onPointerUp = (e: React.PointerEvent): void => {
		panRef.current.active = false;
		viewportRef.current?.releasePointerCapture(e.pointerId);
		render();
	};

	const zoomFromCenter = (factor: number): void =>
		zoomTo(scaleRef.current * factor, sizeRef.current.vw / 2, sizeRef.current.vh / 2);

	const scale = scaleRef.current;
	const offset = offsetRef.current;
	const pct = Math.round(scale * 100);

	return (
		<div className="relative flex min-h-0 flex-1 overflow-hidden" style={{ background: "var(--background)" }}>
			<div
				ref={viewportRef}
				className="relative min-h-0 flex-1 overflow-hidden"
				style={{ cursor: panRef.current.active ? "grabbing" : "grab", touchAction: "none" }}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
			>
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: naturalSize.w || undefined,
						height: naturalSize.h || undefined,
						transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
						transformOrigin: "0 0",
						willChange: "transform",
					}}
				>
					<canvas
						ref={canvasRef}
						className="block h-full w-full"
						style={{ visibility: ready && !error ? "visible" : "hidden" }}
					/>
				</div>

				{error && (
					<div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px]" style={{ color: "var(--destructive, #ef4444)" }}>
						{error}
					</div>
				)}
				{!ready && !error && (
					<div className="absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: "var(--muted-foreground)" }}>
						加载渲染器…
					</div>
				)}
			</div>

			{topRight && <div className="absolute right-2.5 top-2.5 z-20">{topRight}</div>}
			{children}

			{ready && !error && (
				<div
					className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg px-1 py-0.5 backdrop-blur-md"
					style={{ background: "color-mix(in srgb, var(--background) 78%, transparent)", border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)" }}
				>
					<ZoomBtn label="缩小" onClick={() => zoomFromCenter(1 / STEP)}>
						<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14" /></svg>
					</ZoomBtn>
					<button
						type="button"
						title="重置为适应窗口"
						onClick={fit}
						className="min-w-[3.25rem] rounded-md px-1 py-1 text-center text-[11px] tabular-nums transition-colors hover:text-foreground"
						style={{ color: "var(--muted-foreground)" }}
					>
						{pct}%
					</button>
					<ZoomBtn label="放大" onClick={() => zoomFromCenter(STEP)}>
						<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
					</ZoomBtn>
					<div className="mx-0.5 h-3.5 w-px" style={{ background: "color-mix(in srgb, var(--foreground) 14%, transparent)" }} />
					<ZoomBtn label="适应窗口" onClick={fit}>
						<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
							<rect x="3" y="5" width="18" height="14" rx="2" />
							<rect x="8.5" y="9.5" width="7" height="5" rx="1" />
						</svg>
					</ZoomBtn>
				</div>
			)}
		</div>
	);
}

function ZoomBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
	return (
		<button
			type="button"
			title={label}
			onClick={onClick}
			className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:text-foreground"
			style={{ color: "var(--muted-foreground)" }}
		>
			{children}
		</button>
	);
}

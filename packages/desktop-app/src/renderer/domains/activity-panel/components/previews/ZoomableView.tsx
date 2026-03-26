import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.1;
const ZOOM_WHEEL_FACTOR = 0.002;

interface ZoomableViewProps {
	children: React.ReactNode;
}

export function ZoomableView({ children }: ZoomableViewProps): JSX.Element {
	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const spaceDownRef = useRef(false);
	const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

	// ─── Space key tracking ───
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Space" && !e.repeat) {
				e.preventDefault();
				spaceDownRef.current = true;
				container.style.cursor = "grab";
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				spaceDownRef.current = false;
				if (!isPanning) {
					container.style.cursor = "";
				}
			}
		};

		container.addEventListener("keydown", onKeyDown);
		container.addEventListener("keyup", onKeyUp);
		return () => {
			container.removeEventListener("keydown", onKeyDown);
			container.removeEventListener("keyup", onKeyUp);
		};
	}, [isPanning]);

	// ─── Wheel handling: Cmd/Ctrl + wheel → zoom, plain wheel → pan ───
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();

			if (e.metaKey || e.ctrlKey) {
				// Zoom centered on cursor
				const rect = container.getBoundingClientRect();
				const cursorX = e.clientX - rect.left;
				const cursorY = e.clientY - rect.top;

				setScale((prev) => {
					const delta = -e.deltaY * ZOOM_WHEEL_FACTOR;
					const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta * prev));
					const ratio = next / prev;

					setOffset((o) => ({
						x: cursorX - ratio * (cursorX - o.x),
						y: cursorY - ratio * (cursorY - o.y),
					}));

					return next;
				});
			} else {
				// Pan (scroll) content
				setOffset((o) => ({
					x: o.x - e.deltaX,
					y: o.y - e.deltaY,
				}));
			}
		};

		container.addEventListener("wheel", onWheel, { passive: false });
		return () => container.removeEventListener("wheel", onWheel);
	}, []);

	// ─── Space + drag → pan ───
	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (!spaceDownRef.current) return;
			e.preventDefault();
			setIsPanning(true);
			panStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };

			const container = containerRef.current;
			if (container) container.style.cursor = "grabbing";

			const onPointerMove = (ev: PointerEvent) => {
				const dx = ev.clientX - panStartRef.current.x;
				const dy = ev.clientY - panStartRef.current.y;
				setOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
			};
			const onPointerUp = () => {
				setIsPanning(false);
				document.removeEventListener("pointermove", onPointerMove);
				document.removeEventListener("pointerup", onPointerUp);
				if (container) container.style.cursor = spaceDownRef.current ? "grab" : "";
			};
			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
		},
		[offset],
	);

	// ─── Toolbar actions ───
	const zoomIn = useCallback(() => {
		setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP));
	}, []);

	const zoomOut = useCallback(() => {
		setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP));
	}, []);

	const resetView = useCallback(() => {
		setScale(1);
		setOffset({ x: 0, y: 0 });
	}, []);

	const toggleFullscreen = useCallback(() => {
		setIsFullscreen((prev) => !prev);
	}, []);

	// Exit CSS fullscreen on Escape key
	useEffect(() => {
		if (!isFullscreen) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				setIsFullscreen(false);
			}
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [isFullscreen]);

	const pct = Math.round(scale * 100);
	const isViewModified = scale !== 1 || offset.x !== 0 || offset.y !== 0;

	return (
		<div
			ref={containerRef}
			tabIndex={0}
			className={
				isFullscreen
					? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background outline-none"
					: "relative flex flex-1 flex-col overflow-hidden bg-background outline-none"
			}
			onPointerDown={onPointerDown}
		>
			{/* Zoomable / pannable content */}
			<div className="flex-1 overflow-hidden">
				<div
					ref={contentRef}
					style={{
						transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
						transformOrigin: "0 0",
					}}
				>
					{children}
				</div>
			</div>

			{/* ─── Bottom zoom toolbar ─── */}
			<div className="sticky bottom-0 z-10 flex items-center justify-center gap-1 border-t border-border bg-background px-2 py-1.5">
				<button
					type="button"
					onClick={zoomOut}
					title="缩小"
					className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
				>
					<span className="icon-[mdi--minus] text-[14px]" />
				</button>

				<button
					type="button"
					onClick={resetView}
					title="重置缩放"
					className="min-w-[44px] rounded px-1.5 py-0.5 text-center text-[11px] tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					{pct}%
				</button>

				<button
					type="button"
					onClick={zoomIn}
					title="放大"
					className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
				>
					<span className="icon-[mdi--plus] text-[14px]" />
				</button>

				<div className="mx-1 h-3.5 w-px bg-border" />

				<button
					type="button"
					onClick={toggleFullscreen}
					title={isFullscreen ? "退出全屏" : "全屏"}
					className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
				>
					<span
						className={`${isFullscreen ? "icon-[mdi--fullscreen-exit]" : "icon-[mdi--fullscreen]"} text-[14px]`}
					/>
				</button>

				{isViewModified && (
					<>
						<div className="mx-1 h-3.5 w-px bg-border" />
						<button
							type="button"
							onClick={resetView}
							title="重置视图"
							className="flex h-6 items-center gap-1 rounded px-1.5 text-muted-foreground/50 hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[mdi--fit-to-screen-outline] text-[14px]" />
							<span className="text-[11px]">重置</span>
						</button>
					</>
				)}
			</div>
		</div>
	);
}

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
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const spaceDownRef = useRef(false);
	const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

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
				if (!isPanning) container.style.cursor = "";
			}
		};

		container.addEventListener("keydown", onKeyDown);
		container.addEventListener("keyup", onKeyUp);
		return () => {
			container.removeEventListener("keydown", onKeyDown);
			container.removeEventListener("keyup", onKeyUp);
		};
	}, [isPanning]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();

			if (e.metaKey || e.ctrlKey) {
				const rect = container.getBoundingClientRect();
				const cursorX = e.clientX - rect.left;
				const cursorY = e.clientY - rect.top;

				setScale((prev) => {
					const delta = -e.deltaY * ZOOM_WHEEL_FACTOR;
					const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta * prev));
					const ratio = next / prev;

					setOffset((current) => ({
						x: cursorX - ratio * (cursorX - current.x),
						y: cursorY - ratio * (cursorY - current.y),
					}));

					return next;
				});
			} else {
				setOffset((current) => ({
					x: current.x - e.deltaX,
					y: current.y - e.deltaY,
				}));
			}
		};

		container.addEventListener("wheel", onWheel, { passive: false });
		return () => container.removeEventListener("wheel", onWheel);
	}, []);

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

	const zoomIn = useCallback(() => setScale((value) => Math.min(MAX_SCALE, value + ZOOM_STEP)), []);
	const zoomOut = useCallback(() => setScale((value) => Math.max(MIN_SCALE, value - ZOOM_STEP)), []);
	const resetView = useCallback(() => {
		setScale(1);
		setOffset({ x: 0, y: 0 });
	}, []);
	const toggleFullscreen = useCallback(() => setIsFullscreen((value) => !value), []);

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
					? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--background)] outline-none"
					: "relative flex flex-1 flex-col overflow-hidden bg-[var(--background)] outline-none"
			}
			onPointerDown={onPointerDown}
		>
			<div className="flex-1 overflow-hidden">
				<div
					style={{
						transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
						transformOrigin: "0 0",
					}}
				>
					{children}
				</div>
			</div>

			<div className="sticky bottom-0 z-10 flex items-center justify-center gap-1 border-t border-[var(--border)] bg-[var(--background)] px-2 py-1.5">
				<ToolButton label="-" title="缩小" onClick={zoomOut} />
				<button
					type="button"
					onClick={resetView}
					title="重置缩放"
					className="min-w-[44px] rounded px-1.5 py-0.5 text-center text-[11px] tabular-nums text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
				>
					{pct}%
				</button>
				<ToolButton label="+" title="放大" onClick={zoomIn} />
				<div className="mx-1 h-3.5 w-px bg-[var(--border)]" />
				<ToolButton label={isFullscreen ? "Exit" : "Full"} title={isFullscreen ? "退出全屏" : "全屏"} onClick={toggleFullscreen} wide />
				{isViewModified && (
					<>
						<div className="mx-1 h-3.5 w-px bg-[var(--border)]" />
						<ToolButton label="重置" title="重置视图" onClick={resetView} wide />
					</>
				)}
			</div>
		</div>
	);
}

function ToolButton({
	label,
	title,
	onClick,
	wide,
}: {
	label: string;
	title: string;
	onClick: () => void;
	wide?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={
				wide
					? "flex h-6 items-center justify-center rounded px-1.5 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
					: "flex h-6 w-6 items-center justify-center rounded text-[14px] text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
			}
		>
			{label}
		</button>
	);
}

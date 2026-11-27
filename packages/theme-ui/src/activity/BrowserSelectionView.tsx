import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}
interface BrowserSelectionViewProps {
	mode: "element" | "region";
	viewport: { width: number; height: number };
	rect: Rect | null;
	disabled: boolean;
	label: string;
	onInspect: (x: number, y: number, lock: boolean) => void;
	onRegionChange: (rect: Rect) => void;
	onScroll: (x: number, y: number, point: { x: number; y: number }) => void;
}

/** Host overlay intercepts pointer input; selecting never clicks the guest page. */
export function BrowserSelectionView({
	mode,
	viewport,
	rect,
	disabled,
	label,
	onInspect,
	onRegionChange,
	onScroll,
}: BrowserSelectionViewProps) {
	const surface = useRef<HTMLDivElement>(null);
	const drag = useRef<{
		x: number;
		y: number;
		clientX: number;
		clientY: number;
		rect: Rect | null;
		action: string;
		pending: boolean;
	} | null>(null);
	useEffect(() => {
		const node = surface.current;
		if (!node) return;
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			if (!disabled && !drag.current && mode === "element") {
				const bounds = node.getBoundingClientRect();
				onScroll(event.deltaX, event.deltaY, {
					x: ((event.clientX - bounds.left) * viewport.width) / (bounds.width || 1),
					y: ((event.clientY - bounds.top) * viewport.height) / (bounds.height || 1),
				});
			}
		};
		node.addEventListener("wheel", wheel, { passive: false });
		return () => node.removeEventListener("wheel", wheel);
	}, [mode, disabled, onScroll, viewport.width, viewport.height]);
	const point = (event: PointerEvent) => {
		const bounds = surface.current?.getBoundingClientRect();
		return {
			x: Math.max(
				0,
				Math.min(viewport.width, ((event.clientX - (bounds?.left ?? 0)) * viewport.width) / (bounds?.width || 1)),
			),
			y: Math.max(
				0,
				Math.min(viewport.height, ((event.clientY - (bounds?.top ?? 0)) * viewport.height) / (bounds?.height || 1)),
			),
		};
	};
	const move = (event: PointerEvent) => {
		if (disabled) return;
		const current = point(event),
			start = drag.current;
		if (!start && mode === "element") {
			void onInspect(current.x, current.y, false);
			return;
		}
		if (!start) return;
		if (start.pending) {
			if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < 4) return;
			start.pending = false;
		}
		if (start.action === "move" && start.rect) {
			onRegionChange({
				...start.rect,
				x: Math.max(0, Math.min(viewport.width - start.rect.width, start.rect.x + current.x - start.x)),
				y: Math.max(0, Math.min(viewport.height - start.rect.height, start.rect.y + current.y - start.y)),
			});
			return;
		}
		let anchorX = start.x,
			anchorY = start.y;
		if (start.rect && start.action !== "new") {
			anchorX = start.action.includes("w") ? start.rect.x + start.rect.width : start.rect.x;
			anchorY = start.action.includes("n") ? start.rect.y + start.rect.height : start.rect.y;
		}
		onRegionChange({
			x: Math.min(anchorX, current.x),
			y: Math.min(anchorY, current.y),
			width: Math.abs(current.x - anchorX),
			height: Math.abs(current.y - anchorY),
		});
	};
	return (
			<div
				ref={surface}
				role="application"
				aria-label={label}
				tabIndex={0}
				className="absolute inset-0 z-10 cursor-crosshair touch-none select-none"
				onPointerDown={(event) => {
					if (disabled || event.button !== 0) return;
					event.preventDefault();
					const current = point(event);
					const action =
						mode === "region" && event.target instanceof HTMLElement
							? (event.target.dataset.captureAction ?? "new")
							: "new";
					drag.current = {
						...current,
						clientX: event.clientX,
						clientY: event.clientY,
						rect,
						action,
						pending: mode === "element",
					};
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={move}
				onPointerUp={(event) => {
					if (drag.current) move(event);
					if (!disabled && drag.current?.pending) {
						const current = point(event);
						void onInspect(current.x, current.y, true);
					}
					drag.current = null;
					if (event.currentTarget.hasPointerCapture(event.pointerId))
						event.currentTarget.releasePointerCapture(event.pointerId);
				}}
				onPointerCancel={() => {
					drag.current = null;
				}}
			>
				{rect ? (
					<svg
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 h-full w-full fill-background/60"
						viewBox={`0 0 ${viewport.width} ${viewport.height}`}
						preserveAspectRatio="none"
					>
						<path
							fillRule="evenodd"
							d={`M0 0H${viewport.width}V${viewport.height}H0Z M${rect.x} ${rect.y}h${rect.width}v${rect.height}h${-rect.width}Z`}
						/>
					</svg>
				) : null}
				{rect ? (
					<div
						data-capture-action="move"
						className={`absolute border-3 border-browser-selection ${mode === "region" ? "cursor-move" : "cursor-crosshair"}`}
						style={{
							left: `${(rect.x / viewport.width) * 100}%`,
							top: `${(rect.y / viewport.height) * 100}%`,
							width: `${(rect.width / viewport.width) * 100}%`,
							height: `${(rect.height / viewport.height) * 100}%`,
						}}
					>
						{mode === "region"
							? ["nw", "ne", "sw", "se"].map((corner) => (
									<span
										key={corner}
										data-capture-action={corner}
										className="absolute h-3 w-3 rounded-full border border-browser-selection bg-background"
										style={{
											left: corner.includes("w") ? -6 : undefined,
											right: corner.includes("e") ? -6 : undefined,
											top: corner.includes("n") ? -6 : undefined,
											bottom: corner.includes("s") ? -6 : undefined,
											cursor: `${corner}-resize`,
										}}
									/>
								))
							: null}
					</div>
				) : null}
			</div>
	);
}

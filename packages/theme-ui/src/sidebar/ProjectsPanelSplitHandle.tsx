import { useCallback, useRef, type JSX, type PointerEvent as ReactPointerEvent } from "react";

export interface ProjectsPanelSplitHandleProps {
	onResize: (deltaY: number) => void;
	onResizeEnd?: () => void;
}

export function ProjectsPanelSplitHandle({
	onResize,
	onResizeEnd,
}: ProjectsPanelSplitHandleProps): JSX.Element {
	const startYRef = useRef(0);

	const onPointerDown = useCallback(
		(event: ReactPointerEvent) => {
			event.preventDefault();
			startYRef.current = event.clientY;

			const overlay = document.createElement("div");
			overlay.style.position = "fixed";
			overlay.style.inset = "0";
			overlay.style.zIndex = "9999";
			overlay.style.cursor = "row-resize";
			document.body.appendChild(overlay);

			const onPointerMove = (ev: PointerEvent) => {
				const delta = ev.clientY - startYRef.current;
				startYRef.current = ev.clientY;
				onResize(delta);
			};

			const onPointerUp = () => {
				document.removeEventListener("pointermove", onPointerMove);
				document.removeEventListener("pointerup", onPointerUp);
				overlay.remove();
				document.body.style.userSelect = "";
				onResizeEnd?.();
			};

			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
			document.body.style.userSelect = "none";
		},
		[onResize, onResizeEnd],
	);

	const lineGradient =
		"linear-gradient(to right, transparent, color-mix(in srgb, var(--primary) 28%, transparent) 50%, transparent)";
	const glowGradient =
		"linear-gradient(to right, transparent, color-mix(in srgb, var(--primary) 15%, transparent) 50%, transparent)";
	const fadeStyle = {
		transition: "opacity 380ms cubic-bezier(0.22, 0.61, 0.36, 1)",
		willChange: "opacity",
	} as const;

	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			onPointerDown={onPointerDown}
			className="group relative z-20 h-[8px] w-full shrink-0 cursor-row-resize"
		>
			<div
				aria-hidden
				className="pointer-events-none absolute left-1/2 top-1/2 h-[5px] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 blur-[4px] group-hover:opacity-100 group-active:opacity-100"
				style={{ ...fadeStyle, background: glowGradient }}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[60%] -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-active:opacity-100"
				style={{ ...fadeStyle, background: lineGradient }}
			/>
		</div>
	);
}

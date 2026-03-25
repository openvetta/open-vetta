import { useCallback, useRef } from "react";

interface ResizeHandleProps {
	side: "left" | "right";
	onResize: (delta: number) => void;
	onResizeEnd?: () => void;
}

export function ResizeHandle({ side, onResize, onResizeEnd }: ResizeHandleProps): JSX.Element {
	const startXRef = useRef(0);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			startXRef.current = e.clientX;

			const onPointerMove = (ev: PointerEvent) => {
				const delta = ev.clientX - startXRef.current;
				startXRef.current = ev.clientX;
				// "right" handle: dragging right = panel grows = positive delta
				// "left" handle: dragging left = panel grows = negative delta → invert
				onResize(side === "right" ? delta : -delta);
			};

			const onPointerUp = () => {
				document.removeEventListener("pointermove", onPointerMove);
				document.removeEventListener("pointerup", onPointerUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
				onResizeEnd?.();
			};

			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		},
		[side, onResize, onResizeEnd],
	);

	return (
		<div
			onPointerDown={onPointerDown}
			className={`absolute top-0 bottom-0 z-20 w-[5px] cursor-col-resize ${
				side === "right" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"
			}`}
		>
			<div className="h-full w-px mx-auto bg-transparent hover:bg-[var(--accent-dim)] transition-colors" />
		</div>
	);
}

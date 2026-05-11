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

	const edge = side === "right" ? "right-0" : "left-0";
	return (
		<div
			onPointerDown={onPointerDown}
			className={`group absolute top-0 bottom-0 z-30 w-[8px] cursor-col-resize ${edge}`}
		>
			{/* 光晕（更宽、blur 模糊） */}
			<div
				aria-hidden
				className={`pointer-events-none absolute ${edge} top-1/2 h-[55%] w-[4px] -translate-y-1/2 rounded-full opacity-0 blur-[3px] transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100`}
				style={{
					background:
						"linear-gradient(to bottom, transparent, var(--primary) 50%, transparent)",
				}}
			/>
			{/* 锐利提示线（1px、贴 sidebar 边框，中间到两端 fade） */}
			<div
				aria-hidden
				className={`pointer-events-none absolute ${edge} top-1/2 h-[60%] w-px -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100`}
				style={{
					background:
						"linear-gradient(to bottom, transparent, var(--primary) 50%, transparent)",
				}}
			/>
		</div>
	);
}

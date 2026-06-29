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

			// 拖拽期间铺一层全屏遮罩：<webview> 等独立 WebContents 会吞掉划过其上的鼠标事件，
			// 导致 pointermove/up 到不了 document（拖到面板里的 webview 上会卡顿、松手仍跟随）。
			// 遮罩挡在最上层接住事件并冒泡到 document，松手即移除。
			const overlay = document.createElement("div");
			overlay.style.position = "fixed";
			overlay.style.inset = "0";
			overlay.style.zIndex = "9999";
			overlay.style.cursor = "col-resize";
			document.body.appendChild(overlay);

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
				overlay.remove();
				document.body.style.userSelect = "";
				onResizeEnd?.();
			};

			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
			document.body.style.userSelect = "none";
		},
		[side, onResize, onResizeEnd],
	);

	const edge = side === "right" ? "right-0" : "left-0";
	const lineGradient =
		"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--primary) 28%, transparent) 50%, transparent)";
	const glowGradient =
		"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--primary) 15%, transparent) 50%, transparent)";
	const fadeStyle = {
		transition: "opacity 380ms cubic-bezier(0.22, 0.61, 0.36, 1)",
		willChange: "opacity",
	} as const;
	return (
		<div
			onPointerDown={onPointerDown}
			className={`group absolute top-0 bottom-0 z-30 w-[8px] cursor-col-resize ${edge}`}
		>
			{/* 光晕（更宽、blur 模糊） */}
			<div
				aria-hidden
				className={`pointer-events-none absolute ${edge} top-1/2 h-[55%] w-[5px] -translate-y-1/2 rounded-full opacity-0 blur-[4px] group-hover:opacity-100 group-active:opacity-100`}
				style={{ ...fadeStyle, background: glowGradient }}
			/>
			{/* 锐利提示线（1px、贴 sidebar 边框，中间到两端 fade） */}
			<div
				aria-hidden
				className={`pointer-events-none absolute ${edge} top-1/2 h-[60%] w-px -translate-y-1/2 opacity-0 group-hover:opacity-100 group-active:opacity-100`}
				style={{ ...fadeStyle, background: lineGradient }}
			/>
		</div>
	);
}

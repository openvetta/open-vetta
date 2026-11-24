import { useRef } from "react";

/**
 * Thin drag handle for a splitter. Reports incremental deltas along the split
 * axis: `vertical` (a column divider, reports X) or `horizontal` (a row
 * divider, reports Y).
 */
export function SplitHandle({
	onDrag,
	onDragStart,
	orientation = "vertical",
	title,
}: {
	onDrag: (delta: number) => void;
	/** Called once when the drag begins — the moment to snapshot current sizes. */
	onDragStart?: () => void;
	orientation?: "vertical" | "horizontal";
	/** Optional hint shown on hover; omit for purely decorative dividers. */
	title?: string;
}): JSX.Element {
	const last = useRef(0);

	const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
		event.preventDefault();
		onDragStart?.();
		last.current = orientation === "vertical" ? event.clientX : event.clientY;
		const move = (ev: PointerEvent): void => {
			const current = orientation === "vertical" ? ev.clientX : ev.clientY;
			onDrag(current - last.current);
			last.current = current;
		};
		const up = (): void => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	return (
		<div
			onPointerDown={onPointerDown}
			title={title}
			className={
				orientation === "vertical"
					? "absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-accent"
					: "absolute bottom-0 left-0 z-10 h-1 w-full cursor-row-resize bg-transparent transition-colors hover:bg-accent"
			}
		/>
	);
}

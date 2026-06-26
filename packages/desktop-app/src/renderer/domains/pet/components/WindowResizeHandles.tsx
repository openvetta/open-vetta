import type { PointerEvent as ReactPointerEvent } from "react";
import { normalizePetSize } from "../../../../shared/pet-config";
import type { PetResizeCorner } from "../../../../shared/pet-ipc";

export function WindowResizeHandles({
	size,
	onSizeChange,
}: {
	size: number;
	onSizeChange: (size: number) => void;
}): JSX.Element {
	const handlePointerDown = (corner: PetResizeCorner) => (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const startX = event.screenX;
		const startY = event.screenY;
		const startSize = size;
		const xDirection = corner.endsWith("right") ? 1 : -1;
		const yDirection = corner.startsWith("bottom") ? 1 : -1;
		let lastSize = startSize;
		let pendingSize = startSize;
		let animationFrame: number | undefined;
		const resizeSessionReady = window.vettaPet?.beginWindowResize(corner) ?? Promise.resolve();

		const flushSize = () => {
			animationFrame = undefined;
			void resizeSessionReady.then(() => window.vettaPet?.setWindowSize(pendingSize, corner));
		};
		const scheduleSizeChange = (nextSize: number) => {
			pendingSize = nextSize;
			if (animationFrame != null) return;
			animationFrame = window.requestAnimationFrame(flushSize);
		};

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = (moveEvent.screenX - startX) * xDirection;
			const deltaY = (moveEvent.screenY - startY) * yDirection;
			const nextSize = normalizePetSize(startSize + Math.max(deltaX, deltaY));
			if (nextSize === lastSize) return;
			lastSize = nextSize;
			onSizeChange(nextSize);
			scheduleSizeChange(nextSize);
		};
		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerUp);
			if (animationFrame != null) {
				window.cancelAnimationFrame(animationFrame);
			}
			void resizeSessionReady
				.then(() => window.vettaPet?.setWindowSize(lastSize, corner))
				.then(() => window.vettaPet?.endWindowResize(lastSize));
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("pointercancel", handlePointerUp);
	};
	const baseClass = "no-drag absolute z-40 size-6 bg-primary/25";

	return (
		<>
			<div
				className={`${baseClass} left-0 top-0 cursor-nwse-resize`}
				onPointerDown={handlePointerDown("top-left")}
			/>
			<div
				className={`${baseClass} right-0 top-0 cursor-nesw-resize`}
				onPointerDown={handlePointerDown("top-right")}
			/>
			<div
				className={`${baseClass} bottom-0 left-0 cursor-nesw-resize`}
				onPointerDown={handlePointerDown("bottom-left")}
			/>
			<div
				className={`${baseClass} bottom-0 right-0 cursor-nwse-resize`}
				onPointerDown={handlePointerDown("bottom-right")}
			/>
		</>
	);
}

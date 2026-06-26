import type { PointerEvent as ReactPointerEvent } from "react";
import { normalizePetVideoSizeForWindow } from "../../../../shared/pet-config";
import type { PetActionId } from "../../../../shared/pet-actions";
import type { PetResizeCorner } from "../../../../shared/pet-ipc";

export function VideoResizeHandles({
	actionId,
	baseSize,
	videoScale,
	windowSize,
	onSizeChange,
}: {
	actionId: PetActionId;
	baseSize: number;
	videoScale: number;
	windowSize: number;
	onSizeChange: (size: number) => void;
}): JSX.Element {
	const handlePointerDown = (corner: PetResizeCorner) => (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const startX = event.clientX;
		const startY = event.clientY;
		const startSize = baseSize;
		const xDirection = corner.endsWith("right") ? 1 : -1;
		const yDirection = corner.startsWith("bottom") ? 1 : -1;
		let lastSize = startSize;
		let changed = false;

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = (moveEvent.clientX - startX) * xDirection;
			const deltaY = (moveEvent.clientY - startY) * yDirection;
			const maxBaseSize = windowSize / videoScale;
			const nextSize = normalizePetVideoSizeForWindow(startSize + Math.max(deltaX, deltaY), maxBaseSize);
			if (nextSize === lastSize) return;
			lastSize = nextSize;
			changed = true;
			onSizeChange(nextSize);
		};
		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			if (changed) {
				void window.vettaPet?.setVideoBaseSize(actionId, lastSize);
			}
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};
	const baseClass = "no-drag pointer-events-auto absolute z-40 size-5 bg-amber-500/25";

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

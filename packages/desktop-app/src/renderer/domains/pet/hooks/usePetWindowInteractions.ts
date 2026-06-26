import { type PointerEvent as ReactPointerEvent, type RefObject, useRef, type WheelEvent } from "react";
import type { PetActionId } from "../../../../shared/pet-actions";
import { normalizePetVideoSizeForWindow, PET_VIDEO_SIZE_STEP } from "../../../../shared/pet-config";

function isPointOverElement(element: HTMLElement | null, clientX: number, clientY: number): boolean {
	const bounds = element?.getBoundingClientRect();
	return Boolean(
		bounds && clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom,
	);
}

export function usePetWindowInteractions({
	actionId,
	debugFrame,
	maxVideoSize,
	selectedVideoBaseSize,
	videoRef,
	onVideoBaseSizeChange,
}: {
	actionId: PetActionId | undefined;
	debugFrame: boolean;
	maxVideoSize: number;
	selectedVideoBaseSize: number;
	videoRef: RefObject<HTMLDivElement | null>;
	onVideoBaseSizeChange: (size: number) => void;
}): {
	handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
	handlePointerLeave: () => void;
	handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
	handleWheel: (event: WheelEvent<HTMLDivElement>) => void;
} {
	const isDraggingRef = useRef(false);
	const isPointOverVideo = (clientX: number, clientY: number) =>
		isPointOverElement(videoRef.current, clientX, clientY);
	const updateMousePassthrough = (clientX: number, clientY: number) => {
		if (debugFrame || isDraggingRef.current) {
			void window.vettaPet?.setMousePassthrough(false);
			return;
		}
		void window.vettaPet?.setMousePassthrough(!isPointOverVideo(clientX, clientY));
	};

	const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		if (debugFrame) {
			if (isPointOverVideo(event.clientX, event.clientY) && actionId) {
				const direction = event.deltaY < 0 ? 1 : -1;
				const nextBaseSize = normalizePetVideoSizeForWindow(
					selectedVideoBaseSize + direction * PET_VIDEO_SIZE_STEP,
					maxVideoSize,
				);
				onVideoBaseSizeChange(nextBaseSize);
				void window.vettaPet?.setVideoBaseSize(actionId, nextBaseSize);
				return;
			}
			void window.vettaPet?.resizeByWheel(event.deltaY);
			return;
		}
		if (actionId) {
			void window.vettaPet?.resizeVideoByWheel(actionId, event.deltaY);
		}
	};

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		isDraggingRef.current = true;
		void window.vettaPet?.setMousePassthrough(false);
		const moveSessionReady = window.vettaPet?.beginWindowMove() ?? Promise.resolve();

		const handlePointerMove = (moveEvent: PointerEvent) => {
			moveEvent.preventDefault();
			void moveSessionReady.then(() => window.vettaPet?.moveWindow());
		};
		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerUp);
			isDraggingRef.current = false;
			void moveSessionReady.then(() => window.vettaPet?.endWindowMove());
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("pointercancel", handlePointerUp);
	};

	return {
		handlePointerDown,
		handlePointerLeave: () => {
			if (!debugFrame) {
				void window.vettaPet?.setMousePassthrough(true);
			}
		},
		handlePointerMove: (event) => updateMousePassthrough(event.clientX, event.clientY),
		handleWheel,
	};
}

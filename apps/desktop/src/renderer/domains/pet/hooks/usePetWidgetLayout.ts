import { type RefObject, useEffect, useRef } from "react";
import type { PetContentSize, PetVideoHitbox } from "../../../../shared/pet-ipc";
import { clientRectToHitbox, measurePetContentSize, samePetContentSize, samePetHitbox } from "./pet-widget-content";

export function usePetWidgetLayout({
	shellRef,
	videoRef,
}: {
	shellRef: RefObject<HTMLElement | null>;
	videoRef: RefObject<HTMLElement | null>;
}): void {
	const lastHitboxRef = useRef<PetVideoHitbox | undefined>(undefined);
	const lastContentRef = useRef<PetContentSize | undefined>(undefined);

	useEffect(() => {
		const report = () => {
			const viewport = { width: window.innerWidth, height: window.innerHeight };
			const videoEl = videoRef.current;
			const shellEl = shellRef.current;
			if (shellEl) {
				const content = measurePetContentSize(shellEl.getBoundingClientRect());
				if (!samePetContentSize(lastContentRef.current, content)) {
					lastContentRef.current = content;
					void window.vettaPet?.setContentSize(content);
				}
			}

			const videoHitbox = videoEl ? clientRectToHitbox(videoEl.getBoundingClientRect(), viewport) : undefined;
			if (!samePetHitbox(lastHitboxRef.current, videoHitbox)) {
				lastHitboxRef.current = videoHitbox;
				void window.vettaPet?.setVideoHitbox(videoHitbox);
			}
		};

		const observer = new ResizeObserver(report);
		if (shellRef.current) observer.observe(shellRef.current);
		if (videoRef.current) observer.observe(videoRef.current);
		report();
		window.addEventListener("resize", report);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", report);
			lastHitboxRef.current = undefined;
			lastContentRef.current = undefined;
			void window.vettaPet?.setVideoHitbox(undefined);
		};
	}, [shellRef, videoRef]);
}

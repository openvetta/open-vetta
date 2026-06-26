import { type RefObject, useEffect } from "react";

export function usePetHitbox({
	debugFrame,
	shouldShowVideo,
	videoRef,
}: {
	debugFrame: boolean;
	shouldShowVideo: boolean;
	videoRef: RefObject<HTMLDivElement | null>;
}): void {
	useEffect(() => {
		if (debugFrame || !shouldShowVideo) {
			void window.vettaPet?.setVideoHitbox(undefined);
			return;
		}

		const reportHitbox = () => {
			const bounds = videoRef.current?.getBoundingClientRect();
			if (!bounds) {
				void window.vettaPet?.setVideoHitbox(undefined);
				return;
			}
			void window.vettaPet?.setVideoHitbox({
				x: bounds.left,
				y: bounds.top,
				width: bounds.width,
				height: bounds.height,
			});
		};
		const observer = new ResizeObserver(reportHitbox);
		if (videoRef.current) {
			observer.observe(videoRef.current);
		}
		reportHitbox();
		window.addEventListener("resize", reportHitbox);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", reportHitbox);
			void window.vettaPet?.setVideoHitbox(undefined);
		};
	}, [debugFrame, shouldShowVideo, videoRef]);
}
